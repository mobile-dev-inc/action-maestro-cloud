#!/bin/bash

set -e

VERSION=$1

if [[ -z "$VERSION" ]]; then
  echo "Usage: npm run release <version>"
  exit 1
fi

ncc build index.ts
git add -A
git commit --allow-empty -m "Version ${VERSION}"
git tag -a "v${VERSION}" -m "Version ${VERSION}"
git push
git push --tags
