#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
root=$tmp/releases
mkdir -p "$root/.incoming"
old=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
new=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
ln -s "$old" "$root/current"
ln -s "$new" "$root/.current-$new"
if bash "$script_dir/rollback-release.sh" "$root" "$new" "$old"; then
  echo 'accepted rollback with malformed current release' >&2
  exit 1
fi
[[ $(readlink "$root/current") == "$old" ]] || exit 1
rm "$root/.current-$new"
mkdir "$root/$old" "$root/$new"
ln -sfn "$new" "$root/current"
bash "$script_dir/rollback-release.sh" "$root" "$new" "$old"
[[ $(readlink "$root/current") == "$old" ]] || exit 1
ln -sfn "$new" "$root/current"
bash "$script_dir/rollback-release.sh" "$root" "$new" ''
[[ ! -e "$root/current" && ! -L "$root/current" ]] || exit 1
ln -s "$old" "$root/current"
if bash "$script_dir/rollback-release.sh" "$root" "$new" "$old"; then
  echo 'overwrote a different active release' >&2
  exit 1
fi
[[ $(readlink "$root/current") == "$old" ]] || exit 1
if bash "$script_dir/rollback-release.sh" "$root" "$new" '../escape'; then
  echo 'accepted invalid prior revision' >&2
  exit 1
fi
printf 'rollback contract: PASS\n'
