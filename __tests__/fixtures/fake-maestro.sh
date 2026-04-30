#!/usr/bin/env bash
# Fake maestro CLI for bats tests. Records its argv to $FAKE_MAESTRO_ARGS_FILE,
# emits canned stdout based on $FAKE_MAESTRO_MODE, and writes a fake junit XML
# to whatever path follows --output (so the post-processor has data to parse).
echo "$@" > "$FAKE_MAESTRO_ARGS_FILE"

# Locate --output so we can write a fake junit report there.
JUNIT_OUTPUT_PATH=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--output" ]; then
    JUNIT_OUTPUT_PATH="$arg"
    break
  fi
  prev="$arg"
done

write_junit() {
  local body="$1"
  if [ -n "$JUNIT_OUTPUT_PATH" ]; then
    cat > "$JUNIT_OUTPUT_PATH" <<XML
<?xml version="1.0" encoding="UTF-8" ?>
<testsuites>
  <testsuite name="Test Suite" tests="2" failures="0">
${body}
  </testsuite>
</testsuites>
XML
  fi
}

case "${FAKE_MAESTRO_MODE:-default}" in
  default)
    echo "App binary id: app_abc123"
    echo "Visit Maestro Cloud for more details about this upload:"
    echo "https://app.maestro.dev/project/proj_123/maestro-test/app/app_x/upload/upload_abc"
    write_junit '    <testcase name="login" classname="login" status="SUCCESS"/>
    <testcase name="checkout" classname="checkout" status="SUCCESS"/>'
    ;;
  ansi)
    # Cyan-wrapped values, mimicking PrintUtils.cyan()
    printf 'App binary id: \033[36mapp_abc123\033[0m\n'
    echo "Visit Maestro Cloud for more details about this upload:"
    printf '\033[36mhttps://app.maestro.dev/project/proj_123/upload/upload_abc\033[0m\n'
    write_junit '    <testcase name="login" classname="login" status="SUCCESS"/>'
    ;;
  no-binary-id)
    # CLI doesn't echo "App binary id" when user supplied --app-binary-id
    echo "Visit Maestro Cloud for more details about this upload:"
    echo "https://app.maestro.dev/project/proj_123/upload/upload_abc"
    write_junit '    <testcase name="login" classname="login" status="SUCCESS"/>'
    ;;
  flow-failure)
    # CLI ran end-to-end but at least one flow failed; non-zero exit + junit XML.
    echo "App binary id: app_abc123"
    echo "Visit Maestro Cloud for more details about this upload:"
    echo "https://app.maestro.dev/project/proj_123/upload/upload_abc"
    write_junit '    <testcase name="login" classname="login" status="SUCCESS"/>
    <testcase name="checkout" classname="checkout" status="ERROR"><failure>Element not found</failure></testcase>'
    exit 1
    ;;
  fail)
    echo "Some failure happened"
    exit 1
    ;;
esac

exit 0
