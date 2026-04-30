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
