# Dev Staging and Production Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless AJ explicitly authorizes delegation.

**Goal:** Make `dev` merges deploy a tailnet-only Rimo staging site, with reviewed promotion to the existing Paiju `production` deployment, and remove private operating notes and PRPs from future public commits.

**Architecture:** Keep production's existing static Vite build, atomic release script and Paiju workflow. Give Rimo its own static Caddy service, deploy user, release root, and credentials; both workflows independently build and verify the selected commit. Operational guidance lives in ignored local files; committed config/scripts contain no secret values.

**Tech Stack:** GitHub Actions, Node 22/npm, Vite/React, Vitest, ESLint, Bash, Docker Compose/Caddy, Tailscale, SSH.

**Spec:** `docs/superpowers/specs/2026-09-29-dev-staging-production-release-design.md` (read first).

## Global Constraints

- Base changes on `origin/production` in an owned `.worktrees/` checkout. Do not update `main` or deploy to Paiju during staging setup.
- A workflow running on `push: dev` cannot distinguish merge from direct push; use applicable branch rules and document residual bypasses. Never claim byte-identical artifact promotion while `production` rebuilds.
- Keep runbooks, PRPs, runtime env files and credentials out of new public commits. Existing public Git history is not rewritten.
- Do not grant staging credentials access to Paiju, and do not run untrusted PR code on fleet-connected runners. No public Rimo listener or tunnel.
- Every scoped commit includes `Device: $(hostname -s)`; use reviewable PRs for integrating `dev` and `production`.

## File Map

- `.gitignore`: ignore `.prp/`, `.worktrees/`, `ops-private/`, local AI artifacts; preserve `.env.example` exception.
- `RUNBOOK.md`, `.prp/*.md`: remove from index without deleting the local files; no committed full runbook replacement.
- `README.md`: brief public branch/deploy overview and warning that private operations are unavailable from a clone.
- `ops-private/README.md`: ignored local K2/Rimo/Paiju release, access, staging acceptance, rollback, secret-reference and receipt procedure. Store/backup privately through an operator-approved location; not Git.
- `deploy/rimo/Caddyfile`, `deploy/rimo/compose.yml`, `deploy/rimo/.env.example`: Rimo-specific static service and tailnet-only bind; no tunnel service.
- `.github/workflows/staging.yml`: `dev`-only test/build/upload/verify job with Rimo-specific secrets; reuse `scripts/deploy-release.sh` and `scripts/verify-deployment.sh`.
- `scripts/test-staging-config.mjs`: local contract checks for branch/ref, secrets separation, tailnet bind, expected Compose services, and host key pinning.
- Existing production workflow/scripts: change only if focused tests expose a shared contract defect.

### Task 1: Public Repo Boundary

**Files:** Modify `.gitignore`, `README.md`; untrack `RUNBOOK.md`, `.prp/001-module-details-hover-tooltip.md`, `.prp/3-sample-barcode-shortcuts.md`; create ignored `ops-private/README.md`.

**Interfaces:** Public repo contains only a short branch overview and checked-in deployment mechanisms; local runbook is the human operations interface. Keep tracked deploy scripts unchanged.

- [ ] **Step 1: Check baseline and prepare ignored location.** In the owned worktree run `git status --short; git ls-files .prp RUNBOOK.md; git check-ignore -v .worktrees/probe || true`. Copy tracked runbook content to `ops-private/README.md` before untracking it; add sections for K2 test command, Rimo receipt/rollback, Paiju receipt/rollback, and a warning that Paiju's public DNS cutover is separately gated. Do not claim a new host state until measured.
- [ ] **Step 2: Change ignore and index.** Add explicit `.prp/`, `.worktrees/`, `ops-private/` and project-relevant cache ignores to `.gitignore`; run `git rm --cached RUNBOOK.md .prp/*.md` (no filesystem deletion). In `README.md` describe PRs into `dev`, automatic Rimo staging, reviewed PR into `production`, existing Paiju deploy, `main` being historical/default for now, and local runbook unavailability to clones.
- [ ] **Step 3: Verify boundary and commit.** Run `git check-ignore -v .prp/new.md ops-private/README.md .worktrees/probe; git ls-files RUNBOOK.md .prp ops-private; git diff --cached --check; git status --short` and inspect the staged patch for secrets. Expected: all three paths ignored, none tracked, original files still present locally. Commit scoped changes with Device trailer.

### Task 2: Rimo Static Origin

**Files:** Create `deploy/rimo/Caddyfile`, `deploy/rimo/compose.yml`, `deploy/rimo/.env.example`, `scripts/test-staging-config.mjs`.

**Interfaces:** Compose accepts `RELEASES_ROOT` and `TAILSCALE_IP` from its on-host mode-0600 `.env`. The single `site` container reads releases read-only under `/srv/releases`; host port `18084` binds `${TAILSCALE_IP}` and `127.0.0.1` only. Production script takes `<SHA> <incoming> <root>`; verifier takes `<origin URL> <SHA>`.

- [ ] **Step 1: Write a failing static-config test.** `scripts/test-staging-config.mjs` must fail if Rimo Compose is missing, includes `tunnel`, uses a wildcard/loopback/LAN listener, lacks the read-only release mount, or lacks an explicit `TAILSCALE_IP` requirement. Check the Caddy asset routing and `/release.txt` availability (use the Paiju Caddyfile as the reference). Run `node scripts/test-staging-config.mjs`; expect failure because files do not exist yet.
- [ ] **Step 2: Add the minimal Rimo config.** Use the same pinned Caddy image as `deploy/paiju/compose.yml`, single `site` service, same static Caddyfile rules; set `ports: ["${TAILSCALE_IP:?Set Rimo Tailscale IP}:18084:8080", "127.0.0.1:18084:8080"]`, read-only release mount, no other networks/services. `.env.example` contains placeholders only (`RELEASES_ROOT=/srv/services/aztec-web-inspector-staging/releases`, `TAILSCALE_IP=replace-with-rimo-tailscale-ip`). Do not materialize a real `.env` from repository values.
- [ ] **Step 3: Verify and commit.** Run `node scripts/test-staging-config.mjs; bash scripts/test-deploy-release.sh; bash scripts/test-verify-deployment.sh; docker compose --env-file deploy/rimo/.env.example -f deploy/rimo/compose.yml config` only after substituting an explicitly non-routable test IP in a temporary env file, or use `docker compose config --no-interpolate` where supported. Inspect rendered port to prove it is not `0.0.0.0`. If Docker is unavailable, report that separately; do not claim Compose validated. Commit with Device trailer.

### Task 3: Dev CI/CD Trigger

**Files:** Create `.github/workflows/staging.yml`; extend `scripts/test-staging-config.mjs`.

**Interfaces:** Workflow triggers on `push` to `dev` (optional `workflow_dispatch` allowed only for `refs/heads/dev`), `contents: read`, non-canceling environment concurrency; secrets named `AZTEC_RIMO_TS_OAUTH_CLIENT_ID`, `AZTEC_RIMO_TS_OAUTH_SECRET`, `AZTEC_RIMO_DEPLOY_SSH_KEY`, `AZTEC_RIMO_DEPLOY_SSH_HOST_KEY`. Staging root `/srv/services/aztec-web-inspector-staging/releases`; deploy user `aztecstage`. Host name must be pinned for `rimo.tailbf2225.ts.net`.

- [ ] **Step 1: Extend config test and prove red.** Check trigger/ref guard, `npm ci`, `npm run test:run`, `npm run lint`, `npm run build` before tailnet join; required SSH host-key pin, `StrictHostKeyChecking=yes`, separate staging secret names, staging root and distinct deploy identity; no Paiju secret names or production root. Run `node scripts/test-staging-config.mjs`; expect failure.
- [ ] **Step 2: Build workflow.** Follow `deploy.yml`'s SHA-pinned checkout/setup-node, Node 22/npm cache, SHA marker, Tailscale action, fixed per-host SSH key and host-key handling, SCP to `.incoming/$GITHUB_SHA`, and the two release scripts. Use staging-specific OAuth identity/tag only after verifying a narrow tailnet grant; do not reuse the production identity merely for convenience. Read-only GitHub token permissions and no PR trigger. Run verification on Rimo loopback `http://127.0.0.1:18084` after upload and verify from K2 separately when deployed.
- [ ] **Step 3: Verify and commit.** Run `node scripts/test-staging-config.mjs; bash scripts/test-deploy-release.sh; bash scripts/test-verify-deployment.sh; npm ci; npm run test:run; npm run lint; npm run build; git diff --check`. Inspect YAML with an installed YAML parser or `actionlint` if present; do not infer workflow correctness from text matching alone. Commit with Device trailer.

### Task 4: Controlled Host and GitHub Setup

**Files:** No new tracked source files; complete `ops-private/README.md` with verified facts/receipts only. Private Bitwarden items and GitHub secret names live outside repo.

**Interfaces:** Rimo must have an app-only `aztecstage` identity with only its staging release directory accessible, a site service reachable only on tailnet, a pinned host key and a distinct OAuth tag/grant; GitHub's `dev` workflow consumes that identity. No Docker/sudo or general fleet access for deploy user.

- [ ] **Step 1: Inspect current state read-only.** Check `tailscale status`, `ssh rimo` identity, `docker compose version`, disk capacity, listening ports, existing paths, `gh api` branch rules and secret *names*, and current tailnet policy. Never dump env contents or private key material. Confirm `18084` and `/srv/services/aztec-web-inspector-staging/` are unowned by another app.
- [ ] **Step 2: Gate shared-policy changes.** Present exact Rimo/Tailscale/SSH permissions and scoped shell commands for approval before changing shared tailnet or host identity policy. If approval or narrowly scoped access is unavailable, stop before deploying; retain a reviewable PR and report precise blocker. Do not weaken host-key checking or substitute Paiju credentials.
- [ ] **Step 3: Provision and verify.** After authorization, create only app-specific release directory/identity, a mode-0600 on-host env with Rimo's Tailscale IP, and start only the Rimo app Compose project. Store dedicated secrets in Bitwarden and GitHub Actions without displaying values. Verify `docker compose ps`, actual socket bind address (`ss -lnt`), no public route, and direct origin from K2 tailnet. Record observed details and rollback command in ignored runbook.

### Task 5: Integrate, Stage, and Promote

**Files:** Existing `.github/workflows/deploy.yml` and runbooks change only to correct verified facts; PR artifacts on GitHub; receipt in private `ops-private/README.md` or its approved private backup.

**Interfaces:** `dev` starts at the exact inspected `production` tip; integration PR targets `dev`. Production promotion is a separate PR from `dev` to `production`, never automatic in this task.

- [ ] **Step 1: Create `dev` from inspected `production`.** Re-fetch `origin/production`, confirm no unexpected changes and record tip SHA. Create/push `dev` *from that SHA*, not the implementation branch, then open a PR of the implementation branch into `dev`. Review the full PR diff for tracked PRP/runbook removal and production workflow unchanged. Avoid committing the plan branch's extra files into `dev` accidentally.
- [ ] **Step 2: Configure available protection.** Inspect repository rules and status-check names; add enforceable PR/required-check rules if supported on this public GitHub repo, verifying with API afterward. Explicitly describe any admin/direct-push/workflow-dispatch bypass in the ignored runbook. A branch rule failure is not evidence of merge-only behavior.
- [ ] **Step 3: Merge to `dev` only after review and passing local checks.** Confirm staging workflow run completed; compare its head SHA to `dev`, Rimo `release.txt`, JS, CSS and sample entrypoints. Exercise a sample barcode and hover/layer controls in a K2 browser; record artifact digest, observed result and staging SHA. Failure blocks promotion; preserve previous Rimo release for rollback.
- [ ] **Step 4: Prepare production PR but do not merge without separate release authorization.** Compare `dev` and `production` tree/commit to staged evidence, show scope and release risks to AJ. After explicit production approval, merge PR; follow existing Paiju deploy run, verify SHA/asset probes, check public route only after verifying its actual DNS cutover state, and document rollback/receipt privately. If the merge yields a different tree, restage before release.

## Completion Evidence

- Read back `git ls-files`/ignore status; verify private files still exist locally and are absent from proposed PR diff.
- Fresh test, lint, build and script tests with exit codes; actual staging Compose config and network listener; GitHub workflow outcome at exact `dev` SHA; K2 interactive smoke result.
- Production is **not complete** until separately approved promotion, successful Paiju workflow and observed post-deploy checks. Report partial delivery honestly if external policy/credentials/approval prevent the live steps.
