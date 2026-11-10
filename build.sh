#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
output="${1:-/tmp/phonetic-head-site.tar.gz}"
if command -v go >/dev/null 2>&1; then go clean -cache; fi
rm -rf .artifacts interactive-lab/.artifacts
cd interactive-lab
npm ci --no-audit --no-fund
bash models/build.sh
npm test
npm run test:server
npm run test:admin-ui
npm run test:i18n-ui
test -s dist/index.html
test -s dist/learn.html
test -s dist/assets/phonetic-head.glb
# The checked-in browser assets are the build; do not regenerate authored audio/models.
staging="$(mktemp -d /tmp/phonetic-head-build.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
cp -R dist "$staging/dist"
cp package.json server.mjs admin-service.mjs course-store.mjs speech.mjs "$staging/"
chmod 755 "$staging"
node compress-models.mjs "$staging/dist/assets"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$output" -C "$staging" .
tar -tzf "$output" >/dev/null
echo "Built: $output"
