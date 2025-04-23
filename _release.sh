#!/bin/bash

set -e

VERSION=$1
MAJOR_VERSION=$(echo "$VERSION" | cut -d '.' -f 1)

if [[ -z "$VERSION" ]]; then
  echo "Usage: npm run release <version>"
  exit 1
fi

npm run build
sed -i.bkp "s/action-maestro-cloud@v.*/action-maestro-cloud@v${VERSION}/g" README.md
git add -A
git commit --allow-empty -m "Version ${VERSION}"
git tag -a "v${VERSION}" -m "Version ${VERSION}"
git push
git push --tags --force
# update major version tag
git tag -fa "v${MAJOR_VERSION}" -m "Update v${MAJOR_VERSION} tag"
git push origin "v${MAJOR_VERSION}" --force
