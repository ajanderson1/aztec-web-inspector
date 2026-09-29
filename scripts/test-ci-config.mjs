import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'

const workflow = yaml.load(readFileSync(resolve(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8'))
assert.deepEqual(Object.keys(workflow.on), ['pull_request'])
assert.deepEqual(workflow.on.pull_request.branches, ['dev', 'production'])
assert.deepEqual(workflow.permissions, { contents: 'read' })
const job = workflow.jobs.checks
assert.equal(job['runs-on'], 'ubuntu-latest')
assert.ok(job.steps.every((step) => !JSON.stringify(step).includes('secrets.')))
assert.ok(job.steps.every((step) => !JSON.stringify(step).includes('tailscale/')))
for (const command of ['npm ci', 'npm run test:run', 'npm run lint', 'npm run build',
  'bash scripts/test-deploy-release.sh', 'bash scripts/test-verify-deployment.sh',
  'bash scripts/test-rollback-release.sh', 'node scripts/test-staging-config.mjs',
  'node scripts/test-ci-config.mjs']) {
  assert.ok(job.steps.some((step) => step.run === command), `missing ${command}`)
}
console.log('PR CI contract: PASS')
