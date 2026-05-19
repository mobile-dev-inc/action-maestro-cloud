#!/usr/bin/env bats

# Loaded via BATS_LIB_PATH; CI sets this to a checkout location.
# Local: BATS_LIB_PATH=/Users/prokshluthra/.nvm/versions/node/v20.19.0/lib/node_modules bats __tests__/run-cloud.bats
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

@test "required args: api-key, project-id, app-file, flows" {
  run_script
  assert_success
  assert_args_contain "--apiKey rb_123"
  assert_args_contain "--project-id proj_123"
  assert_args_contain "--app-file app.apk"
  assert_args_contain "--flows flows"
  refute_output --partial "stub"
}

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
  ! grep -q -- "-e " "$FAKE_MAESTRO_ARGS_FILE"
}

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

@test "parses ANSI-wrapped APP_BINARY_ID and CONSOLE_URL" {
  export FAKE_MAESTRO_MODE="ansi"
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_APP_BINARY_ID=app_abc123$" "$GITHUB_OUTPUT"
  grep -q "^MAESTRO_CLOUD_CONSOLE_URL=https://app.maestro.dev/" "$GITHUB_OUTPUT"
  ! grep -q $'\033' "$GITHUB_OUTPUT"
}

@test "falls back to MDEV_APP_BINARY_ID when CLI does not echo it" {
  unset MDEV_APP_FILE
  export MDEV_APP_BINARY_ID="bin_user_supplied"
  export FAKE_MAESTRO_MODE="no-binary-id"
  run_script
  assert_success
  grep -q "^MAESTRO_CLOUD_APP_BINARY_ID=bin_user_supplied$" "$GITHUB_OUTPUT"
}

@test "exits with CLI exit code; outputs still written on failure" {
  export FAKE_MAESTRO_MODE="fail"
  run_script
  assert_failure 1
}

@test "passes --format junit and --output to the CLI in sync mode" {
  run_script
  assert_success
  assert_args_contain "--format junit"
  assert_args_contain "--output"
}

# CloudInteractor.kt:104 rejects --format with --async ("Cannot use --format
# with --async"), so neither --format nor --output may be passed in async mode.
@test "omits --format and --output when MDEV_ASYNC=true" {
  export MDEV_ASYNC="true"
  run_script
  assert_success
  ! grep -q -- "--format" "$FAKE_MAESTRO_ARGS_FILE"
  ! grep -q -- "--output" "$FAKE_MAESTRO_ARGS_FILE"
}

# NOTE: @actions/core.setOutput uses GitHub's heredoc framing in $GITHUB_OUTPUT
#   NAME<<delimiter
#   value
#   delimiter
# These tests verify the JSON content rather than the surrounding framing.

@test "writes MAESTRO_CLOUD_FLOW_RESULTS as JSON for default (all-pass) mode" {
  run_script
  assert_success
  grep -q "MAESTRO_CLOUD_FLOW_RESULTS<<" "$GITHUB_OUTPUT"
  grep -qF '"name":"login","status":"SUCCESS","errors":[]' "$GITHUB_OUTPUT"
  grep -qF '"name":"checkout","status":"SUCCESS","errors":[]' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_FLOW_RESULTS captures failure messages" {
  export FAKE_MAESTRO_MODE="flow-failure"
  run_script
  assert_failure 1
  grep -qF '"name":"checkout","status":"ERROR","errors":["Element not found"]' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_FLOW_RESULTS is empty array when no junit produced" {
  export FAKE_MAESTRO_MODE="fail"  # exits before writing junit
  run_script
  assert_failure 1
  grep -q "MAESTRO_CLOUD_FLOW_RESULTS<<" "$GITHUB_OUTPUT"
  grep -qFx '[]' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_UPLOAD_STATUS=SUCCESS for all-pass run" {
  run_script
  assert_success
  grep -qF "MAESTRO_CLOUD_UPLOAD_STATUS<<" "$GITHUB_OUTPUT"
  grep -qFx 'SUCCESS' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_UPLOAD_STATUS=ERROR for flow-failure run" {
  export FAKE_MAESTRO_MODE="flow-failure"
  run_script
  assert_failure 1
  grep -qFx 'ERROR' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_UPLOAD_STATUS=ERROR when CLI fails before junit" {
  export FAKE_MAESTRO_MODE="fail"
  run_script
  assert_failure 1
  grep -qFx 'ERROR' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_UPLOAD_STATUS=CANCELED when a flow is cancelled" {
  export FAKE_MAESTRO_MODE="cancelled"
  run_script
  assert_success
  grep -qFx 'CANCELED' "$GITHUB_OUTPUT"
}

@test "MAESTRO_CLOUD_UPLOAD_STATUS not emitted in async mode" {
  export MDEV_ASYNC="true"
  run_script
  assert_success
  ! grep -qF "MAESTRO_CLOUD_UPLOAD_STATUS" "$GITHUB_OUTPUT"
}
