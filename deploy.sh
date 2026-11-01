#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
host="${DEPLOY_HOST:-51tokens}"
release="$(date -u +%Y%m%dT%H%M%SZ)"
staging="$(mktemp -d /tmp/phonetic-head-deploy.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
bash build.sh "$staging/site.tar.gz"
ssh -o BatchMode=yes "$host" "mkdir -p /opt/cf-origin-ssl/phonetic-head/releases/$release"
scp "$staging/site.tar.gz" "${host}:/opt/cf-origin-ssl/phonetic-head/releases/$release/site.tar.gz"
scp deploy/Caddyfile "${host}:/opt/cf-origin-ssl/phonetic-head/releases/$release/Caddyfile"
ssh -o BatchMode=yes "$host" bash -s -- "$release" <<'REMOTE'
set -euo pipefail
release="$1"
base=/opt/cf-origin-ssl/phonetic-head
target="$base/releases/$release"
config=/opt/cf-origin-ssl/Caddyfile
previous="$(readlink "$base/current" || true)"
cp "$config" "$target/Caddyfile.before"
if [[ -f "$base/active.Caddyfile" ]]; then cp "$base/active.Caddyfile" "$target/active.before"; fi
rollback() {
    cp "$target/Caddyfile.before" "$config"
    if [[ -f "$target/active.before" ]]; then cp "$target/active.before" "$base/active.Caddyfile"; fi
    if [[ -n "$previous" ]]; then ln -sfn "$previous" "$base/current"; else rm -f "$base/current"; fi
    docker exec cf-origin-ssl caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}
trap rollback ERR
mkdir "$target/site"
tar -xzf "$target/site.tar.gz" -C "$target/site" --no-same-owner
rm "$target/site.tar.gz"
test -s "$target/site/index.html"
test -s "$target/site/assets/phonetic-head.glb"
ln -sfn "releases/$release/site" "$base/current"
if ! grep -Fxq 'import /etc/caddy/phonetic-head/active.Caddyfile' "$config"; then
    ! grep -Fq 'test.upit.top' "$config"
    printf '\nimport /etc/caddy/phonetic-head/active.Caddyfile\n' >> "$config"
fi
cp "$target/Caddyfile" "$base/active.Caddyfile"
docker exec cf-origin-ssl caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec cf-origin-ssl caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/ | grep -q '我的英语小课堂'
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/api/coach/status | grep -Fq '"configured":false'
for encoding in br gzip; do
    curl -kfsSI --resolve test.upit.top:443:127.0.0.1 -H "Accept-Encoding: $encoding" https://test.upit.top/assets/phonetic-head.glb | grep -qi "^content-encoding: $encoding"
done
trap - ERR
echo "Deployed release: $release"
REMOTE
echo 'Origin ready. Public URL: https://test.upit.top/'
