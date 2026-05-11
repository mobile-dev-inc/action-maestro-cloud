#!/bin/bash

set -e

VERSION=$1
MAJOR_VERSION=$(echo "$VERSION" | cut -d '.' -f 1)
RELEASE_BRANCH="release-${VERSION}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: npm run release <version>"
  exit 1
fi

# Pre-flight: clean working tree, no preexisting tag
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "Error: tag v${VERSION} already exists locally. Delete it: git tag -d v${VERSION}"
  exit 1
fi

if git ls-remote --tags origin "refs/tags/v${VERSION}" | grep -q "refs/tags/v${VERSION}$"; then
  echo "Error: tag v${VERSION} already exists on origin."
  exit 1
fi

# 1. Start from latest main
echo "==> Syncing main"
git checkout main
git pull origin main

# 2. Create the release branch
echo "==> Creating ${RELEASE_BRANCH}"
git checkout -B "${RELEASE_BRANCH}"

# 3. Build + bump README
echo "==> Building"
npm run build

echo "==> Updating README"
sed -i.bkp "s/action-maestro-cloud@v.*/action-maestro-cloud@v${VERSION}/g" README.md

git add -A
git commit --allow-empty -m "Version ${VERSION}"

# 4. Push branch and open PR
echo "==> Pushing ${RELEASE_BRANCH}"
git push -u origin "${RELEASE_BRANCH}"

echo "==> Opening PR"
PR_URL=$(gh pr create \
  --base main \
  --head "${RELEASE_BRANCH}" \
  --title "Version ${VERSION}" \
  --body "Release v${VERSION}")
echo "PR: ${PR_URL}"

# 5. Enable auto-merge (squash) and wait for it to land
echo "==> Enabling auto-merge"
gh pr merge "${PR_URL}" --auto --squash

echo "==> Waiting for PR to merge (Ctrl-C to abort; rerun this script after manual merge to tag)"
while true; do
  STATE=$(gh pr view "${PR_URL}" --json state -q .state)
  case "$STATE" in
    MERGED)
      echo "PR merged."
      break
      ;;
    CLOSED)
      echo "Error: PR was closed without merging."
      exit 1
      ;;
  esac
  sleep 10
done

# 6. Tag main and push tags
echo "==> Tagging main"
git checkout main
git pull origin main
git tag -a "v${VERSION}" -m "Version ${VERSION}"
git tag -fa "v${MAJOR_VERSION}" -m "Update v${MAJOR_VERSION} tag"

echo "==> Pushing tags"
git push origin "v${VERSION}"
git push origin "v${MAJOR_VERSION}" --force

echo "==> Released v${VERSION}"
