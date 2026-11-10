#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
host="${DEPLOY_HOST:-51tokens}"
release="${DEPLOY_RESUME_RELEASE:-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo 'Invalid release ID' >&2; exit 2; }
staging="$(mktemp -d /tmp/phonetic-head-deploy.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
if [[ -z "${DEPLOY_RESUME_RELEASE:-}" ]]; then
    bash build.sh "$staging/site.tar.gz"
    ssh -o BatchMode=yes "$host" "mkdir -p /opt/cf-origin-ssl/phonetic-head/releases/$release"
    scp "$staging/site.tar.gz" "${host}:/opt/cf-origin-ssl/phonetic-head/releases/$release/site.tar.gz"
else
    ssh -o BatchMode=yes "$host" "test -s /opt/cf-origin-ssl/phonetic-head/releases/$release/app/server.mjs"
fi
scp deploy/Caddyfile "${host}:/opt/cf-origin-ssl/phonetic-head/releases/$release/Caddyfile"
scp deploy/phonetic-head.service "${host}:/opt/cf-origin-ssl/phonetic-head/releases/$release/phonetic-head.service"
ssh -o BatchMode=yes "$host" bash -s -- "$release" <<'REMOTE'
set -euo pipefail
release="$1"
base=/opt/cf-origin-ssl/phonetic-head
target="$base/releases/$release"
config=/opt/cf-origin-ssl/Caddyfile
previous="$(readlink "$base/current" || true)"
previous_runtime="$(readlink "$base/runtime" || true)"
unit=/etc/systemd/system/phonetic-head.service
if [[ -f "$unit" ]]; then cp "$unit" "$target/service.before"; fi
cp "$config" "$target/Caddyfile.before"
if [[ -f "$base/active.Caddyfile" ]]; then cp "$base/active.Caddyfile" "$target/active.before"; fi
rollback() {
    cp "$target/Caddyfile.before" "$config"
    if [[ -f "$target/active.before" ]]; then cp "$target/active.before" "$base/active.Caddyfile"; fi
    if [[ -n "$previous" ]]; then ln -sfn "$previous" "$base/current"; else rm -f "$base/current"; fi
    if [[ -n "$previous_runtime" ]]; then ln -sfn "$previous_runtime" "$base/runtime"; fi
    if [[ -f "$target/service.before" ]]; then
        cp "$target/service.before" "$unit"
        systemctl daemon-reload
        systemctl restart phonetic-head
    else
        systemctl disable --now phonetic-head || true
    fi
    docker exec cf-origin-ssl caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}
trap rollback ERR
if [[ ! -d "$target/app" ]]; then
    mkdir "$target/app"
    tar -xzf "$target/site.tar.gz" -C "$target/app" --no-same-owner
    rm "$target/site.tar.gz"
fi
test -s "$target/app/dist/index.html"
test -s "$target/app/dist/assets/phonetic-head.glb"
test -s "$target/app/server.mjs"
id -u phonetic-head >/dev/null 2>&1 || useradd --system --home-dir /var/lib/phonetic-head --shell /usr/sbin/nologin phonetic-head
ln -sfn "releases/$release/app" "$base/runtime"
ln -sfn "releases/$release/app/dist" "$base/current"
cp "$target/phonetic-head.service" "$unit"
systemctl daemon-reload
systemctl enable phonetic-head
systemctl restart phonetic-head
curl --retry 15 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:4174/api/health | grep -F '"ok":true' >/dev/null
if ! grep -Fxq 'import /etc/caddy/phonetic-head/active.Caddyfile' "$config"; then
    ! grep -Fq 'test.upit.top' "$config"
    printf '\nimport /etc/caddy/phonetic-head/active.Caddyfile\n' >> "$config"
fi
cp "$target/Caddyfile" "$base/active.Caddyfile"
docker exec cf-origin-ssl caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec cf-origin-ssl caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/ | grep '我的英语小课堂' >/dev/null
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/api/coach/status | grep -F '"configured":' >/dev/null
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/admin.html | grep '课程管理' >/dev/null
curl -kfsS --resolve test.upit.top:443:127.0.0.1 https://test.upit.top/api/curriculum | grep -F '"series"' >/dev/null
for encoding in br gzip; do
    curl -kfsSI --resolve test.upit.top:443:127.0.0.1 -H "Accept-Encoding: $encoding" https://test.upit.top/assets/phonetic-head.glb | grep -i "^content-encoding: $encoding" >/dev/null
done
trap - ERR
echo "Deployed release: $release"
REMOTE
echo 'Origin ready. Public URL: https://test.upit.top/'
