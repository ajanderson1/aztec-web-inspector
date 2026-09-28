#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
mkdir -p "$tmp/assets" "$tmp/samples"
printf '<title>aztec-web-inspector</title><script src="/assets/app-abc123.js"></script>\n' > "$tmp/index.html"
printf 'app\n' > "$tmp/assets/app-abc123.js"
printf 'sample\n' > "$tmp/samples/sample-compact-1.png"
printf '%s\n' "$id" > "$tmp/release.txt"

check_fails() {
  if bash "$script_dir/verify-deployment.sh" "file://$tmp" "$id" >/dev/null 2>&1; then
    echo 'verification accepted a broken release' >&2
    exit 1
  fi
}
check_passes() {
  bash "$script_dir/verify-deployment.sh" "file://$tmp" "$id" >/dev/null || exit 1
}
check_passes
printf 'wrong\n' > "$tmp/release.txt"
check_fails
printf '%s\n' "$id" > "$tmp/release.txt"
printf '<title>different site</title><script src="/assets/app-abc123.js"></script>\n' > "$tmp/index.html"
check_fails
printf '<title>aztec-web-inspector</title><script src="/assets/app-abc123.js"></script>\n' > "$tmp/index.html"
rm "$tmp/assets/app-abc123.js"
check_fails
printf 'app\n' > "$tmp/assets/app-abc123.js"
rm "$tmp/samples/sample-compact-1.png"
check_fails
printf 'sample\n' > "$tmp/samples/sample-compact-1.png"
check_passes
echo 'deployment verification contract: PASS'
