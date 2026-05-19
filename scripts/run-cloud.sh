#!/usr/bin/env bash

# Resolve the action root (one level up from scripts/) so we can locate
# dist/postprocess.js regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_DIR="$(dirname "$SCRIPT_DIR")"

env_args=()
if [ -n "$MDEV_ENV" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    env_args+=("-e" "$line")
  done <<< "$MDEV_ENV"
fi

# JUnit XML is produced in sync mode so we can reconstruct
# MAESTRO_CLOUD_FLOW_RESULTS. The CLI doesn't expose a JSON format.
# In async mode --format/--output are omitted: the CLI rejects --format with
# --async (CloudInteractor.kt:104) since there are no results at upload time.
# Explicit template (no `-t`) so mktemp behaves the same on BSD (macOS) and GNU.
JUNIT_FILE=$(mktemp "${TMPDIR:-/tmp}/maestro-junit.XXXXXX") || { echo "::error::failed to create temp junit file"; exit 1; }

# Built before CLOUD_COMMAND so the array can splice it cleanly. We can't use
# ${MDEV_ASYNC:-...} inline because that substitutes MDEV_ASYNC's *value*
# ("true") when set — leaking a stray positional that the CLI parses as the
# flows path. An explicit array keeps the expansion behavior unambiguous.
format_args=()
if [ -z "$MDEV_ASYNC" ]; then
  format_args=(--format junit --output "$JUNIT_FILE")
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
  "${format_args[@]+"${format_args[@]}"}"
  "${env_args[@]+"${env_args[@]}"}"
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

OUTPUT_FILE=$(mktemp) || { echo "::error::failed to create temp file for CLI output"; exit 1; }
trap 'rm -f "$OUTPUT_FILE" "$JUNIT_FILE"' EXIT

"${CLOUD_COMMAND[@]}" | tee "$OUTPUT_FILE"
EXIT_CODE=${PIPESTATUS[0]}

# Strip ANSI escapes the CLI emits via PrintUtils.cyan() (maestro-cli source:
# CloudInteractor.kt:402, 419-420). Without this, grep captures the escape
# sequences and the parsed values contain control characters.
# Use a literal ESC byte (printf '\033') because BSD sed (macOS) does not
# interpret \x1b — the GNU form silently fails to strip and breaks parsing.
ESC=$(printf '\033')
CLEANED=$(sed -E "s/${ESC}\[[0-9;]*m//g" "$OUTPUT_FILE")

# These regexes match the CLI's stdout format in
# maestro-cli/src/main/java/maestro/cli/cloud/CloudInteractor.kt:402,419-420.
# If a CLI release changes the wording or wraps the output differently, these
# need updating — the bats tests only verify against the current strings.
APP_BINARY_ID=$(echo "$CLEANED" | grep -oE "App binary id: \S+" | awk '{print $NF}' | head -n 1)
CONSOLE_URL=$(echo "$CLEANED" | grep -oE "https://app\.maestro\.dev/\S+" | head -n 1)

# CLI does not echo --app-binary-id when the user supplied it (the upload step
# is skipped — CloudInteractor.kt:139-155); pass the input value through.
if [ -z "$APP_BINARY_ID" ] && [ -n "$MDEV_APP_BINARY_ID" ]; then
  APP_BINARY_ID="$MDEV_APP_BINARY_ID"
fi

[ -n "$APP_BINARY_ID" ] && echo "MAESTRO_CLOUD_APP_BINARY_ID=$APP_BINARY_ID" >> "$GITHUB_OUTPUT"
[ -n "$CONSOLE_URL" ] && echo "MAESTRO_CLOUD_CONSOLE_URL=$CONSOLE_URL" >> "$GITHUB_OUTPUT"

# Reconstruct MAESTRO_CLOUD_FLOW_RESULTS from the junit XML.
# Always invoked — postprocess emits an empty array if the junit file is
# missing (e.g. async upload, or CLI failed before the report was written).
# Exit code is passed only when not async; that's what gates UPLOAD_STATUS
# emission inside postprocess (README: "not available in async mode").
if [ -n "$MDEV_ASYNC" ]; then
  node "${ACTION_DIR}/dist/postprocess.js" "$JUNIT_FILE"
else
  node "${ACTION_DIR}/dist/postprocess.js" "$JUNIT_FILE" "$EXIT_CODE"
fi

exit "$EXIT_CODE"
