#!/bin/bash

set -e

VERSION=$1

if [[ -z "$VERSION" ]]; then
  echo "Usage: npm run release <version>"
  exit 1
fi

ncc build index.ts
sed -i.bkp "s/action-maestro-cloud@v.*/action-maestro-cloud@v${VERSION}/g" README.md
git add -A
git commit --allow-empty -m "Version ${VERSION}"
git tag -a "v${VERSION}" -m "Version ${VERSION}"
git push
git push --tags
