# Maestro CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this Action's bundled TypeScript HTTP client with a composite GitHub Action that shells out to the Maestro CLI, mirroring the architecture of the Bitrise step and Bitbucket pipe.

**Architecture:** Composite action with three steps — install CLI, JS prelude (TS bundled to `dist/prelude.js`) that derives GitHub context into `MDEV_*` env vars, and a bash script (`scripts/run-cloud.sh`) that builds the `maestro cloud` invocation, runs it, parses two outputs from stdout, and exits with the CLI's exit code.

**Tech Stack:** TypeScript + ts-jest for the prelude, bash + bats for the run-cloud script, ncc for bundling, GitHub Actions composite mechanism. No new npm runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-30-maestro-cli-migration-design.md`

**Branch:** Work on the existing `use-cli-instead-of-curl` branch (current branch).

---

## File map

**Created:**
- `prelude.ts` — derives GitHub context, validates inputs, exports `MDEV_*` env vars
- `scripts/run-cloud.sh` — builds `maestro cloud` args, runs, parses outputs
- `__tests__/prelude.test.ts` — Jest tests for the prelude
- `__tests__/run-cloud.bats` — bats tests for the run script
- `__tests__/fixtures/fake-maestro.sh` — fake CLI shim used by bats tests
- `CHANGELOG.md` — Keep-a-Changelog format with `[Unreleased]` header

**Modified:**
- `action.yml` — rewritten as composite action
- `package.json` — drop runtime deps, update `build` script
- `.github/workflows/ci.yml` — add bats job
- `.github/workflows/validate-local.yml` — add `runs-on` matrix, drop redundant install step
- `dist/prelude.js` — replaces `dist/index.js` after `npm run build`

**Deleted:**
- `index.ts`, `ApiClient.ts`, `StatusPoller.ts`, `app_file.ts`, `archive_utils.ts`, `uploadRequest.ts`, `log.ts`, `params.ts`
- `__tests__/archive_utils.test.ts`, `__tests__/uploadRequest.test.ts`, `__tests__/getParameters.test.ts`, `__tests__/params.test.ts` (consolidated into `prelude.test.ts`)
- `README.md.bkp` (stale backup)
- Old `dist/index.js` and any `dist/*.d.ts`

**Unchanged:** `tsconfig.json`, `jest.config.js`, `RELEASING.md`, `_release.sh`, `LICENSE`, `.github/workflows/validate.yml`, `README.md`.

---

## Phase A: Prelude (TypeScript, Jest)

### Task 1: Scaffold `prelude.ts` and the test file

**Files:**
- Create: `prelude.ts`
- Create: `__tests__/prelude.test.ts`

- [ ] **Step 1: Create `prelude.ts` with empty `main` export**

```typescript
// prelude.ts
import * as core from '@actions/core'
import * as github from '@actions/github'

export async function main(): Promise<void> {
  // Filled in by later tasks.
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
```

- [ ] **Step 2: Create the test file with the shared mock harness**

```typescript
// __tests__/prelude.test.ts
import * as core from '@actions/core'
import * as github from '@actions/github'
import { main } from '../prelude'

jest.mock('@actions/github')

const required = {
  'api-key': 'k',
  'project-id': 'p',
}

const baseContext = {
  payload: {} as any,
  ref: 'refs/heads/main',
  eventName: 'push',
  repo: { owner: 'mobile-dev-inc', repo: 'action-maestro-cloud' },
  sha: 'abc123',
}

const setInputs = (inputs: Record<string, string>) => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('INPUT_')) delete process.env[k]
  }
  for (const [k, v] of Object.entries(inputs)) {
    process.env[`INPUT_${k.toUpperCase().replace(/-/g, '_')}`] = v
  }
}

describe('prelude', () => {
  let exportedVars: Record<string, string>
  let warnings: string[]
  let failures: string[]

  beforeEach(() => {
    ;(github as any).context = JSON.parse(JSON.stringify(baseContext))
    exportedVars = {}
    warnings = []
    failures = []
    jest.spyOn(core, 'exportVariable').mockImplementation((k, v) => {
      exportedVars[k] = String(v)
    })
    jest.spyOn(core, 'warning').mockImplementation((m) => {
      warnings.push(typeof m === 'string' ? m : m.message)
    })
    jest.spyOn(core, 'setFailed').mockImplementation((m) => {
      failures.push(typeof m === 'string' ? m : m.message)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('INPUT_')) delete process.env[k]
    }
  })

  it('runs without throwing on minimal inputs', async () => {
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test and confirm it passes**

Run: `npx jest __tests__/prelude.test.ts -t "runs without throwing"`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Scaffold prelude module and test harness

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Branch resolution

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Port `getBranchName` from `params.ts:32–62` exactly (priority: input → PR head ref → parsed `github.ref`).

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/prelude.test.ts`:

```typescript
describe('branch resolution', () => {
  it('uses explicit branch input when provided', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', branch: 'feature/foo' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/foo')
  })

  it('trims whitespace from branch input', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', branch: '  feature/foo  ' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/foo')
  })

  it('falls back to PR head ref when no input', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { ref: 'feature/pr-branch', sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/pr-branch')
  })

  it('throws when PR exists but head.ref missing', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures.length).toBe(1)
    expect(failures[0]).toMatch(/Unable find pull request ref/)
  })

  it('parses refs/heads format', async () => {
    ;(github as any).context.ref = 'refs/heads/feature/some-branch'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/some-branch')
  })

  it('parses refs/tags format', async () => {
    ;(github as any).context.ref = 'refs/tags/v1.2.3'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('v1.2.3')
  })

  it('fails when ref format is invalid', async () => {
    ;(github as any).context.ref = 'invalid-ref-format'
    ;(github as any).context.payload = {}
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures[0]).toMatch(/Failed to parse GitHub ref/)
  })

  it('input wins over PR context', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { ref: 'pr-branch', sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk', branch: 'override' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('override')
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx jest __tests__/prelude.test.ts -t "branch resolution"`
Expected: 8 tests FAIL — `MDEV_BRANCH` is `undefined`.

- [ ] **Step 3: Implement `getBranchName` in `prelude.ts`**

Replace `prelude.ts` body:

```typescript
import * as core from '@actions/core'
import * as github from '@actions/github'

export function getBranchName(branchInput?: string): string {
  if (branchInput && branchInput.trim() !== '') {
    return branchInput.trim()
  }
  const pullRequest = github.context.payload.pull_request
  if (pullRequest) {
    const branchName = (pullRequest as any)?.head?.ref
    if (!branchName) {
      throw new Error(
        `Unable find pull request ref: ${JSON.stringify(pullRequest, undefined, 2)}`
      )
    }
    return branchName
  }
  const regex = /refs\/(heads|tags)\/(.*)/
  const ref = github.context.ref
  const result = regex.exec(ref)
  if (!result || result.length < 3) {
    throw new Error(`Failed to parse GitHub ref: ${ref}`)
  }
  return result[2]
}

export async function main(): Promise<void> {
  try {
    const branchInput = core.getInput('branch') || undefined
    const branch = getBranchName(branchInput)
    core.exportVariable('MDEV_BRANCH', branch)
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest __tests__/prelude.test.ts -t "branch resolution"`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Port branch resolution to prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Inferred name resolution

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Port the inferred-name fallback chain from `params.ts:82–99`: explicit `name` input → PR title (when PR event) → push commit message → SHA.

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/prelude.test.ts`:

```typescript
describe('name resolution', () => {
  it('uses explicit name input when provided', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', name: 'My Run' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('My Run')
  })

  it('falls back to PR title', async () => {
    ;(github as any).context.payload = {
      pull_request: { title: 'PR title here', head: { ref: 'b', sha: 's' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('PR title here')
  })

  it('falls back to push commit message', async () => {
    ;(github as any).context.eventName = 'push'
    ;(github as any).context.payload = {
      head_commit: { message: 'commit subject' },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('commit subject')
  })

  it('falls back to SHA when no other source', async () => {
    ;(github as any).context.eventName = 'push'
    ;(github as any).context.payload = {}
    ;(github as any).context.sha = 'deadbeef'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('deadbeef')
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "name resolution"`
Expected: 4 tests FAIL — `MDEV_NAME` is `undefined`.

- [ ] **Step 3: Implement `getInferredName` and wire it in**

In `prelude.ts`, add above `main`:

```typescript
import { PushEvent } from '@octokit/webhooks-definitions/schema'

export function getInferredName(): string {
  const ctx = github.context
  const prTitle = (ctx.payload.pull_request as any)?.title
  if (prTitle) return String(prTitle)
  if (ctx.eventName === 'push') {
    const pushPayload = ctx.payload as PushEvent
    const commitMessage = pushPayload.head_commit?.message
    if (commitMessage) return commitMessage
  }
  return ctx.sha
}
```

In `main`, after the branch export, add:

```typescript
const nameInput = core.getInput('name')
const name = nameInput || getInferredName()
core.exportVariable('MDEV_NAME', name)
```

- [ ] **Step 4: Run and confirm passes**

Run: `npx jest __tests__/prelude.test.ts -t "name resolution"`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Add name inference to prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Input validation (mobile XOR, web mode)

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Port `params.ts:164–173` validation: mobile mode requires exactly one of `app-file` / `app-binary-id`; `device-os: web` rejects both.

- [ ] **Step 1: Add the failing tests**

```typescript
describe('input validation', () => {
  it('mobile: rejects when both app-file and app-binary-id given', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'app-binary-id': 'b' })
    await main()
    expect(failures[0]).toMatch(/Either app-file or app-binary-id must be used \(but not both\)/)
  })

  it('mobile: rejects when neither app-file nor app-binary-id given', async () => {
    setInputs({ ...required })
    await main()
    expect(failures[0]).toMatch(/Either app-file or app-binary-id must be used \(but not both\)/)
  })

  it('mobile: accepts app-file alone', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(failures).toEqual([])
  })

  it('mobile: accepts app-binary-id alone', async () => {
    setInputs({ ...required, 'app-binary-id': 'bin_x' })
    await main()
    expect(failures).toEqual([])
  })

  it('web: rejects app-file', async () => {
    setInputs({ ...required, 'device-os': 'web', 'app-file': 'a.apk' })
    await main()
    expect(failures[0]).toMatch(/For web tests, neither app-file nor app-binary-id should be provided/)
  })

  it('web: rejects app-binary-id', async () => {
    setInputs({ ...required, 'device-os': 'web', 'app-binary-id': 'bin_x' })
    await main()
    expect(failures[0]).toMatch(/For web tests, neither app-file nor app-binary-id should be provided/)
  })

  it('web: accepts neither', async () => {
    setInputs({ ...required, 'device-os': 'web' })
    await main()
    expect(failures).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "input validation"`
Expected: 5 of 7 FAIL (2 trivially pass).

- [ ] **Step 3: Implement validation**

In `prelude.ts`, add above `main`:

```typescript
function validateAppInputs(
  appFile: string,
  appBinaryId: string,
  deviceOs: string
): void {
  const hasAppFile = appFile !== ''
  const hasAppBinaryId = appBinaryId !== ''
  if (deviceOs === 'web' && (hasAppFile || hasAppBinaryId)) {
    throw new Error('For web tests, neither app-file nor app-binary-id should be provided')
  }
  if (deviceOs !== 'web' && hasAppFile === hasAppBinaryId) {
    throw new Error('Either app-file or app-binary-id must be used (but not both) for mobile tests')
  }
}
```

In `main`, after the name export:

```typescript
const appFile = core.getInput('app-file')
const appBinaryId = core.getInput('app-binary-id')
const deviceOs = core.getInput('device-os')
validateAppInputs(appFile, appBinaryId, deviceOs)
```

- [ ] **Step 4: Run and confirm passes**

Run: `npx jest __tests__/prelude.test.ts -t "input validation"`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Add app-input validation to prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Multiline `env` parsing

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Port `params.ts:179–194`: split each line on `=`, error on malformed line, preserve `=` in values, write all entries as a single newline-joined string to `MDEV_ENV` (the run script splits this back into `-e KEY=VAL` args).

- [ ] **Step 1: Add the failing tests**

```typescript
describe('env parsing', () => {
  it('writes empty string when env not set', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_ENV ?? '').toBe('')
  })

  it('parses single KEY=VAL', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'FOO=bar' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('FOO=bar')
  })

  it('parses multiple lines', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'A=1\nB=2' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('A=1\nB=2')
  })

  it('preserves "=" in values', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'TOKEN=foo=bar=baz' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('TOKEN=foo=bar=baz')
  })

  it('fails on malformed line (no equals)', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'NOEQUALS' })
    await main()
    expect(failures[0]).toMatch(/Invalid env parameter: NOEQUALS/)
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "env parsing"`
Expected: 4 of 5 FAIL (the empty-string case may pass trivially).

- [ ] **Step 3: Implement env parsing**

In `prelude.ts`, add above `main`:

```typescript
function parseEnv(lines: string[]): string {
  const validated = lines.map((line) => {
    const parts = line.split('=')
    if (parts.length < 2) {
      throw new Error(`Invalid env parameter: ${line}`)
    }
    return line
  })
  return validated.join('\n')
}
```

In `main`, after validation:

```typescript
const envLines = core.getMultilineInput('env')
const envSerialized = parseEnv(envLines)
core.exportVariable('MDEV_ENV', envSerialized)
```

- [ ] **Step 4: Run and confirm passes**

Run: `npx jest __tests__/prelude.test.ts -t "env parsing"`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Add env parsing to prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tag parsing (passthrough)

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

The CLI accepts the same `--include-tags`/`--exclude-tags` syntax the user provides (comma-separated or single value). Pass through verbatim.

- [ ] **Step 1: Add the failing tests**

```typescript
describe('tag passthrough', () => {
  it('forwards include-tags verbatim', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'include-tags': 'dev,smoke' })
    await main()
    expect(exportedVars.MDEV_INCLUDE_TAGS).toBe('dev,smoke')
  })

  it('forwards exclude-tags verbatim', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'exclude-tags': 'flaky' })
    await main()
    expect(exportedVars.MDEV_EXCLUDE_TAGS).toBe('flaky')
  })

  it('writes empty string when tags not set', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_INCLUDE_TAGS ?? '').toBe('')
    expect(exportedVars.MDEV_EXCLUDE_TAGS ?? '').toBe('')
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "tag passthrough"`
Expected: 2 of 3 FAIL.

- [ ] **Step 3: Implement passthrough**

In `main`, after env:

```typescript
core.exportVariable('MDEV_INCLUDE_TAGS', core.getInput('include-tags'))
core.exportVariable('MDEV_EXCLUDE_TAGS', core.getInput('exclude-tags'))
```

- [ ] **Step 4: Run and confirm passes**

Run: `npx jest __tests__/prelude.test.ts -t "tag passthrough"`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Pass through tag inputs in prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Deprecation warnings

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Port `params.ts:142–152`. `android-api-level` and `ios-version` still pass through to the CLI but emit `core.warning`.

- [ ] **Step 1: Add the failing tests**

```typescript
describe('deprecation warnings', () => {
  it('warns and forwards android-api-level', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'android-api-level': '29' })
    await main()
    expect(warnings.some((w) => /'android-api-level' is deprecated/.test(w))).toBe(true)
    expect(exportedVars.MDEV_ANDROID_API_LEVEL).toBe('29')
  })

  it('warns and forwards ios-version', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'ios-version': '17' })
    await main()
    expect(warnings.some((w) => /'ios-version' is deprecated/.test(w))).toBe(true)
    expect(exportedVars.MDEV_IOS_VERSION).toBe('17')
  })

  it('happy path emits no deprecation warnings', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(warnings).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "deprecation warnings"`
Expected: 2 of 3 FAIL.

- [ ] **Step 3: Implement deprecation warnings**

In `main`, after the tag exports:

```typescript
const androidApiLevel = core.getInput('android-api-level')
if (androidApiLevel) {
  core.warning(
    "'android-api-level' is deprecated and will be removed in a future release. " +
      "Use 'device-os' instead (e.g. device-os: android-33)."
  )
  core.exportVariable('MDEV_ANDROID_API_LEVEL', androidApiLevel)
}
const iosVersion = core.getInput('ios-version')
if (iosVersion) {
  core.warning(
    "'ios-version' is deprecated and will be removed in a future release. " +
      "Use 'device-os' instead (e.g. device-os: iOS-18-2)."
  )
  core.exportVariable('MDEV_IOS_VERSION', iosVersion)
}
```

- [ ] **Step 4: Run and confirm passes**

Run: `npx jest __tests__/prelude.test.ts -t "deprecation warnings"`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Add deprecation warnings for legacy device inputs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire up remaining `MDEV_*` exports

**Files:**
- Modify: `prelude.ts`
- Modify: `__tests__/prelude.test.ts`

Export the remaining envs the run script needs.

- [ ] **Step 1: Add the failing tests**

```typescript
describe('remaining MDEV exports', () => {
  it('forwards api/project/name primitives', async () => {
    setInputs({
      'api-key': 'rb_xyz',
      'project-id': 'proj_abc',
      'api-url': 'https://example.com',
      'app-file': 'a.apk',
    })
    await main()
    expect(exportedVars.MDEV_API_KEY).toBe('rb_xyz')
    expect(exportedVars.MDEV_PROJECT_ID).toBe('proj_abc')
    expect(exportedVars.MDEV_API_URL).toBe('https://example.com')
  })

  it('forwards files', async () => {
    setInputs({
      ...required,
      'app-file': 'app.apk',
      'mapping-file': 'mapping.txt',
    })
    await main()
    expect(exportedVars.MDEV_APP_FILE).toBe('app.apk')
    expect(exportedVars.MDEV_MAPPING_FILE).toBe('mapping.txt')
  })

  it('forwards device knobs', async () => {
    setInputs({
      ...required,
      'app-file': 'a.apk',
      'device-os': 'iOS-18-2',
      'device-locale': 'de_DE',
      'device-model': 'iPhone-11',
    })
    await main()
    expect(exportedVars.MDEV_DEVICE_OS).toBe('iOS-18-2')
    expect(exportedVars.MDEV_DEVICE_LOCALE).toBe('de_DE')
    expect(exportedVars.MDEV_DEVICE_MODEL).toBe('iPhone-11')
  })

  it('forwards async true; omits when false-y', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', async: 'true' })
    await main()
    expect(exportedVars.MDEV_ASYNC).toBe('true')
  })

  it('does not set MDEV_ASYNC when async is false', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', async: 'false' })
    await main()
    expect(exportedVars.MDEV_ASYNC ?? '').toBe('')
  })

  it('forwards timeout and workspace', async () => {
    setInputs({
      ...required,
      'app-file': 'a.apk',
      timeout: '90',
      workspace: 'flows/',
    })
    await main()
    expect(exportedVars.MDEV_TIMEOUT).toBe('90')
    expect(exportedVars.MDEV_WORKSPACE).toBe('flows/')
  })

  it('forwards repo metadata from github.context', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_REPO_OWNER).toBe('mobile-dev-inc')
    expect(exportedVars.MDEV_REPO_NAME).toBe('action-maestro-cloud')
  })

  it('forwards PR id and commit SHA when PR event', async () => {
    ;(github as any).context.payload = {
      pull_request: { number: 42, head: { ref: 'feat', sha: 'shashashash' } },
    }
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_PR_ID).toBe('42')
    expect(exportedVars.MDEV_COMMIT_SHA).toBe('shashashash')
  })

  it('omits PR id and commit SHA on push', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_PR_ID ?? '').toBe('')
    expect(exportedVars.MDEV_COMMIT_SHA ?? '').toBe('')
  })
})
```

- [ ] **Step 2: Run and confirm fails**

Run: `npx jest __tests__/prelude.test.ts -t "remaining MDEV exports"`
Expected: most FAIL (only the always-set vars from prior tasks pass).

- [ ] **Step 3: Implement the remaining exports**

Replace the body of `main` (keep prior calls in order, append new):

```typescript
export async function main(): Promise<void> {
  try {
    // 1. Branch + name (already implemented)
    const branchInput = core.getInput('branch') || undefined
    const branch = getBranchName(branchInput)
    core.exportVariable('MDEV_BRANCH', branch)

    const nameInput = core.getInput('name')
    const name = nameInput || getInferredName()
    core.exportVariable('MDEV_NAME', name)

    // 2. App + device + validation
    const appFile = core.getInput('app-file')
    const appBinaryId = core.getInput('app-binary-id')
    const deviceOs = core.getInput('device-os')
    validateAppInputs(appFile, appBinaryId, deviceOs)

    // 3. Env multiline
    const envLines = core.getMultilineInput('env')
    const envSerialized = parseEnv(envLines)
    core.exportVariable('MDEV_ENV', envSerialized)

    // 4. Tag passthrough
    core.exportVariable('MDEV_INCLUDE_TAGS', core.getInput('include-tags'))
    core.exportVariable('MDEV_EXCLUDE_TAGS', core.getInput('exclude-tags'))

    // 5. Deprecation warnings
    const androidApiLevel = core.getInput('android-api-level')
    if (androidApiLevel) {
      core.warning(
        "'android-api-level' is deprecated and will be removed in a future release. " +
          "Use 'device-os' instead (e.g. device-os: android-33)."
      )
      core.exportVariable('MDEV_ANDROID_API_LEVEL', androidApiLevel)
    }
    const iosVersion = core.getInput('ios-version')
    if (iosVersion) {
      core.warning(
        "'ios-version' is deprecated and will be removed in a future release. " +
          "Use 'device-os' instead (e.g. device-os: iOS-18-2)."
      )
      core.exportVariable('MDEV_IOS_VERSION', iosVersion)
    }

    // 6. Required + optional primitives
    core.exportVariable('MDEV_API_KEY', core.getInput('api-key'))
    core.exportVariable('MDEV_PROJECT_ID', core.getInput('project-id'))
    const apiUrl = core.getInput('api-url')
    if (apiUrl) core.exportVariable('MDEV_API_URL', apiUrl)

    // 7. Files
    if (appFile) core.exportVariable('MDEV_APP_FILE', appFile)
    if (appBinaryId) core.exportVariable('MDEV_APP_BINARY_ID', appBinaryId)
    const mappingFile = core.getInput('mapping-file')
    if (mappingFile) core.exportVariable('MDEV_MAPPING_FILE', mappingFile)

    // 8. Device knobs
    if (deviceOs) core.exportVariable('MDEV_DEVICE_OS', deviceOs)
    const deviceLocale = core.getInput('device-locale')
    if (deviceLocale) core.exportVariable('MDEV_DEVICE_LOCALE', deviceLocale)
    const deviceModel = core.getInput('device-model')
    if (deviceModel) core.exportVariable('MDEV_DEVICE_MODEL', deviceModel)

    // 9. Async + timeout + workspace
    const async = core.getInput('async')
    if (async === 'true') core.exportVariable('MDEV_ASYNC', 'true')
    const timeout = core.getInput('timeout')
    if (timeout) core.exportVariable('MDEV_TIMEOUT', timeout)
    const workspace = core.getInput('workspace')
    if (workspace) core.exportVariable('MDEV_WORKSPACE', workspace)

    // 10. GitHub context metadata
    const ctx = github.context
    core.exportVariable('MDEV_REPO_OWNER', ctx.repo.owner)
    core.exportVariable('MDEV_REPO_NAME', ctx.repo.repo)
    const pr = ctx.payload.pull_request as any
    if (pr?.number !== undefined) {
      core.exportVariable('MDEV_PR_ID', String(pr.number))
    }
    if (pr?.head?.sha) {
      core.exportVariable('MDEV_COMMIT_SHA', String(pr.head.sha))
    }
  } catch (e: any) {
    core.setFailed(e.message)
  }
}
```

- [ ] **Step 4: Run all prelude tests**

Run: `npx jest __tests__/prelude.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add prelude.ts __tests__/prelude.test.ts
git commit -m "Wire up remaining MDEV_* exports in prelude

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Update `package.json` build target

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the build script**

In `package.json`, change `"build"`:

```json
"build": "ncc build prelude.ts -o dist"
```

- [ ] **Step 2: Run the bundler**

Run: `npm run build`
Expected: `dist/prelude.js` is created. (No errors.)

- [ ] **Step 3: Stage and verify the bundle is generated**

Run: `ls dist/prelude.js`
Expected: file exists.

- [ ] **Step 4: Commit**

```bash
git add package.json dist
git commit -m "Build prelude.ts to dist/prelude.js

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Note: `dist/index.js` still exists at this point. It's deleted in Task 18.

---

## Phase B: Run-cloud script (bash, bats)

### Task 10: Set up bats infrastructure and a fake `maestro` shim

**Files:**
- Create: `__tests__/fixtures/fake-maestro.sh`
- Create: `__tests__/run-cloud.bats`
- Create: `scripts/run-cloud.sh` (stub)

- [ ] **Step 1: Install bats locally to verify the toolchain**

Run: `which bats || brew install bats-core`
Expected: bats is on `$PATH`. (Or `apt-get install bats` on Linux.)

- [ ] **Step 2: Create the fake-maestro shim**

```bash
# __tests__/fixtures/fake-maestro.sh
#!/usr/bin/env bash
# Fake maestro CLI for bats tests. Records its argv to $FAKE_MAESTRO_ARGS_FILE
# and emits canned stdout based on $FAKE_MAESTRO_MODE.
echo "$@" > "$FAKE_MAESTRO_ARGS_FILE"

case "${FAKE_MAESTRO_MODE:-default}" in
  default)
    echo "App binary id: app_abc123"
    echo "Visit Maestro Cloud for more details about this upload:"
    echo "https://app.maestro.dev/project/proj_123/maestro-test/app/app_x/upload/upload_abc"
    ;;
  ansi)
    # Cyan-wrapped values, mimicking PrintUtils.cyan()
    printf 'App binary id: \033[36mapp_abc123\033[0m\n'
    echo "Visit Maestro Cloud for more details about this upload:"
    printf '\033[36mhttps://app.maestro.dev/project/proj_123/upload/upload_abc\033[0m\n'
    ;;
  no-binary-id)
    # CLI doesn't echo "App binary id" when user supplied --app-binary-id
    echo "Visit Maestro Cloud for more details about this upload:"
    echo "https://app.maestro.dev/project/proj_123/upload/upload_abc"
    ;;
  fail)
    echo "Some failure happened"
    exit 1
    ;;
esac

exit 0
```

- [ ] **Step 3: Stub `scripts/run-cloud.sh`**

```bash
# scripts/run-cloud.sh
#!/usr/bin/env bash
# Filled in by later tasks.
echo "stub" >&2
exit 0
```

Make both executable:

```bash
chmod +x __tests__/fixtures/fake-maestro.sh scripts/run-cloud.sh
```

- [ ] **Step 4: Create the bats file with the shared setup**

```bash
# __tests__/run-cloud.bats
#!/usr/bin/env bats

# Loaded via BATS_LIB_PATH in CI; for local runs, install bats-support and
# bats-assert via your package manager (e.g. brew install bats-support bats-assert).
bats_load_library 'bats-support'
bats_load_library 'bats-assert'

setup_file() {
  export SCRIPT="${BATS_TEST_DIRNAME}/../scripts/run-cloud.sh"
  export FAKE_DIR="${BATS_FILE_TMPDIR}/bin"
  mkdir -p "$FAKE_DIR"
  cp "${BATS_TEST_DIRNAME}/fixtures/fake-maestro.sh" "$FAKE_DIR/maestro"
  chmod +x "$FAKE_DIR/maestro"
}

setup() {
  export PATH="$FAKE_DIR:$PATH"
  export FAKE_MAESTRO_ARGS_FILE="${BATS_TEST_TMPDIR}/args"
  export FAKE_MAESTRO_MODE="default"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : > "$GITHUB_OUTPUT"

  # Default: required vars + a sane mobile config
  export MDEV_API_KEY="rb_123"
  export MDEV_PROJECT_ID="proj_123"
  export MDEV_APP_FILE="app.apk"
  export MDEV_WORKSPACE="flows"

  # Unset all optional vars
  unset MDEV_API_URL MDEV_NAME MDEV_BRANCH MDEV_COMMIT_SHA MDEV_REPO_OWNER \
        MDEV_REPO_NAME MDEV_PR_ID MDEV_APP_BINARY_ID MDEV_MAPPING_FILE \
        MDEV_DEVICE_OS MDEV_DEVICE_LOCALE MDEV_DEVICE_MODEL \
        MDEV_INCLUDE_TAGS MDEV_EXCLUDE_TAGS MDEV_TIMEOUT MDEV_ASYNC \
        MDEV_ANDROID_API_LEVEL MDEV_IOS_VERSION MDEV_ENV
}

run_script() {
  run bash "$SCRIPT"
}

# Helper: get the recorded argv as a single space-separated string.
recorded_args() {
  cat "$FAKE_MAESTRO_ARGS_FILE"
}

# Helper: assert that the recorded argv contains a substring.
assert_args_contain() {
  local expected="$1"
  local actual
  actual="$(recorded_args)"
  [[ "$actual" == *"$expected"* ]] || {
    echo "Expected args to contain: $expected"
    echo "Actual args: $actual"
    return 1
  }
}

@test "smoke: stub script runs without crashing" {
  run_script
  assert_success
}
```

- [ ] **Step 5: Run the smoke test**

Run: `bats __tests__/run-cloud.bats`
Expected: 1 test PASSES (the smoke test).

If `bats_load_library` fails locally with "no such library", install:

```bash
brew install bats-support bats-assert  # macOS
# or follow https://bats-core.readthedocs.io/en/stable/installation.html
```

- [ ] **Step 6: Commit**

```bash
git add __tests__/run-cloud.bats __tests__/fixtures/fake-maestro.sh scripts/run-cloud.sh
git commit -m "Scaffold bats harness and fake maestro shim

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Required-args construction

**Files:**
- Modify: `__tests__/run-cloud.bats`
- Modify: `scripts/run-cloud.sh`

- [ ] **Step 1: Add the failing test**

```bash
@test "required args: api-key, project-id, app-file, flows" {
  run_script
  assert_success
  assert_args_contain "--apiKey rb_123"
  assert_args_contain "--project-id proj_123"
  assert_args_contain "--app-file app.apk"
  assert_args_contain "--flows flows"
  refute_output --partial "stub"
}
```

- [ ] **Step 2: Run and confirm fails**

Run: `bats __tests__/run-cloud.bats -f "required args"`
Expected: FAIL — stub script doesn't invoke fake-maestro.

- [ ] **Step 3: Replace the stub with the minimal real script**

```bash
# scripts/run-cloud.sh
#!/usr/bin/env bash

CLOUD_COMMAND=(maestro cloud
  --apiKey "$MDEV_API_KEY"
  --project-id "$MDEV_PROJECT_ID"
  ${MDEV_APP_FILE:+--app-file "$MDEV_APP_FILE"}
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

"${CLOUD_COMMAND[@]}"
```

- [ ] **Step 4: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats -f "required args"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-cloud.sh __tests__/run-cloud.bats
git commit -m "Add required-args construction to run-cloud script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Optional flag construction

**Files:**
- Modify: `__tests__/run-cloud.bats`
- Modify: `scripts/run-cloud.sh`

- [ ] **Step 1: Add the failing tests**

```bash
@test "omits --api-url when MDEV_API_URL unset" {
  run_script
  assert_success
  refute_output --partial "--api-url"
  ! grep -q -- "--api-url" "$FAKE_MAESTRO_ARGS_FILE"
}

@test "passes --api-url when MDEV_API_URL set" {
  export MDEV_API_URL="https://example.com"
  run_script
  assert_success
  assert_args_contain "--api-url https://example.com"
}

@test "passes branch, commit-sha, repo, pr id" {
  export MDEV_BRANCH="feat/x"
  export MDEV_COMMIT_SHA="deadbeef"
  export MDEV_REPO_OWNER="acme"
  export MDEV_REPO_NAME="widgets"
  export MDEV_PR_ID="42"
  run_script
  assert_success
  assert_args_contain "--branch feat/x"
  assert_args_contain "--commit-sha deadbeef"
  assert_args_contain "--repoOwner acme"
  assert_args_contain "--repoName widgets"
  assert_args_contain "--pullRequestId 42"
}

@test "passes mapping, device knobs, tags, timeout, name" {
  export MDEV_MAPPING_FILE="map.txt"
  export MDEV_DEVICE_OS="iOS-18-2"
  export MDEV_DEVICE_LOCALE="de_DE"
  export MDEV_DEVICE_MODEL="iPhone-11"
  export MDEV_INCLUDE_TAGS="dev,smoke"
  export MDEV_EXCLUDE_TAGS="flaky"
  export MDEV_TIMEOUT="90"
  export MDEV_NAME="Run name"
  run_script
  assert_success
  assert_args_contain "--mapping map.txt"
  assert_args_contain "--device-os iOS-18-2"
  assert_args_contain "--device-locale de_DE"
  assert_args_contain "--device-model iPhone-11"
  assert_args_contain "--include-tags dev,smoke"
  assert_args_contain "--exclude-tags flaky"
  assert_args_contain "--timeout 90"
  assert_args_contain "--name Run name"
}

@test "deprecated --android-api-level and --ios-version still pass" {
  export MDEV_ANDROID_API_LEVEL="29"
  export MDEV_IOS_VERSION="17"
  run_script
  assert_success
  assert_args_contain "--android-api-level 29"
  assert_args_contain "--ios-version 17"
}

@test "--async flag added when MDEV_ASYNC=true; omitted otherwise" {
  export MDEV_ASYNC="true"
  run_script
  assert_args_contain "--async"

  unset MDEV_ASYNC
  : > "$FAKE_MAESTRO_ARGS_FILE"
  run_script
  refute_output --partial "--async"
  ! grep -q -- "--async" "$FAKE_MAESTRO_ARGS_FILE"
}

@test "uses MDEV_APP_BINARY_ID when MDEV_APP_FILE empty" {
  unset MDEV_APP_FILE
  export MDEV_APP_BINARY_ID="bin_x"
  run_script
  assert_success
  assert_args_contain "--app-binary-id bin_x"
  refute_output --partial "--app-file"
  ! grep -q -- "--app-file" "$FAKE_MAESTRO_ARGS_FILE"
}

@test "defaults --flows to .maestro when MDEV_WORKSPACE empty" {
  unset MDEV_WORKSPACE
  run_script
  assert_args_contain "--flows .maestro"
}
```

- [ ] **Step 2: Run and confirm fails**

Run: `bats __tests__/run-cloud.bats`
Expected: most new tests FAIL.

- [ ] **Step 3: Expand the script with conditional flags**

Replace `scripts/run-cloud.sh`:

```bash
#!/usr/bin/env bash

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
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

"${CLOUD_COMMAND[@]}"
```

- [ ] **Step 4: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats`
Expected: all flag tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-cloud.sh __tests__/run-cloud.bats
git commit -m "Add optional flag construction to run-cloud script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Multiline `MDEV_ENV` → repeated `-e KEY=VAL`

**Files:**
- Modify: `__tests__/run-cloud.bats`
- Modify: `scripts/run-cloud.sh`

- [ ] **Step 1: Add the failing tests**

```bash
@test "MDEV_ENV single line becomes -e KEY=VAL" {
  export MDEV_ENV="FOO=bar"
  run_script
  assert_success
  assert_args_contain "-e FOO=bar"
}

@test "MDEV_ENV multiple lines become repeated -e args" {
  export MDEV_ENV=$'A=1\nB=2\nC=3'
  run_script
  assert_success
  assert_args_contain "-e A=1"
  assert_args_contain "-e B=2"
  assert_args_contain "-e C=3"
}

@test "MDEV_ENV preserves equals in value" {
  export MDEV_ENV="TOKEN=foo=bar=baz"
  run_script
  assert_success
  assert_args_contain "-e TOKEN=foo=bar=baz"
}

@test "MDEV_ENV empty does not add -e" {
  export MDEV_ENV=""
  run_script
  assert_success
  refute_output --partial "-e"
  ! grep -q -- "-e " "$FAKE_MAESTRO_ARGS_FILE"
}
```

- [ ] **Step 2: Run and confirm fails**

Run: `bats __tests__/run-cloud.bats -f "MDEV_ENV"`
Expected: FAILs.

- [ ] **Step 3: Add env splitting at the top of the script**

Insert before `CLOUD_COMMAND=(...)`:

```bash
env_args=()
if [ -n "$MDEV_ENV" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    env_args+=("-e" "$line")
  done <<< "$MDEV_ENV"
fi
```

Insert `"${env_args[@]+"${env_args[@]}"}"` into the `CLOUD_COMMAND` array right above `--flows`:

```bash
CLOUD_COMMAND=(maestro cloud
  ...
  ${MDEV_IOS_VERSION:+--ios-version "$MDEV_IOS_VERSION"}
  "${env_args[@]+"${env_args[@]}"}"
  --flows "${MDEV_WORKSPACE:-.maestro}"
)
```

- [ ] **Step 4: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-cloud.sh __tests__/run-cloud.bats
git commit -m "Split MDEV_ENV into repeated -e args

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Output parsing — clean stdout

**Files:**
- Modify: `__tests__/run-cloud.bats`
- Modify: `scripts/run-cloud.sh`

- [ ] **Step 1: Add the failing tests**

```bash
@test "writes MAESTRO_CLOUD_APP_BINARY_ID from clean stdout" {
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_APP_BINARY_ID=app_abc123$" "$GITHUB_OUTPUT"
}

@test "writes MAESTRO_CLOUD_CONSOLE_URL from clean stdout" {
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_CONSOLE_URL=https://app.maestro.dev/" "$GITHUB_OUTPUT"
}
```

- [ ] **Step 2: Run and confirm fails**

Run: `bats __tests__/run-cloud.bats -f "MAESTRO_CLOUD_"`
Expected: FAILs — script doesn't write to `$GITHUB_OUTPUT` yet.

- [ ] **Step 3: Add tee + parsing logic**

Replace the bottom of the script (the `"${CLOUD_COMMAND[@]}"` line) with:

```bash
OUTPUT_FILE=$(mktemp)
"${CLOUD_COMMAND[@]}" | tee "$OUTPUT_FILE"
EXIT_CODE=${PIPESTATUS[0]}

CLEANED=$(sed -E 's/\x1b\[[0-9;]*m//g' "$OUTPUT_FILE")

APP_BINARY_ID=$(echo "$CLEANED" | grep -oE "App binary id: \S+" | awk '{print $NF}' | head -n 1)
CONSOLE_URL=$(echo "$CLEANED" | grep -oE "https://app\.maestro\.dev/\S+" | head -n 1)

# CLI does not echo --app-binary-id when user supplied it; pass through.
if [ -z "$APP_BINARY_ID" ] && [ -n "$MDEV_APP_BINARY_ID" ]; then
  APP_BINARY_ID="$MDEV_APP_BINARY_ID"
fi

[ -n "$APP_BINARY_ID" ] && echo "MAESTRO_CLOUD_APP_BINARY_ID=$APP_BINARY_ID" >> "$GITHUB_OUTPUT"
[ -n "$CONSOLE_URL" ] && echo "MAESTRO_CLOUD_CONSOLE_URL=$CONSOLE_URL" >> "$GITHUB_OUTPUT"

rm -f "$OUTPUT_FILE"
exit "$EXIT_CODE"
```

- [ ] **Step 4: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-cloud.sh __tests__/run-cloud.bats
git commit -m "Parse APP_BINARY_ID and CONSOLE_URL from CLI stdout

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: ANSI-wrapped output parsing

**Files:**
- Modify: `__tests__/run-cloud.bats`

The `sed` cleanup is already in the script from Task 14; this task only adds the test that verifies it.

- [ ] **Step 1: Add the test**

```bash
@test "parses ANSI-wrapped APP_BINARY_ID and CONSOLE_URL" {
  export FAKE_MAESTRO_MODE="ansi"
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_APP_BINARY_ID=app_abc123$" "$GITHUB_OUTPUT"
  grep -q "^MAESTRO_CLOUD_CONSOLE_URL=https://app.maestro.dev/" "$GITHUB_OUTPUT"
  ! grep -q $'\033' "$GITHUB_OUTPUT"
}
```

- [ ] **Step 2: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats -f "ANSI"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/run-cloud.bats
git commit -m "Test ANSI-wrapped CLI stdout parsing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: `MDEV_APP_BINARY_ID` fallback when CLI omits it

**Files:**
- Modify: `__tests__/run-cloud.bats`

The fallback is already in the script from Task 14; this task adds the test.

- [ ] **Step 1: Add the test**

```bash
@test "falls back to MDEV_APP_BINARY_ID when CLI does not echo it" {
  unset MDEV_APP_FILE
  export MDEV_APP_BINARY_ID="bin_user_supplied"
  export FAKE_MAESTRO_MODE="no-binary-id"
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_APP_BINARY_ID=bin_user_supplied$" "$GITHUB_OUTPUT"
}
```

- [ ] **Step 2: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats -f "fallback"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/run-cloud.bats
git commit -m "Test app-binary-id fallback when CLI omits it

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Exit-code propagation

**Files:**
- Modify: `__tests__/run-cloud.bats`

- [ ] **Step 1: Add the test**

```bash
@test "exits with CLI exit code; outputs still written on failure" {
  export FAKE_MAESTRO_MODE="fail"
  # The "fail" mode writes args, so it doesn't print binary id; outputs may be
  # empty but the script must still exit with the CLI's code (1).
  run_script
  assert_failure 1
}
```

- [ ] **Step 2: Run and confirm passes**

Run: `bats __tests__/run-cloud.bats -f "exit code"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/run-cloud.bats
git commit -m "Test CLI exit-code propagation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C: action.yml, CI, deletions, CHANGELOG

### Task 18: Rewrite `action.yml` as composite

**Files:**
- Modify: `action.yml`

- [ ] **Step 1: Replace the file**

```yaml
name: "Maestro Cloud Upload Action"
description: "Upload your app to Maestro Cloud to run your Flows in CI"
inputs:
  api-url:
    description: "Alternative mobile.dev API url"
    required: false
  api-key:
    description: "mobile.dev API key"
    required: true
  name:
    description: "Name of the version of the uploaded app"
    required: false
  app-file:
    description: "The app file to upload to Maestro Cloud"
    required: false
  app-binary-id:
    description: "The app binary already uploaded to Maestro Cloud"
    required: false
  mapping-file:
    description: "The Proguard mapping file to upload to Maestro Cloud"
    required: false
  workspace:
    description: "Path to a folder that contains Maestro flows (.maestro by default)"
    required: false
  branch:
    description: "Branch name to use for the upload metadata (overrides automatic detection)."
    required: false
  env:
    description: "Set of key=value entries to pass as an input to Maestro flows"
    required: false
  async:
    description: "Whether to run Upload in async fashion and not block until completed"
    required: false
  android-api-level:
    description: "[Deprecated] Android API level. Use 'device-os' instead (e.g. android-33)."
    required: false
    deprecationMessage: "'android-api-level' is deprecated. Use 'device-os' instead."
  ios-version:
    description: "[Deprecated] iOS version. Use 'device-os' instead (e.g. iOS-18-2)."
    required: false
    deprecationMessage: "'ios-version' is deprecated. Use 'device-os' instead."
  device-locale:
    description: "Device locale to run your flow against"
    required: false
  device-model:
    description: "Device model to run your flow against"
    required: false
  device-os:
    description: "Device OS to run your flow against"
    required: false
  include-tags:
    description: "List of tags that will remove flows that do not have the provided tags"
    required: false
  exclude-tags:
    description: "List of tags that will remove flows containing the provided tags"
    required: false
  timeout:
    description: "Minutes to timeout while waiting for results"
    required: false
  project-id:
    description: "Maestro Cloud project ID"
    required: true
  maestro-cli-version:
    description: "Pin a specific Maestro CLI version (defaults to latest)"
    required: false
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
      env:
        # Note: env var names preserve the hyphens from action input names because
        # @actions/core's getInput('app-file') reads from INPUT_APP-FILE (it only
        # replaces spaces with underscores, not hyphens). The test harness in
        # __tests__/prelude.test.ts uses the same convention.
        INPUT_API-KEY: ${{ inputs.api-key }}
        INPUT_API-URL: ${{ inputs.api-url }}
        INPUT_PROJECT-ID: ${{ inputs.project-id }}
        INPUT_NAME: ${{ inputs.name }}
        INPUT_APP-FILE: ${{ inputs.app-file }}
        INPUT_APP-BINARY-ID: ${{ inputs.app-binary-id }}
        INPUT_MAPPING-FILE: ${{ inputs.mapping-file }}
        INPUT_WORKSPACE: ${{ inputs.workspace }}
        INPUT_BRANCH: ${{ inputs.branch }}
        INPUT_ENV: ${{ inputs.env }}
        INPUT_ASYNC: ${{ inputs.async }}
        INPUT_ANDROID-API-LEVEL: ${{ inputs.android-api-level }}
        INPUT_IOS-VERSION: ${{ inputs.ios-version }}
        INPUT_DEVICE-LOCALE: ${{ inputs.device-locale }}
        INPUT_DEVICE-MODEL: ${{ inputs.device-model }}
        INPUT_DEVICE-OS: ${{ inputs.device-os }}
        INPUT_INCLUDE-TAGS: ${{ inputs.include-tags }}
        INPUT_EXCLUDE-TAGS: ${{ inputs.exclude-tags }}
        INPUT_TIMEOUT: ${{ inputs.timeout }}
      run: node "${{ github.action_path }}/dist/prelude.js"

    - name: Run maestro cloud
      shell: bash
      env:
        MDEV_CI: github
      run: bash "${{ github.action_path }}/scripts/run-cloud.sh"
branding:
  icon: "upload-cloud"
  color: "blue"
```

- [ ] **Step 2: Verify action.yml is valid YAML**

Run: `python3 -c 'import yaml,sys; yaml.safe_load(open("action.yml"))' && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add action.yml
git commit -m "Rewrite action.yml as composite action invoking the Maestro CLI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Update CI workflow (`ci.yml`)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the file**

```yaml
name: CI

on:
  push:
  pull_request:
    branches:
      - main

jobs:
  test-prelude:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Verify dist/prelude.js is committed and current
        run: |
          if ! git diff --quiet dist/prelude.js; then
            echo "::error::dist/prelude.js is out of date — run 'npm run build' and commit."
            git diff dist/prelude.js | head -50
            exit 1
          fi

  test-run-cloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install bats
        run: |
          sudo apt-get update
          sudo apt-get install -y bats
          mkdir -p test/bats
          git clone --depth 1 https://github.com/bats-core/bats-support.git test/bats/bats-support
          git clone --depth 1 https://github.com/bats-core/bats-assert.git test/bats/bats-assert
      - name: Run bats
        env:
          BATS_LIB_PATH: ${{ github.workspace }}/test/bats
        run: bats __tests__/run-cloud.bats
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add bats job and dist freshness check to ci.yml

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Update `validate-local.yml` matrix

**Files:**
- Modify: `.github/workflows/validate-local.yml`

- [ ] **Step 1: Replace the file**

```yaml
name: Plugin Validation (Local)

on:
  workflow_dispatch:

jobs:
  validate:
    strategy:
      fail-fast: false
      matrix:
        runner: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.runner }}

    steps:
      - uses: actions/checkout@v6

      - name: Install JDK 17
        uses: actions/setup-java@v5
        with:
          distribution: "zulu"
          java-version: 17

      - name: Install Maestro (for download-samples)
        run: |
          curl -Ls --retry 3 --retry-all-errors "https://get.maestro.mobile.dev" | bash
          echo "${HOME}/.maestro/bin" >> $GITHUB_PATH
          echo -n "e2e" > ${HOME}/.maestro/uuid

      - name: Download samples
        run: maestro download-samples

      - name: Run Android test
        uses: ./
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          project-id: ${{ secrets.MAESTRO_CLOUD_PROJECT_ID }}
          app-file: samples/wikipedia.apk
          workspace: samples
          include-tags: advanced

      - name: Run iOS test
        uses: ./
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          project-id: ${{ secrets.MAESTRO_CLOUD_PROJECT_ID }}
          app-file: samples/wikipedia.zip
          workspace: samples
          include-tags: advanced
          device-os: iOS-18-2
          timeout: 180
```

Two changes from today's `validate-local.yml`:

1. Adds `runs-on` matrix `[ubuntu-latest, macos-latest]` to formally validate
   both platforms.
2. The workflow-level `Install Maestro` step is **kept** because
   `maestro download-samples` runs before the first Action invocation and
   needs the CLI on `$GITHUB_PATH`. The Action's own install step (composite
   step 1) is idempotent — when it runs, the curl re-installs harmlessly. We
   don't lose the consolidation goal because **production users** never see
   this duplicate install; it's only here so the smoke-test workflow can
   download samples before invoking the Action.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/validate-local.yml
git commit -m "Add Linux+macOS matrix to validate-local.yml

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Delete obsolete TypeScript and tests

**Files:**
- Delete: `index.ts`, `ApiClient.ts`, `StatusPoller.ts`, `app_file.ts`, `archive_utils.ts`, `uploadRequest.ts`, `log.ts`, `params.ts`
- Delete: `__tests__/archive_utils.test.ts`, `__tests__/uploadRequest.test.ts`, `__tests__/getParameters.test.ts`, `__tests__/params.test.ts`
- Delete: `README.md.bkp`
- Delete: old `dist/index.js`

- [ ] **Step 1: Delete the source files**

```bash
git rm index.ts ApiClient.ts StatusPoller.ts app_file.ts archive_utils.ts uploadRequest.ts log.ts params.ts
git rm __tests__/archive_utils.test.ts __tests__/uploadRequest.test.ts __tests__/getParameters.test.ts __tests__/params.test.ts
git rm README.md.bkp
```

- [ ] **Step 2: Delete the old bundle**

```bash
git rm dist/index.js
# If dist contains other stale files (.d.ts, etc.), remove them too:
ls dist/
# Remove any file that isn't prelude.js
```

If `dist/` contains files other than `prelude.js`, remove them with `git rm`.

- [ ] **Step 3: Update `package.json` dependencies**

Remove from `dependencies`: `archiver`, `console-log-colors`, `glob`, `node-fetch`, `node-stream-zip`.
Remove from `devDependencies`: `@types/glob`.

After editing, run:

```bash
rm -rf node_modules package-lock.json
npm install
```

This regenerates `package-lock.json` with the slimmer dependency set.

- [ ] **Step 4: Verify the test suite still passes**

Run: `npm test`
Expected: PASS — only `__tests__/prelude.test.ts` runs.

Run: `bats __tests__/run-cloud.bats`
Expected: PASS — all bats tests still pass.

Run: `npm run build`
Expected: `dist/prelude.js` regenerates without errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove obsolete TypeScript modules and dependencies

The HTTP client, status poller, archive utilities, and app-file
inspector are replaced by the Maestro CLI invocation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Add `CHANGELOG.md`

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create the file**

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

### Added
- New input `maestro-cli-version` to pin the installed Maestro CLI version
  (defaults to latest).

### Changed
- Action is now a composite action that invokes the Maestro CLI directly,
  replacing the bundled TypeScript HTTP client. Aligns with the Bitrise step
  and Bitbucket pipe.
- Per-flow log lines now use the CLI's format (e.g. `Passed login.yaml (15s)`)
  instead of v1's `[Passed] login.yaml`.
- Linux (`ubuntu-latest`) and macOS (`macos-latest`) GitHub-hosted runners
  are formally supported. Windows runners are not supported.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "Add CHANGELOG documenting the CLI migration under [Unreleased]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Final smoke test (manual)

This is a verification step, not a code change.

- [ ] **Step 1: Re-run the full test suite locally**

```bash
npm test                                              # Jest — prelude
bats __tests__/run-cloud.bats                         # bats — run-cloud
npm run build                                         # ncc — verify dist
git diff --quiet dist/prelude.js && echo "dist clean" # bundle is up to date
```

Expected: all green.

- [ ] **Step 2: Trigger `validate-local.yml` against the working branch**

Push the branch and dispatch the workflow:

```bash
git push -u origin "$(git branch --show-current)"
gh workflow run validate-local.yml --ref "$(git branch --show-current)"
gh run watch
```

Expected: both `ubuntu-latest` and `macos-latest` matrix jobs succeed.

- [ ] **Step 3: Inspect the workflow log**

Confirm in the run output that:
- The CLI installs successfully on both runners.
- The `Run Android test` and `Run iOS test` steps show CLI-format log lines (`Passed flow.yaml (Ns)`).
- `MAESTRO_CLOUD_APP_BINARY_ID` and `MAESTRO_CLOUD_CONSOLE_URL` are set as outputs (visible in the post-step summary).

- [ ] **Step 4: No commit needed** — this task only verifies prior work.

---

## Out of scope (handled in the follow-up bump PR)

- Tag `v2.x.0`, move the rolling `v2` GitHub tag.
- Update README pin examples (currently `@v2.0.2` × 17 occurrences).
- Add a "Upgrading from v1" section to README.
- Drop `MAESTRO_CLOUD_FLOW_RESULTS` / `MAESTRO_CLOUD_UPLOAD_STATUS` from the
  README outputs table.
- Rename `[Unreleased]` → `[v2.x.0] (YYYY-MM-DD)` in CHANGELOG.
- Update `validate.yml` (the published-pin workflow) matrix.
