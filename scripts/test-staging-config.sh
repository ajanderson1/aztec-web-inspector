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
    '${TAILSCALE_IP:?Set Rimo Tailscale IP}:18084:8080',
    '127.0.0.1:18084:8080',
], 'Only the tailnet and host loopback addresses may be bound'
assert caddy_path.read_text() == (root / 'deploy/paiju/Caddyfile').read_text()
assert 'TAILSCALE_IP=replace-with-rimo-tailscale-ip' in env_path.read_text()
assert 'RELEASES_ROOT=/srv/services/aztec-web-inspector-staging/releases' in env_path.read_text()
print('staging Compose contract: PASS')

workflow_path = root / '.github/workflows/staging.yml'
assert workflow_path.is_file(), 'missing dev staging workflow'
workflow = yaml.load(workflow_path.read_text(), Loader=yaml.BaseLoader)
assert workflow['on']['push']['branches'] == ['dev']
assert set(workflow['on']) == {'push'}, 'manual or PR events must not deploy'
assert workflow['permissions'] == {'contents': 'read'}
assert workflow['concurrency']['cancel-in-progress'] == 'false'
job = workflow['jobs']['build-and-deploy']
assert job['if'] == "github.ref == 'refs/heads/dev'"
steps = job['steps']
commands = [step.get('run', '') for step in steps]
for command in ('npm ci', 'npm run test:run', 'npm run lint', 'npm run build'):
    assert command in commands, f'missing {command}'
assert max(i for i, step in enumerate(steps) if step.get('run') == 'npm run build') < next(
    i for i, step in enumerate(steps) if 'tailscale/github-action@' in step.get('uses', '')
)
text = workflow_path.read_text()
for secret in ('AZTEC_RIMO_TS_OAUTH_CLIENT_ID', 'AZTEC_RIMO_TS_OAUTH_SECRET',
               'AZTEC_RIMO_DEPLOY_SSH_KEY', 'AZTEC_RIMO_DEPLOY_SSH_HOST_KEY'):
    assert f'secrets.{secret}' in text, f'missing {secret}'
assert 'secrets.AZTEC_TS_OAUTH' not in text and 'secrets.AZTEC_DEPLOY_SSH' not in text
assert 'tag:aztec-staging-ci' in text
assert 'aztecstage' in text and 'rimo.tailbf2225.ts.net' in text
assert '/srv/services/aztec-web-inspector-staging/releases' in text
assert 'StrictHostKeyChecking=yes' in text and 'ssh-keygen -F rimo.tailbf2225.ts.net' in text
assert 'scripts/deploy-release.sh' in text and 'scripts/verify-deployment.sh' in text
assert 'scripts/rollback-release.sh' in text and 'trap rollback ERR' in text
assert 'http://127.0.0.1:18084' in text
print('staging workflow contract: PASS')
PY
