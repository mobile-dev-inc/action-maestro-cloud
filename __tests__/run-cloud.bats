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
