# Paiju Hosting Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) or superpowers:subagent-driven-development to implement this plan task by task. Steps use checkboxes for tracking.

**Goal:** Keep `aztec-inspector.ajanderson.net` and push-to-`production` delivery, move its origin from Fuji to Paiju, and add a Broadpeak Kuma monitor without notifications.

**Architecture:** GitHub Actions builds the Vite static site, uses an ephemeral Tailscale CI identity and deploy-only SSH to publish an atomic release on Paiju. A dedicated Cloudflare Tunnel connects the public hostname to a private, read-only static-site container. Capture the live DNS state before a one-hostname cutover; retain Fuji as a rollback target.

**Tech Stack:** Vite/TypeScript, GitHub Actions, OpenSSH, Tailscale OAuth + grants, Docker Compose/static web server, Cloudflare Tunnel/DNS, Broadpeak Uptime Kuma.

**Spec:** `docs/superpowers/specs/2026-09-28-paiju-hosting-migration-design.md` (read before execution).

## Global Constraints

- Publish no secrets in git, command output, Actions logs, or documentation; credential references are Bitwarden item names only.
- Keep Paiju's existing Device Keys stack and Fuji's other services untouched; no public Paiju SSH/HTTP port and no Tailscale Funnel.
- `production` pushes still deploy automatically; a failed build, SSH transfer, or validation must leave the previous Paiju release active.
- Cloudflare serves the public site without an Access login; only `aztec-inspector.ajanderson.net` changes route.
- Broadpeak Kuma uses a 60-second, three-retry public HTTPS content check, existing `prod` and `paiju` tags, and **no notification binding or channel**.
- Preserve Fuji's last working Aztec artifact and site config until a separately agreed soak/decommission decision.
- Before any live mutation, recheck the target inventory, SSH alias, current docs, ownership, permissions, snapshot/rollback state, and previous steps' evidence. Stop if facts differ.

## Review Focus

- Interrupted upload: published release remains the old complete build (Task 2 contract test).
- Missing hashed JS/CSS asset: origin returns 404, not HTML fallback (Task 2 static-route test).
- Stale cached Fuji response: public acceptance checks a release-specific asset/marker, not HTTP 200 alone (Task 5).
- CI tailnet credential or host-key failure: job fails without fallback to public SSH or a broad credential (Task 3).
- Kuma green but not alerting: no notification is configured by explicit request; monitor's description says so and DB has no binding (Task 6).

## File Map

- `.github/workflows/deploy.yml` — single production build and authenticated transfer/release trigger; remove Fuji restart.
- `deploy/paiju/compose.yml`, `deploy/paiju/Caddyfile`, `deploy/paiju/.env.example` — private static origin and dedicated tunnel connector; runtime token excluded.
- `scripts/deploy-release.sh`, `scripts/test-deploy-release.sh` — validate/switch releases and test interrupted/invalid uploads without touching a live server.
- `scripts/verify-deployment.sh` — probe release marker, asset and sample file; fail on generic 200 or wrong release marker.
- `index.html` — stable `aztec-web-inspector` marker for Kuma; CI emits `dist/release.txt` with the pushed SHA for version-specific verification.
- `RUNBOOK.md`, `README.md` — deployment, incident response, rollbacks and user-facing hosting facts.
- `~/.contexts/servers/karakoram/guests/paiju/README.md`, `~/.contexts/servers/fuji/README.md`, `"~/Journal/Atlas/Aztec Web Inspector Deployment.md"` — post-verification inventory/notes via their publication procedures, not speculative prerecording.

### Task 1: Confirm baseline and provision the isolated working branch

**Files:** Read-only: spec, `README.md`, `.github/workflows/deploy.yml`, paiju/broadpeak/fuji inventory, production URL and Cloudflare DNS; no repository edits.

**Interfaces:** Produces a value-free baseline: `production` SHA, public page/asset hash, DNS record ID/type/content/proxy mode, Fuji fallback readiness, Paiju Docker/network/disk capacity and current Cloudflare/Tailscale route posture.

- [ ] Recheck `gh run list --repo ajanderson1/aztec-web-inspector --workflow deploy.yml --limit 3`, `dig +short aztec-inspector.ajanderson.net`, and `curl -fsSI https://aztec-inspector.ajanderson.net/`; store only non-secret evidence in an operational scratch area, not a public repo.
- [ ] Resolve `paiju`, `broadpeak`, `fuji` through current contexts, `ssh -G` and same-session `tailscale status`; inspect live containers and mount points without changing them. Confirm the old Fuji origin answers a direct Host-header probe even if DNS later points elsewhere.
- [ ] Read current official Cloudflare Tunnel and Tailscale GitHub Action/OAuth/grants documentation before choosing API calls or credentials. Confirm available token permissions and the exact DNS record (GET, do not guess or blindly create).
- [ ] Check isolated owned worktree and clean status. If a baseline mismatch or competing change appears, stop affected work and resolve ownership before writes.

### Task 2: Add a fail-safe Paiju static origin

**Files:** Create `deploy/paiju/compose.yml`, `deploy/paiju/Caddyfile`, `deploy/paiju/.env.example`, `scripts/deploy-release.sh`, `scripts/test-deploy-release.sh`; modify `index.html`; test `scripts/test-deploy-release.sh`.

**Interfaces:** `scripts/deploy-release.sh <release-id> <incoming-directory> <releases-root>` returns nonzero without switching `current` when input is invalid; on success `current` points atomically to a complete immutable release. CI transfers files under `<releases-root>/.incoming/<release-id>/` then invokes this script. Static origin reads `<releases-root>/current` through a parent-directory read-only mount; tunnel connector joins only this project's Docker network.

- [ ] Write tests using temporary directories: missing `index.html`, missing matching `release.txt`, missing referenced hashed JS/CSS, partial upload, path traversal release ID and repeated same SHA must not change `current`; valid release changes it atomically and retains previous directory.
- [ ] Run `bash scripts/test-deploy-release.sh`; expect failure before script implementation. Implement minimal validated release switch with temporary symlink + atomic rename on same filesystem; never `rm -rf` a live release. Re-run tests; expect all PASS.
- [ ] Add a private web service with restart policy, pinned compatible images, read-only release mount, no host port, no Docker socket; Caddy returns 404 for missing `/assets/*`, serves SPA navigation fallback where needed, and exposes the stable `aztec-web-inspector` marker in HTML without leaking a token. Add separate `cloudflared` service with required runtime token variable, no publicly mounted port and no coupling to the Device Keys network.
- [ ] Run `docker compose -f deploy/paiju/compose.yml --env-file <safe-test-env> config -q` using a throwaway non-secret fixture and run a local container/probe test for `/`, `/samples/sample-compact-1.png`, missing asset (404), and wrong hostname (not the app). Do not print rendered Compose config with actual secrets.
- [ ] Commit only these files with `Device: $(hostname -s)` trailer after verification.

### Task 3: Replace the Fuji-specific automatic deployment

**Files:** Modify `.github/workflows/deploy.yml`; create `scripts/verify-deployment.sh`; update `scripts/test-deploy-release.sh` with verifier fixtures.

**Interfaces:** Workflow takes `DEPLOY_SSH_KEY`, a pinned SSH host key, and dedicated Tailscale OAuth client ID/secret from GitHub Actions secrets. It writes the pushed SHA to `dist/release.txt` after build. It sends the exact pushed `production` SHA artifact to a Paiju deploy-only account, triggers Task 2 switch, and verifies the Paiju origin/asset before reporting success. Use pinned action versions, least-privilege `permissions`, and `concurrency` for production deploys.

- [ ] Add failing fixture tests for verifier: wrong `release.txt` SHA, wrong HTML marker, missing sample, missing hashed asset, and success on complete build. Run tests, then implement `scripts/verify-deployment.sh <base-url> <release-id>` and re-run.
- [ ] Confirm official `tailscale/github-action` syntax, ephemeral OAuth device tagging, current tailnet grants and SSH requirements. Provision the scoped OAuth client via attended owner flow and Bitwarden; set repository secrets without exposing values in output. Do not reuse an old Tailscale device auth key or give CI access to unrelated hosts. Enroll one disposable CI identity for a proof run and verify its removal.
- [ ] Provision a dedicated Paiju non-sudo deploy account/key with write access only to this site's release area; pin Paiju's verified SSH host key in the workflow. Test from a restricted identity that it cannot alter Device Keys, Docker, other service paths, or Fuji.
- [ ] Rewrite workflow: checkout pushed SHA, `npm ci`, `npm run test:run`, `npm run lint`, `npm run build`, establish ephemeral tailnet access, write `dist/release.txt` with pushed SHA, upload into per-SHA incoming directory, run release script over SSH, verify from Paiju, and omit all Fuji SCP/restart commands. Ensure wrong/missing auth and changed host key fail closed.
- [ ] Run `actionlint .github/workflows/deploy.yml`, `npm run test:run`, `npm run lint`, `npm run build`, and fixture tests; verify workflow references no `vasttrafik_caddy` or Fuji deploy target. Commit with Device trailer. Do **not** push `production` yet: test the workflow in an authorized controlled run after Task 4.

### Task 4: Stage Paiju and the dedicated tunnel without cutting over DNS

**Files:** Runtime only: `/srv/services/aztec-web-inspector/` and dedicated release directory on Paiju; Cloudflare tunnel object/config. No other stack files.

**Interfaces:** Task 2 static server reachable only over project Docker network (optional temporary tailnet-only validation endpoint removed before public cutover); dedicated remotely managed tunnel ingress targets this server, fallback is 404. Distinct Cloudflare tunnel token has a Bitwarden item and mode-0600 Paiju runtime env.

- [ ] Before writing, inspect Paiju resource headroom, Docker identities and current stacks, and confirm no existing Aztec service or tunnel name conflict. Capture rollback commands for only this stack. Install verified Task 2 definitions and one known `production` build to a staging release; no world-writable directories or host wildcard listeners.
- [ ] Create the dedicated remotely managed tunnel with currently documented Cloudflare API/UI; validate its account, token scope, connector health and `ingress` (Aztec hostname -> project static service; unmatched -> 404). Keep existing Device Keys tunnel unchanged. Store token only in Bitwarden and Paiju mode-0600 env; no terminal echoes.
- [ ] Verify origin and a distinctive release asset from inside Docker/tailnet, `docker compose ps` health, connector registration, no public Paiju HTTP port, and unchanged Device Keys URL. If a validation endpoint was used, remove it and verify it is gone.
- [ ] Record exact previous/current tunnel configuration identifiers and rollback procedure privately; do not modify the live Aztec DNS record yet.

### Task 5: Cut over one hostname and prove automatic delivery

**Files:** Cloudflare record/route for `aztec-inspector.ajanderson.net`; repository `production` branch only after prior gates; no Fuji changes.

**Interfaces:** Captured Task 1 DNS record is the rollback target. A successful cutover serves the Paiju release and its assets at the original public HTTPS URL; controlled `production` push updates Paiju without restarting Fuji.

- [ ] Re-GET exact existing DNS record and tunnel ingress; confirm they match captured baseline. Verify Paiju origin and Fuji fallback both healthy. If drifted, stop. Plan rollback restoring the exact previous record properties, not just IP.
- [ ] Upsert only the existing hostname to the dedicated tunnel using documented Cloudflare public-hostname/DNS procedure; confirm API `success:true` and re-GET both record and tunnel config. Keep Fuji route and artifact available.
- [ ] Probe uncached public HTML, release-specific asset and sample file, TLS, content security policy and Umami script. Test barcode upload/inspection in a browser (agent-browser skill) and compare the release marker against the Paiju build; an HTTP 200 by itself is not acceptance. Test Device Keys unchanged.
- [ ] Only after site passes, push a controlled `production` update with the new workflow. Inspect GitHub Actions run and Paiju `current` release SHA, test public page/asset and ensure Fuji Caddy was not restarted. If any cutover gate fails, restore the captured Fuji DNS record, verify Fuji's public response and leave Paiju staged for diagnosis.
- [ ] Preserve Fuji assets and Caddy config after acceptance; record soak start and defer cleanup until owner agrees duration. Commit scoped code/doc changes with Device trailer; publish via reviewable branch/PR before `production` promotion where policy requires.

### Task 6: Add and validate the Broadpeak Kuma monitor

**Files:** Broadpeak Kuma monitor config; no notifier changes. Update runbook/docs only with verified monitor ID/state.

**Interfaces:** Name `Aztec Web Inspector (Paiju)`; HTTPS public URL `/`; interval 60s, retries 3, SSL expiry enabled, existing tags `prod`, `paiju`. Content matcher identifies Aztec Inspector, not generic 200. Description is copied from the spec's Monitoring section; HTML keyword is `aztec-web-inspector`.

- [ ] Read `"~/Journal/Atlas/Kuma Master.md"`, resolve Broadpeak context and confirm current Kuma monitor/tag schema and credential reference. Recheck public route from Broadpeak before writing.
- [ ] Add exactly one monitor using the documented Kuma API/UI; avoid a duplicate if retrying. Set content keyword matching the tested HTML marker, 60-second interval, three retries, existing tags and the spec description; leave notifications empty.
- [ ] Verify monitor becomes UP across the public route, inspect monitor/tag/notification joins read-only in Kuma SQLite or API (no notification binding), and confirm the existing six monitors were not changed. If DOWN, troubleshoot endpoint/matcher before accepting; do not claim an alert will be sent.

### Task 7: Publish accurate runbook and inventory after evidence

**Files:** Create `RUNBOOK.md`; update `README.md`; propose and, with required context/vault approval, update `~/.contexts/servers/karakoram/guests/paiju/README.md`, `~/.contexts/servers/fuji/README.md`, and `"~/Journal/Atlas/Aztec Web Inspector Deployment.md"`.

**Interfaces:** Runbook includes exact deploy/rollback checks, Paiju stack ownership and non-secret paths, Cloudflare record/tunnel identifiers (private context only), Kuma monitor ID/limitations, and explicit Fuji fallback and no-notifier state.

- [ ] Write commands for deploy, verification, rollback release, DNS restore and troubleshooting; update README hosting section without claiming unsupported uptime/HA. Do not document token values.
- [ ] Run `git diff --check`, `actionlint .github/workflows/deploy.yml`, `npm run test:run`, `npm run lint`, `npm run build`, and deploy script tests. Confirm live public route, GitHub deployment run, Kuma DB joins and Fuji fallback evidence are still current before saying migration complete.
- [ ] Follow contexts' update protocol for exact proposed private inventory diffs and wiki-maintainer rules before Journal edits. Correct obsolete NXDOMAIN/Hostinger/old SSH alias statements; do not claim old assets decommissioned. Validate links/schema and scoped commits separately.
- [ ] Provide evidence ledger: public URL/asset marker, Actions run/SHA, Paiju release, tunnel route, Kuma monitor ID/status/tags/no alerts, Fuji rollback retained, and unresolved soak/decommission decision.

## Execution Hand-off

No production change begins merely because this plan exists. Review exact DNS and authorization boundaries at the Task 4/5 gate; stop if live reality differs. Never use a new DNS event ID/credential guess to work around a failed request. The owner chooses execution method after reviewing this plan.
