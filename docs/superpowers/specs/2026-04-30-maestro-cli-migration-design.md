# Migrate `action-maestro-cloud` to invoke the Maestro CLI

**Status:** Design — pending review
**Author:** @proksh
**Date:** 2026-04-30

## Summary

Replace this Action's direct Maestro Cloud HTTP client with a composite GitHub
Action that shells out to the Maestro CLI, mirroring the architecture already
used by the Bitrise step (`bitrise-step-maestro-cloud-upload`) and the Bitbucket
pipe (`maestro-cloud-upload`).

The migration removes ~700 lines of bespoke TypeScript (HTTP client, status
poller, app-file inspector, workspace zipper) and concentrates platform logic
in two small files: a TypeScript prelude that derives GitHub context, and a
shell script that builds the CLI invocation and parses two outputs from stdout.

This PR ships the code change only. A separate PR cuts the version tag, moves
the rolling `v2` pointer, and rewrites user-facing README sections.

## Motivation

Today this Action talks to Maestro Cloud via `node-fetch` (`ApiClient.ts:103`)
and runs its own polling loop (`StatusPoller.ts`). The two sister CI
integrations (Bitrise step, Bitbucket pipe) install the Maestro CLI and shell
out to `maestro cloud …`. Three independent upload paths means three places to
update when Maestro adds a flag, three places where bugs can diverge, and three
sets of tests that exercise different code.

Consolidating onto the CLI:

- Single upstream surface for new Maestro Cloud features.
- Removes the maintenance burden of a custom HTTP client + poller + retry
  logic in this repo.
- Matches the pattern users see in the bitrise/bitbucket integrations, so
  failure modes look the same across CI providers.

## Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platforms | Linux + macOS GitHub-hosted runners only | Matches actual usage (today's `validate*.yml` only run on `ubuntu-latest`); Windows was never tested. Maestro install script is bash-only. |
| `MAESTRO_CLOUD_FLOW_RESULTS` | **Drop** | CLI exposes no JSON format (`ReportFormat.kt:5–12` — JUNIT/HTML/HTML_DETAILED/NOOP only). Junit-XML reconstruction would lose status fidelity (no `WARNING`/`STOPPED`) and add an XML parser to the prelude. The output is rarely consumed programmatically (awkward to use as JSON-stringified array in YAML). |
| `MAESTRO_CLOUD_UPLOAD_STATUS` | **Drop** | Redundant with the Action's exit code; downstream steps can use `if: failure()` / `if: success()`. |
| `MAESTRO_CLOUD_APP_BINARY_ID` | Keep, parse from CLI stdout (with fallback) | Used by users to chain build → multiple test runs. CLI prints `App binary id: <id>` (`CloudInteractor.kt:402, 423`); we strip ANSI and grep. Fallback: pass through `MDEV_APP_BINARY_ID` when user supplied it (CLI doesn't echo it back when input is given, per `CloudInteractor.kt:139–155`). |
| `MAESTRO_CLOUD_CONSOLE_URL` | Keep, parse from CLI stdout | Used in PR comments / Slack notifications. CLI prints the upload URL (`CloudInteractor.kt:419–420`). |
| `.mobiledev/` legacy workspace fallback | Drop | Predates the `.maestro` rename. Users still on it pass `workspace: .mobiledev` explicitly. |
| Pre-upload APK/IPA validation | Drop | CLI/server validates; error wording differs but failure mode is the same. |
| Per-flow log format | Adopt CLI's | `Passed login.yaml (15s)` (CLI) vs `[Passed] login.yaml` (today). CLI version is strictly more informative (duration, device specs). Documented as a behavior change. |
| Pin Maestro CLI version | Add new optional `maestro-cli-version` input | Reproducible CI requires version pinning; otherwise every run installs whatever the latest CLI emits. Optional, defaults to "latest" (matching today's behavior). Mirrors the Bitrise step's `maestro_cli_version` input (`step.sh:52–57`). The install step exports `MAESTRO_VERSION` from this input — the install script honors it. |
| v1 maintenance | Freeze at current commit | Keeping v1 alive defeats the consolidation goal. Users pin a specific `v1.x.y` tag if they need migration time. |
| Version bump | **Deferred to a separate PR** | This PR ships code only. The bump PR moves the rolling `v2` tag, updates README pin examples, and renames the `[Unreleased]` changelog header. |

## Architecture

`action.yml` becomes a composite action with three steps:

```yaml
runs:
  using: composite
  steps:
    - name: Install Maestro CLI
      shell: bash
      env:
        MAESTRO_VERSION: ${{ inputs.maestro-cli-version }}
      run: |
        curl -Ls --retry 3 --retry-all-errors "https://get.maestro.mobile.dev" | bash
        echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"

    - name: Derive GitHub context
      shell: bash
      run: node "${{ github.action_path }}/dist/prelude.js"
      env:
        # All action inputs are passed in as INPUT_* env vars so the prelude
        # can read them via core.getInput. Composite actions don't auto-expose
        # inputs to nested processes.
        INPUT_API_KEY: ${{ inputs.api-key }}
        INPUT_API_URL: ${{ inputs.api-url }}
        INPUT_PROJECT_ID: ${{ inputs.project-id }}
        INPUT_NAME: ${{ inputs.name }}
        INPUT_APP_FILE: ${{ inputs.app-file }}
        INPUT_APP_BINARY_ID: ${{ inputs.app-binary-id }}
        INPUT_MAPPING_FILE: ${{ inputs.mapping-file }}
        INPUT_WORKSPACE: ${{ inputs.workspace }}
        INPUT_BRANCH: ${{ inputs.branch }}
        INPUT_ENV: ${{ inputs.env }}
        INPUT_ASYNC: ${{ inputs.async }}
        INPUT_ANDROID_API_LEVEL: ${{ inputs.android-api-level }}
        INPUT_IOS_VERSION: ${{ inputs.ios-version }}
        INPUT_DEVICE_LOCALE: ${{ inputs.device-locale }}
        INPUT_DEVICE_MODEL: ${{ inputs.device-model }}
        INPUT_DEVICE_OS: ${{ inputs.device-os }}
        INPUT_INCLUDE_TAGS: ${{ inputs.include-tags }}
        INPUT_EXCLUDE_TAGS: ${{ inputs.exclude-tags }}
        INPUT_TIMEOUT: ${{ inputs.timeout }}

    - name: Run maestro cloud
      shell: bash
      env:
        MDEV_CI: github
      run: "${{ github.action_path }}/scripts/run-cloud.sh"
```

| Step | Owner | Responsibility |
|---|---|---|
| Install | bash | curl-installs the Maestro CLI, prepends `~/.maestro/bin` to `$GITHUB_PATH`. Idempotent re-runs harmless. Pin via `MAESTRO_VERSION` env var (CLI install script honors it). |
| Prelude | `prelude.ts` (bundled to `dist/prelude.js`) | Reads action inputs + `github.context`. Derives `MDEV_*` env vars. Emits deprecation warnings. Validates input combinations. Fails fast via `core.setFailed` before the CLI is invoked. |
| Run | `scripts/run-cloud.sh` | Builds the `maestro cloud` arg array using `${VAR:+--flag "$VAR"}` conditionals. Tees stdout. Strips ANSI. Greps `App binary id:` and the console URL. Writes both to `$GITHUB_OUTPUT`. Exits with the CLI's exit code. |

## Component: `prelude.ts`

Single file, ~80 lines. One job: turn action inputs + GitHub context into a
clean set of `MDEV_*` env vars for the next step.

### Reads

- All `core.getInput(...)` values currently in `params.ts:127–203`.
- `github.context` for branch (PR head ref / parsed `ref`), commit SHA, repo
  owner/name, PR number, PR title, push commit message.

### Writes (via `core.exportVariable`)

```
MDEV_API_KEY, MDEV_API_URL, MDEV_PROJECT_ID
MDEV_NAME              # resolved: input.name → PR title → push commit msg → SHA
MDEV_BRANCH            # input.branch → PR head ref → parsed github.ref
MDEV_COMMIT_SHA        # PR head SHA when available
MDEV_REPO_OWNER, MDEV_REPO_NAME, MDEV_PR_ID
MDEV_APP_FILE, MDEV_APP_BINARY_ID, MDEV_MAPPING_FILE
MDEV_WORKSPACE
MDEV_DEVICE_OS, MDEV_DEVICE_LOCALE, MDEV_DEVICE_MODEL
MDEV_INCLUDE_TAGS, MDEV_EXCLUDE_TAGS    # comma-form, passed verbatim
MDEV_TIMEOUT, MDEV_ASYNC
MDEV_ANDROID_API_LEVEL, MDEV_IOS_VERSION    # deprecated, with core.warning
MDEV_ENV               # newline-separated KEY=VAL pairs
```

`MDEV_*` prefix mirrors the Bitrise step's env-var convention.

### Validation (preserved verbatim from `params.ts`)

- `app-file` XOR `app-binary-id` for mobile mode (`params.ts:171–173`).
- `device-os: web` rejects both `app-file` and `app-binary-id` (`params.ts:167–169`).
- `core.warning` for `android-api-level` (`params.ts:142–146`) and `ios-version`
  (`params.ts:147–152`).
- `env` parsing: split on `=`, error on malformed line (`params.ts:181–194`).

### Does NOT do

- Call the API.
- Zip the workspace (CLI handles its own packaging via `--flows`).
- Validate APK/IPA bytes (`app_file.ts:validateAppFile` is deleted; CLI/server validates).
- Parse CLI stdout (that's `run-cloud.sh`).

### Dependencies

- `@actions/core` (`getInput`, `exportVariable`, `setFailed`, `warning`).
- `@actions/github` (`context`).
- `@octokit/webhooks-definitions` (type-only, for `PushEvent`).

Bundled to `dist/prelude.js` via the existing ncc pipeline (`ncc build
prelude.ts -o dist`). Committed.

## Component: `scripts/run-cloud.sh`

Near-port of `bitrise-step-maestro-cloud-upload/step.sh:84–125`, adapted for
GitHub Actions outputs.

```bash
#!/usr/bin/env bash

# Multiline MDEV_ENV → repeated "-e KEY=VAL"
env_args=()
if [ -n "$MDEV_ENV" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    env_args+=("-e" "$line")
  done <<< "$MDEV_ENV"
fi

CLOUD_COMMAND=(maestro cloud
  --apiKey "$MDEV_API_KEY"
  --project-id "$MDEV_PROJECT_ID"
  ${MDEV_API_URL:+--api-url "$MDEV_API_URL"}
  ${MDEV_NAME:+--name "$MDEV_NAME"}
  ${MDEV_BRANCH:+--branch "$MDEV_BRANCH"}
  ${MDEV_COMMIT_SHA:+--commit-sha "$MDEV_COMMIT_SHA"}
  ${MDEV_REPO_OWNER:+--repoOwner "$MDEV_REPO_OWNER"}
  ${MDEV_REPO_NAME:+--repoName "$MDEV_REPO_NAME"}
  ${MDEV_PR_ID:+--pullRequestId "$MDEV_PR_ID"}
  ${MDEV_APP_FILE:+--app-file "$MDEV_APP_FILE"}
  ${MDEV_APP_BINARY_ID:+--app-binary-id "$MDEV_APP_BINARY_ID"}
  ${MDEV_MAPPING_FILE:+--mapping "$MDEV_MAPPING_FILE"}
  ${MDEV_DEVICE_OS:+--device-os "$MDEV_DEVICE_OS"}
  ${MDEV_DEVICE_LOCALE:+--device-locale "$MDEV_DEVICE_LOCALE"}
  ${MDEV_DEVICE_MODEL:+--device-model "$MDEV_DEVICE_MODEL"}
  ${MDEV_INCLUDE_TAGS:+--include-tags "$MDEV_INCLUDE_TAGS"}
  ${MDEV_EXCLUDE_TAGS:+--exclude-tags "$MDEV_EXCLUDE_TAGS"}
  ${MDEV_TIMEOUT:+--timeout "$MDEV_TIMEOUT"}
  ${MDEV_ASYNC:+--async}
  ${MDEV_ANDROID_API_LEVEL:+--android-api-level "$MDEV_ANDROID_API_LEVEL"}
  ${MDEV_IOS_VERSION:+--ios-version "$MDEV_IOS_VERSION"}
  "${env_args[@]}"
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

OUTPUT_FILE=$(mktemp)
"${CLOUD_COMMAND[@]}" | tee "$OUTPUT_FILE"
EXIT_CODE=${PIPESTATUS[0]}

CLEANED=$(sed -E 's/\x1b\[[0-9;]*m//g' "$OUTPUT_FILE")

APP_BINARY_ID=$(echo "$CLEANED" | grep -oE "App binary id: \S+" | awk '{print $NF}' | head -n 1)
CONSOLE_URL=$(echo "$CLEANED" | grep -oE "https://app\.maestro\.dev/\S+" | head -n 1)

# CLI doesn't echo app-binary-id when user supplied it as input
[ -z "$APP_BINARY_ID" ] && [ -n "$MDEV_APP_BINARY_ID" ] && APP_BINARY_ID="$MDEV_APP_BINARY_ID"

[ -n "$APP_BINARY_ID" ] && echo "MAESTRO_CLOUD_APP_BINARY_ID=$APP_BINARY_ID" >> "$GITHUB_OUTPUT"
[ -n "$CONSOLE_URL" ] && echo "MAESTRO_CLOUD_CONSOLE_URL=$CONSOLE_URL" >> "$GITHUB_OUTPUT"

rm -f "$OUTPUT_FILE"
exit "$EXIT_CODE"
```

### Nuances

- **ANSI stripping required.** CLI wraps these values in cyan
  (`CloudInteractor.kt:402, 419–420` — `.cyan()`). Without `sed -E
  's/\x1b\[[0-9;]*m//g'`, grep captures escape sequences. The bitrise
  step works without this only because Bitrise's logs strip ANSI for them.
- **Binary-ID fallback.** When the user supplies `--app-binary-id`, the CLI
  skips upload and doesn't echo the id back (`CloudInteractor.kt:139–155`).
  Today's Action returns it because the API response includes it; we don't
  have that anymore. Pass through `$MDEV_APP_BINARY_ID` if grep finds nothing.
- **No `set -e`.** We must capture the CLI's exit code and write outputs
  even on failure. Linear script with explicit `exit "$EXIT_CODE"`.
- **Streaming logs preserved.** `tee` prints flow-completion lines as they
  arrive; users see streaming progress in workflow logs as today.

## Deletions

| File | LOC | Reason |
|---|---|---|
| `index.ts` | 96 | Replaced by composite action + prelude |
| `ApiClient.ts` | 162 | CLI handles upload + status |
| `StatusPoller.ts` | 171 | CLI handles polling, retry, exit code |
| `app_file.ts` | 59 | CLI/server validates app and mapping files |
| `archive_utils.ts` | — | CLI packages workspace |
| `uploadRequest.ts` | — | No JSON body anymore |
| `log.ts` | 22 | CLI prints colored output itself |
| `__tests__/archive_utils.test.ts` | — | Target deleted |
| `__tests__/uploadRequest.test.ts` | — | Target deleted |
| `README.md.bkp` | — | Stale backup, unrelated cleanup |

`package.json` changes:

- Remove from `dependencies`: `node-fetch`, `node-stream-zip`,
  `console-log-colors`, `archiver`, `glob`, `@types/glob`.
- Keep: `@actions/core`, `@actions/github`, `@octokit/webhooks-definitions`,
  `@vercel/ncc`.
- `devDependencies` unchanged (TypeScript, Jest, ts-jest, types).
- Update `scripts.build` from `ncc build index.ts` → `ncc build prelude.ts -o dist`.
- Add `scripts.test:bats` for local convenience: `bats __tests__/run-cloud.bats`.

No new npm dependencies. `bats-core` + `bats-support` + `bats-assert` are
installed in CI only.

## Testing

Three layers, all run pre-merge.

### Layer 1 — Jest (`__tests__/prelude.test.ts`)

Ports of existing `params.test.ts` and `getParameters.test.ts`. Tests:

- Branch resolution priority (input → PR head ref → parsed `github.ref`).
- Inferred name fallback chain (input → PR title → push commit message → SHA).
- `app-file` XOR `app-binary-id` for mobile mode.
- `device-os: web` rejects binary inputs.
- Multiline `env` parsing — malformed lines fail; `=` in values preserved.
- Tag parsing (single, comma-separated, empty).
- Deprecation warnings for `android-api-level` and `ios-version`.
- `core.exportVariable` is called with the expected `MDEV_*` keys/values
  (mock and assert).

Runs in <1s.

### Layer 2 — bats (`__tests__/run-cloud.bats`)

Direct port of the bitrise pattern (`bitrise-step-maestro-cloud-upload/test.bats:6–25`).
A fake `maestro` shim earlier on `$PATH` records args and emits canned stdout.

Tests:

- Arg construction matches expected for given `MDEV_*` env combinations.
- Multiline `MDEV_ENV` produces repeated `-e KEY=VAL`.
- Output parsing: known stdout produces correct `$GITHUB_OUTPUT` lines.
- ANSI-wrapped values still parse correctly.
- `MDEV_APP_BINARY_ID` fallback when CLI doesn't echo the id.
- Exit-code propagation: fake-maestro `exit 1` → script exits 1, but outputs
  still get written.
- `--api-url` flag is omitted when `MDEV_API_URL` empty.
- `--async` is a flag (not a value): only added when `MDEV_ASYNC` is set.

Runs in ~1s per test on CI.

### Layer 3 — End-to-end (`validate-local.yml`)

Already exists. Runs the working-tree Action against real Maestro Cloud with
sample apps. The migration adds a matrix on `runs-on: [ubuntu-latest, macos-latest]`
to verify install + run paths on both supported platforms.

`validate.yml` (which uses the published `@v2` tag) is unchanged in this PR.
The bump PR updates its pin and matrix.

### Test coverage map

| Failure mode | Caught by |
|---|---|
| Bad branch resolution / inferred name / env parsing | Layer 1 |
| `app-file` XOR `app-binary-id` regression | Layer 1 |
| Wrong CLI flag passed for a given input | Layer 2 |
| Output parsing breaks on ANSI / log format change | Layer 2 |
| Binary-ID fallback regression | Layer 2 |
| CLI install fails on `ubuntu-latest` / `macos-latest` | Layer 3 (validate-local.yml) |
| Real upload broken end-to-end | Layer 3 |

## CI changes

`.github/workflows/ci.yml` adds a bats job:

```yaml
jobs:
  test-prelude:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run build  # ncc → dist/prelude.js, used at runtime

  test-run-cloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get install -y bats
      - run: |
          mkdir -p test/bats
          git clone --depth 1 https://github.com/bats-core/bats-support.git test/bats/bats-support
          git clone --depth 1 https://github.com/bats-core/bats-assert.git test/bats/bats-assert
      - run: bats __tests__/run-cloud.bats
        env:
          BATS_LIB_PATH: ./test/bats
```

`.github/workflows/validate-local.yml` adds the runner matrix:

```yaml
strategy:
  matrix:
    runner: [ubuntu-latest, macos-latest]
runs-on: ${{ matrix.runner }}
```

**Decision:** remove the workflow's standalone `Install Maestro` step. The
Action installs the CLI itself in step 1. Reorder so `maestro download-samples`
runs *after* the first `mobile-dev-inc/action-maestro-cloud` invocation —
that way the CLI is on `$GITHUB_PATH` when the workflow needs it for sample
download.

`.github/workflows/validate.yml` is **not changed** in this PR. Its `@v2`
pin keeps validating the published Action. The bump PR updates the pin and
matrix.

## CHANGELOG

Migration PR creates `CHANGELOG.md` (does not exist today; sister repos have
one) with the migration entry under an `[Unreleased]` header per
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Removed
- Output `MAESTRO_CLOUD_FLOW_RESULTS` (no replacement; use `--format junit`
  and parse the report if you need machine-readable per-flow results).
- Output `MAESTRO_CLOUD_UPLOAD_STATUS` (use `if: failure()` / `if: success()`
  on subsequent steps).
- Implicit `.mobiledev/` workspace fallback. Default is `.maestro/`; pass
  `workspace: .mobiledev` explicitly if you still rely on the legacy path.
- Pre-upload APK/IPA validation. The Maestro CLI / server validates instead.

### Changed
- Action is now a composite action that invokes the Maestro CLI directly,
  replacing the bundled TypeScript HTTP client. Aligns with the Bitrise step
  and Bitbucket pipe.
- Per-flow log lines now use the CLI's format (e.g. `Passed login.yaml (15s)`)
  instead of v1's `[Passed] login.yaml`.
- Linux (`ubuntu-latest`) and macOS (`macos-latest`) GitHub-hosted runners
  are formally supported. Windows runners are not supported.
```

The bump PR renames `[Unreleased]` → `[v2.x.0] (YYYY-MM-DD)` and adds a fresh
empty `[Unreleased]` header above it.

## README

**Migration PR does not touch user-facing README sections.**

Reasoning: the published Action is whatever commit the rolling `v2` tag
points at. Until the bump PR moves that tag, users on `@v2` keep getting
today's API-direct implementation. Updating README on `main` to reflect
post-migration behavior would mislead anyone reading the docs on github.com.

The bump PR rewrites:

- All 17 `mobile-dev-inc/action-maestro-cloud@v2.0.2` pin examples in the
  README.
- The opening "you can use the `v1` tag" callout (v1 frozen → reword).
- Outputs section (`README.md:328–390`): drops `MAESTRO_CLOUD_FLOW_RESULTS`
  and `MAESTRO_CLOUD_UPLOAD_STATUS` from the list and the type schema.
- Adds a new "Upgrading from v1" section covering the six user-visible breaks.

## Files after migration

```
action.yml                                 # composite, ~50 lines
prelude.ts                                 # ~80 lines, GH context derivation
scripts/run-cloud.sh                       # ~50 lines, CLI invocation
dist/prelude.js                            # bundled, committed
package.json                               # slimmer
__tests__/prelude.test.ts                  # ported from existing
__tests__/run-cloud.bats                   # new
.github/workflows/ci.yml                   # adds bats job
.github/workflows/validate-local.yml       # adds runner matrix
.github/workflows/validate.yml             # unchanged
CHANGELOG.md                               # new, [Unreleased] header
README.md                                  # unchanged in this PR
RELEASING.md                               # unchanged
tsconfig.json                              # unchanged
jest.config.js                             # unchanged
```

Deleted: `index.ts`, `ApiClient.ts`, `StatusPoller.ts`, `app_file.ts`,
`archive_utils.ts`, `uploadRequest.ts`, `log.ts`, related test files,
`README.md.bkp`.

## Open items intentionally deferred

- Version bump, README rewrite, rolling-tag move → separate PR.
- `windows-latest` support → not in scope; revisit if a real user need shows up.
- Reconstructing `MAESTRO_CLOUD_FLOW_RESULTS` from junit XML → not in scope;
  revisit if usage analytics show consumers.

## Risks

| Risk | Mitigation |
|---|---|
| CLI release changes stdout format → output parsing breaks | Layer 2 bats tests assert on the parser's behavior with known inputs. CLI changes are caught by `validate-local.yml` end-to-end run. Worst case: a quick patch to the regex. |
| CLI install adds 20–60s to every workflow run | Documented as a tradeoff. No mitigation; this is the cost of consolidation. |
| `--api-url` semantics differ from today's API URL | Verified: CLI's `--api-url` flag exists (`CloudCommand.kt:80`) and accepts the same form. Worst case is a docs note in the bump PR. |
| `--commit-sha` not supported | Verified: exists on `maestro cloud` (`CloudCommand.kt:95`). |
| Java/JRE not present on macOS runner | `macos-latest` runners include Java by default. If this changes, the install step gains a JDK setup. |
