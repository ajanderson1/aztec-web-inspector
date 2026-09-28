#!/usr/bin/env bash
set -euo pipefail
(( $# == 2 )) || { echo 'usage: verify-deployment.sh <base-url> <commit-sha>' >&2; exit 2; }
base=${1%/}
id=$2
[[ $id =~ ^[[:xdigit:]]{40}$ ]] || exit 2
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
fetch() { curl --fail --silent --show-error --max-time 12 -H 'Cache-Control: no-cache' "$base$1"; }
fetch "/release.txt" > "$tmp/release"
[[ $(< "$tmp/release") == "$id" ]] || { echo 'wrong release' >&2; exit 1; }
fetch "/index.html" > "$tmp/index"
grep -q '<title>aztec-web-inspector</title>' "$tmp/index" || { echo 'wrong page' >&2; exit 1; }
fetch '/samples/sample-compact-1.png' > "$tmp/sample"
[[ -s $tmp/sample ]] || exit 1
# Check every referenced entrypoint, not only the first JavaScript file.
assets=$(grep -oE '/assets/[a-zA-Z0-9_.-]+\.(js|css)' "$tmp/index" | sort -u)
[[ -n $assets ]] || exit 1
while IFS= read -r asset; do
  fetch "$asset" > "$tmp/asset"
  [[ -s $tmp/asset ]] || exit 1
done <<< "$assets"
printf 'verified %s\n' "$id"
