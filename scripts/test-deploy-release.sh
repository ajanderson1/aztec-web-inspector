#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
root="$tmp/releases"
mkdir -p "$root/.incoming"
old_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
new_id=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

fixture() {
  local id=$1
  local dir="$root/.incoming/$id"
  local prior_umask
  prior_umask=$(umask)
  umask 077
  mkdir -p "$dir/assets" "$dir/samples"
  printf '<title>aztec-web-inspector</title><script src="/assets/app-abc123.js"></script><link href="/assets/app-abc123.css" rel="stylesheet">\n' > "$dir/index.html"
  printf 'window.app=true;\n' > "$dir/assets/app-abc123.js"
  printf 'body { color: black; }\n' > "$dir/assets/app-abc123.css"
  printf 'sample\n' > "$dir/samples/sample-compact-1.png"
  printf '%s\n' "$id" > "$dir/release.txt"
  umask "$prior_umask"
}

expect_failure() {
  if bash "$script_dir/deploy-release.sh" "$@" > /dev/null 2>&1; then
    printf 'unexpected success: %s\n' "$*" >&2
    exit 1
  fi
  [[ $(readlink "$root/current") == "$expected_current" ]] || { echo 'current changed after failed deploy' >&2; exit 1; }
}

expected_current=$old_id
fixture "$old_id"
bash "$script_dir/deploy-release.sh" "$old_id" "$root/.incoming/$old_id" "$root"
[[ $(readlink "$root/current") == "$old_id" ]] || exit 1
[[ -f "$root/$old_id/index.html" ]] || exit 1
mode() { stat -f %Lp "$1" 2>/dev/null || stat -c %a "$1"; }
[[ $(mode "$root/$old_id") == 755 ]] || { echo 'published directory is not traversable by Caddy' >&2; exit 1; }
[[ $(mode "$root/$old_id/index.html") == 644 ]] || { echo 'published file is not readable by Caddy' >&2; exit 1; }
fixture "$new_id"
rm "$root/.incoming/$new_id/index.html"
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
fixture "$new_id"
printf '%s\n' wrong > "$root/.incoming/$new_id/release.txt"
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
fixture "$new_id"
rm "$root/.incoming/$new_id/assets/app-abc123.js"
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
fixture "$new_id"
rm "$root/.incoming/$new_id/assets/app-abc123.css"
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
fixture "$new_id"
rm "$root/.incoming/$new_id/samples/sample-compact-1.png"
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
fixture "$new_id"
expect_failure ../escape "$root/.incoming/$new_id" "$root"
expect_failure "$new_id" "$tmp/elsewhere" "$root"
bash "$script_dir/deploy-release.sh" "$new_id" "$root/.incoming/$new_id" "$root"
[[ $(readlink "$root/current") == "$new_id" && -f "$root/$old_id/index.html" ]] || exit 1
[[ ! -d "$root/current/$old_id" ]] || { echo 'current became a directory' >&2; exit 1; }
expected_current=$new_id
expect_failure "$new_id" "$root/.incoming/$new_id" "$root"
echo 'release contract: PASS'
