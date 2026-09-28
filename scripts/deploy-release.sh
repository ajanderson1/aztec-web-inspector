#!/usr/bin/env bash
set -euo pipefail

if (( $# != 3 )); then
  echo 'usage: deploy-release.sh <40-char commit sha> <incoming directory> <releases root>' >&2
  exit 2
fi
id=$1
incoming=$2
root=$3
[[ $id =~ ^[[:xdigit:]]{40}$ ]] || { echo 'invalid release ID' >&2; exit 2; }
[[ -d $root && ! -L $root && -d $root/.incoming && ! -L $root/.incoming ]] || exit 2
[[ $incoming == "$root/.incoming/$id" && -d $incoming && ! -L $incoming ]] || exit 2
[[ ! -e $root/$id && ! -L $root/$id ]] || { echo 'release already exists' >&2; exit 2; }
[[ -f $incoming/index.html && ! -L $incoming/index.html && -f $incoming/release.txt && ! -L $incoming/release.txt ]] || exit 2
[[ $(< "$incoming/release.txt") == "$id" ]] || exit 2
grep -q '<title>aztec-web-inspector</title>' "$incoming/index.html" || exit 2
[[ -f $incoming/samples/sample-compact-1.png ]] || exit 2

# Verify every built entrypoint exists; a partial SCP must not become current.
while IFS= read -r asset; do
  [[ -f $incoming$asset && ! -L $incoming$asset ]] || { echo "missing asset: $asset" >&2; exit 2; }
done < <(grep -oE '/assets/[a-zA-Z0-9_.-]+\.(js|css)' "$incoming/index.html" | sort -u)
grep -qE '/assets/[a-zA-Z0-9_.-]+\.(js|css)' "$incoming/index.html" || exit 2

mv -- "$incoming" "$root/$id"
link="$root/.current-$id"
trap 'rm -f -- "$link"' EXIT
ln -s -- "$id" "$link"
python3 - "$link" "$root/current" <<'PY'
import os
import sys
os.replace(sys.argv[1], sys.argv[2])
PY
trap - EXIT
printf 'published %s\n' "$id"
