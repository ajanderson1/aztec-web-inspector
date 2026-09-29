#!/usr/bin/env bash
set -euo pipefail
(( $# == 3 )) || { echo 'usage: rollback-release.sh <releases-root> <failed-sha> <prior-sha-or-empty>' >&2; exit 2; }
root=$1
failed=$2
prior=$3
[[ $failed =~ ^[[:xdigit:]]{40}$ ]] || exit 2
[[ -z $prior || $prior =~ ^[[:xdigit:]]{40}$ ]] || exit 2
[[ -d $root && ! -L $root && -d $root/.incoming && ! -L $root/.incoming ]] || exit 2
[[ -L $root/current && $(readlink "$root/current") == "$failed" ]] || {
  echo 'active release changed; refusing rollback' >&2
  exit 1
}
if [[ -n $prior ]]; then
  [[ -d $root/$prior && ! -L $root/$prior ]] || exit 2
  link="$root/.rollback-$failed"
  trap 'rm -f -- "$link"' EXIT
  ln -s -- "$prior" "$link"
  python3 - "$link" "$root/current" <<'PY'
import os
import sys
os.replace(sys.argv[1], sys.argv[2])
PY
  trap - EXIT
else
  rm -- "$root/current"
fi
printf 'restored %s\n' "${prior:-no prior release}"
