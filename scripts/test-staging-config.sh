#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
python3 - "$root" <<'PY'
import pathlib
import sys
import yaml

root = pathlib.Path(sys.argv[1])
compose_path = root / 'deploy/rimo/compose.yml'
caddy_path = root / 'deploy/rimo/Caddyfile'
env_path = root / 'deploy/rimo/.env.example'
for path in (compose_path, caddy_path, env_path):
    assert path.is_file(), f'missing {path}'
compose = yaml.safe_load(compose_path.read_text())
assert set(compose['services']) == {'site'}, 'Rimo may only run the site service'
site = compose['services']['site']
assert site['image'] == yaml.safe_load((root / 'deploy/paiju/compose.yml').read_text())['services']['site']['image']
assert site['read_only'] is True
assert '${RELEASES_ROOT:?Set RELEASES_ROOT}:/srv/releases:ro' in site['volumes']
assert site['ports'] == [
    '${TAILSCALE_IP:?Set Rimo Tailscale IP}:18081:8080',
    '127.0.0.1:18081:8080',
], 'Only the tailnet and host loopback addresses may be bound'
assert caddy_path.read_text() == (root / 'deploy/paiju/Caddyfile').read_text()
assert 'TAILSCALE_IP=replace-with-rimo-tailscale-ip' in env_path.read_text()
assert 'RELEASES_ROOT=/srv/services/aztec-web-inspector-staging/releases' in env_path.read_text()
print('staging Compose contract: PASS')
PY
