#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
python3 - "$root" <<'PY'
from pathlib import Path
import sys
import yaml

root = Path(sys.argv[1])
path = root / '.github/workflows/ci.yml'
assert path.is_file(), 'missing unprivileged PR checks'
workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
assert workflow['on']['pull_request']['branches'] == ['dev', 'production']
assert set(workflow['on']) == {'pull_request'}
assert workflow['permissions'] == {'contents': 'read'}
job = workflow['jobs']['checks']
assert job['runs-on'] == 'ubuntu-latest'
steps = job['steps']
assert all('secrets.' not in str(step) for step in steps)
assert all('tailscale/' not in str(step) for step in steps)
for cmd in ('npm ci', 'npm run test:run', 'npm run lint', 'npm run build',
            'bash scripts/test-deploy-release.sh', 'bash scripts/test-verify-deployment.sh',
            'bash scripts/test-rollback-release.sh', 'bash scripts/test-staging-config.sh',
            'bash scripts/test-ci-config.sh'):
    assert cmd in [step.get('run') for step in steps], f'missing {cmd}'
print('PR CI contract: PASS')
PY
