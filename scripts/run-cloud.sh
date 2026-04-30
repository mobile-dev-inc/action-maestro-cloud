#!/usr/bin/env bash

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
  "${env_args[@]+"${env_args[@]}"}"
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

"${CLOUD_COMMAND[@]}"
