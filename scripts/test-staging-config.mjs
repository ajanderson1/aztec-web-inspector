import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const compose = yaml.load(read('deploy/rimo/compose.yml'))
const production = yaml.load(read('deploy/paiju/compose.yml'))
assert.deepEqual(Object.keys(compose.services), ['site'], 'Rimo may only run the site service')
const site = compose.services.site
assert.equal(site.image, production.services.site.image)
assert.equal(site.read_only, true)
assert.ok(site.volumes.includes('${RELEASES_ROOT:?Set RELEASES_ROOT}:/srv/releases:ro'))
assert.deepEqual(site.ports, [
  '${TAILSCALE_IP:?Set Rimo Tailscale IP}:18084:8080',
  '127.0.0.1:18084:8080',
], 'bind only the tailnet and host loopback addresses')
assert.equal(read('deploy/rimo/Caddyfile'), read('deploy/paiju/Caddyfile'))
const env = read('deploy/rimo/.env.example')
assert.ok(env.includes('TAILSCALE_IP=replace-with-rimo-tailscale-ip'))
assert.ok(env.includes('RELEASES_ROOT=/srv/services/aztec-web-inspector-staging/releases'))
console.log('staging Compose contract: PASS')

const text = read('.github/workflows/staging.yml')
const workflow = yaml.load(text)
assert.deepEqual(Object.keys(workflow.on), ['push'], 'manual or PR events must not deploy')
assert.deepEqual(workflow.on.push.branches, ['dev'])
assert.deepEqual(workflow.permissions, { contents: 'read' })
assert.equal(workflow.concurrency['cancel-in-progress'], false)
const job = workflow.jobs['build-and-deploy']
assert.equal(job.if, "github.ref == 'refs/heads/dev'")
const steps = job.steps
for (const command of ['npm ci', 'npm run test:run', 'npm run lint', 'npm run build']) {
  assert.ok(steps.some((step) => step.run === command), `missing ${command}`)
}
assert.ok(steps.findIndex((step) => step.run === 'npm run build') <
  steps.findIndex((step) => step.uses?.startsWith('tailscale/github-action@')))
for (const secret of ['AZTEC_RIMO_TS_OAUTH_CLIENT_ID', 'AZTEC_RIMO_TS_OAUTH_SECRET',
  'AZTEC_RIMO_DEPLOY_SSH_KEY', 'AZTEC_RIMO_DEPLOY_SSH_HOST_KEY']) {
  assert.ok(text.includes(`secrets.${secret}`), `missing ${secret}`)
}
assert.ok(!text.includes('secrets.AZTEC_TS_OAUTH') && !text.includes('secrets.AZTEC_DEPLOY_SSH'))
for (const marker of ['tag:aztec-staging-ci', 'aztecstage', 'rimo.tailbf2225.ts.net',
  '/srv/services/aztec-web-inspector-staging/releases', 'StrictHostKeyChecking=yes',
  'ssh-keygen -F rimo.tailbf2225.ts.net', 'scripts/deploy-release.sh',
  'scripts/verify-deployment.sh', 'scripts/rollback-release.sh', 'trap rollback ERR',
  'http://127.0.0.1:18084']) {
  assert.ok(text.includes(marker), `missing ${marker}`)
}
console.log('staging workflow contract: PASS')
