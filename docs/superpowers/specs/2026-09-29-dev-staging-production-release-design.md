# Aztec Web Inspector: dev, staging, and production delivery

Date: 2026-09-29
Status: approved in chat; awaiting written-spec review

## Outcome and scope

Use the existing `production` branch and Paiju deployment as the production release path. Create `dev` from the current `production` tip and use short-lived task branches with PRs into `dev` for routine changes. A merge into `dev` automatically builds and deploys to a tailnet-only Rimo staging instance. Test locally on K2 and exercise the production-format build on Rimo before promoting an explicit staged candidate from `dev` to `production` by PR. A merge into `production` triggers the existing Paiju workflow. Leave `main` untouched for now; document that GitHub's default branch is still `main` until separately changed.

This is an explicit project exception to the conventions' short-lived-branch, releasable-main default. The public repository does not contain private operational runbooks. This is an explicit exception to the conventions' committed-runbook default: cold clones will have only the public deploy mechanism and minimal non-sensitive orientation, not full operating instructions.

## Repository hygiene

Add `.prp/`, `.worktrees/`, and a named project-local operational runbook location to `.gitignore`. Remove already-tracked `.prp/` documents and `RUNBOOK.md` from the Git index, retaining their local copies. Write development, staging, production, rollback, access, and credential-reference procedures in ignored local runbooks. Do not put secrets in those files. Keep public deployment scripts, infrastructure definitions, and tests committed and independently reviewable. Check new public changes for accidental private host metadata or credentials. Ignoring tracked files does not remove earlier versions from Git history; history rewriting is out of scope and would require a separate decision.

An ignored file cannot be shared through a fresh clone. The implementation handoff must identify its local path and the private storage/backup location chosen by the operator; no silent claim that it is available on other machines.

## Build and staging path

Reuse the existing `production` workflow's Node 22 installation, `npm ci`, Vitest, ESLint, TypeScript/Vite build, release SHA marker, and pinned first-party actions. On `dev` pushes, perform those checks before joining the tailnet. Keep staging and production deployment credentials in separate jobs/workflows and GitHub secrets, with separate target identities, least-privilege SSH permissions, pinned host key, and narrowly scoped Tailscale authorization. Do not let PR jobs receive deploy credentials or run PR-supplied code on privileged fleet runners.

On Rimo use a separate site service, release root, and deploy-only user, with no Cloudflare tunnel or public listener. Bind its HTTP listener only to Rimo's Tailscale address; verify from K2 over the tailnet and verify the target's loopback origin. Reuse the validated atomic release publish and verification scripts, serving the same built static assets (including sample images, JS, CSS, and release marker). Give the staging service no access to production volumes or credentials. A failed build, upload, or probe leaves the prior staged release selected; retain at least one previous known-good release for rollback. Record the staged SHA and artifact digest.

Before provisioning or exposing the staging site, check current Rimo inventory, capacity, container/network configuration, service identity and SSH restrictions; prove that the listener is not exposed on a public or LAN interface. Provisioning is restricted to this app and requires explicit approval if it changes shared host/tailnet policy. Do not modify other services on Rimo.

## Promotion and gates

K2 local verification runs the project test/lint/build commands and relevant interactive barcode flows. Staging acceptance must exercise the deployable build on Rimo, including loading a sample barcode and its inspection controls, and confirm that the release marker equals the intended `dev` commit. Record the staged SHA, artifact digest, checks, and observed results in a deployment receipt outside the public repository if it contains private operational data.

Promote by PR from `dev` to `production` only when its candidate SHA and staged verification match. If the PR merge creates a new commit, record the resulting production SHA and verify its code tree equals the staged candidate; rebuild on Paiju workflow with fresh tests as currently implemented. Therefore staging proves the candidate source and deployable form, **not byte-identical artifact promotion**. Do not claim the production build is identical without an artifact-promotion mechanism. A candidate changed after staging must be restaged and reapproved. Serialize production deployment and verify Paiju's `release.txt`, HTML, sample and asset entrypoints. Keep rollback to the prior release and post-deploy verification documented in the local runbook.

GitHub may not enforce private-repo-style approvals on this public repository. Inspect available branch rules and configure only applicable protections for `dev` and `production`; document any bypass (including direct pushes, workflow dispatch, and administrator access). The staging workflow triggers on pushes to `dev`, not literally only merges: branch protection is needed to make routine pushes merge-only. Do not change repository default branch or delete `main` in this work.

## Validation and delivery sequence

1. Write this design and obtain written-spec approval before implementation.
2. Implement ignore/index changes, private runbooks, staging deployment definitions, workflow, focused script/config tests, and public minimal operating pointer in an isolated worktree based on `production`.
3. Validate static build, unit tests, lint, deployment script tests, staging Compose rendering/listener binding, and absence of tracked private runbooks and PRPs. Verify configured secrets by names only.
4. Provision app-specific Rimo staging identity/site and tailnet permissions; perform a controlled staged deployment and K2 browser smoke test. Do not infer production readiness from a successful CI job alone.
5. Create `dev` initially at the verified `production` tip, reconcile the implementation through the reviewable branch and PR path, and confirm a merge to `dev` deploys to Rimo. Set protections where supported. Do not auto-merge into `production`.
6. After staging approval, promote `dev` to `production` by reviewed PR and verify the existing Paiju workflow and rollback handle remain healthy. Update only the project-specific host context after observing deployment, through its separate approval protocol.

## Explicit non-goals and risks

No Git history rewrite, default-branch switch, shared host reconfiguration, DNS cutover, or removal of the existing Fuji fallback as a side effect. Production already deploys on every `production` push; no new push to that branch is safe until its candidate is staged and approved. Current public history already contains `.prp/` and `RUNBOOK.md`; future ignoring does not retract those documents. Local ignored runbooks can be lost and are not accessible to CI or fresh clones unless backed up privately.
