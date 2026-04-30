#!/usr/bin/env bash

CLOUD_COMMAND=(maestro cloud
  --apiKey "$MDEV_API_KEY"
  --project-id "$MDEV_PROJECT_ID"
  ${MDEV_APP_FILE:+--app-file "$MDEV_APP_FILE"}
  --flows "${MDEV_WORKSPACE:-.maestro}"
)

"${CLOUD_COMMAND[@]}"
