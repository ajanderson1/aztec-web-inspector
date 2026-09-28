# Aztec Web Inspector: Fuji to Paiju hosting migration

Date: 2026-09-28
Status: design for owner review; no production changes authorized by this document

## Outcome and boundaries

Keep the existing public URL `https://aztec-inspector.ajanderson.net` and automatic deployment on pushes to `production`, but serve the static Vite build from Paiju instead of Fuji. Add a public-path monitor on Broadpeak Kuma with a plain-language description and the existing `prod` and `paiju` tags. Do not create or attach any notification channel. Do not modify Paiju's Device Keys tunnel or Fuji's other services.

At discovery time, the URL resolves to Fuji's public IP and responds with HTTP 200. The existing GitHub Actions workflow builds on `production`, copies `dist/` to Fuji, and restarts its Caddy container. Paiju already hosts an unrelated Cloudflare Tunnel for Device Keys. Broadpeak Kuma has no notification channels; an UP/DOWN monitor is observability, not an alert.

## Delivery and origin

GitHub Actions remains the build runner. On a `production` push it checks out that exact commit, installs pinned dependencies with `npm ci`, runs the existing test/lint/build checks, joins the tailnet with a narrowly scoped, ephemeral CI identity, and uploads the built `dist/` over SSH to a dedicated non-sudo Paiju deploy account. No public SSH ingress or permanent GitHub runner is introduced. CI must fail closed if tailnet authorization, SSH identity, upload, or post-deploy verification fails. Use an SSH host-key pin and separate deploy credential; never turn off host-key verification. Tailnet policy permits only the CI identity to reach Paiju SSH, not the rest of the fleet. Store CI auth material only in GitHub Actions secrets and its durable vault home; do not print it. Confirm the exact Tailscale GitHub Action/auth mechanism and ACL/grants policy against current documentation before implementation.

On Paiju, a dedicated static-file service (Caddy or an equally small immutable web-server image) serves a project-owned releases directory on its own Docker network. The app has no server-side runtime, database, or application secrets. The deploy account owns only this site's release area, not Docker or unrelated `/srv/services` stacks. Upload each release to a temporary directory, verify required files, and atomically select the completed release so failed uploads leave the last good build live. Keep at least one previous known-good release for rollback. The serving container mounts the parent releases area read-only so switching the `current` symlink does not require restarting other services or rebinding a single-file mount. Ensure the web-server configuration supports history fallback if app navigation requires it, but does not return index.html for missing JS/CSS assets. Test the actual built site and sample assets through the origin, not just the root document. No development server runs in production.

## Public routing and cutover

Create a dedicated, remotely managed Cloudflare Tunnel and connector for Aztec Inspector on Paiju; its ingress points only to this site's private static service on the dedicated Docker network, with an unmatched-route 404. Keep the existing Device Keys tunnel/connector unchanged. The connector uses a token from a dedicated Bitwarden item and a mode-0600 runtime environment file on Paiju, never source control or GitHub logs. Expose no Paiju host HTTP port or Tailscale Funnel. The public site remains public (no Cloudflare Access login).

First prove the release origin over the tailnet and the new tunnel connector healthy while Fuji still owns the live hostname. Read the live Cloudflare zone and DNS record, capture its identifier and previous content/proxy mode for rollback, then update the existing `aztec-inspector.ajanderson.net` route to the new tunnel using Cloudflare's supported tunnel public-hostname/DNS configuration. Do not blindly POST a duplicate record or remove Fuji's certificate/site. Verify the public HTTPS route serves the Paiju build (not merely HTTP 200 from cached Fuji content) using a release-specific asset or version marker, plus image/sample loading and barcode-inspection smoke test in a browser. Inspect redirect, TLS, CSP/Umami script, and cache behavior. Roll back only this hostname to the captured Fuji record if acceptance fails; ensure Fuji still serves its prior artifact before taking the old deploy path out of service. Preserve old Fuji artifacts and Caddy route through a defined soak period; decommission them separately after acceptance.

## Monitoring

On Broadpeak Kuma, add one HTTP monitor named `Aztec Web Inspector (Paiju)`: public URL `https://aztec-inspector.ajanderson.net/`, 60-second interval, three retries, HTTPS certificate-expiry check, and tags `prod` and `paiju` (reuse the existing tags, do not invent duplicate labels). Prefer a keyword or other content assertion unique to this app over a bare 200 so a generic error or other site does not count as UP; confirm Kuma's current monitor type and expected response before saving.

Description: "Aztec Web Inspector is the public barcode-inspection website hosted on Paiju. Every 60 seconds Broadpeak checks its public HTTPS page through Cloudflare for a successful response and an Aztec Inspector page marker; three retries precede DOWN. UP means the public page and TLS route are reachable, not that barcode decoding, image upload, the analytics provider, or a user's browser works. No alert notification channel is configured."

Verify the monitor appears in Kuma, has its tags and check result, and has **no** notification binding. Check the dashboard from Broadpeak after cutover; a successful local Paiju origin probe alone is not public-path evidence. The absence of alerts is deliberate per owner request.

## Verification, rollback, and documentation

Before the switch: check baseline URL, DNS and old deployment; build and test the current production SHA, pin deploy/SSH identities, inspect Cloudflare route and existing Paiju networking, and validate Paiju release/connector independently. During cutover: change one hostname only, re-read DNS/Cloudflare route, request uncached HTML and build assets externally, run browser inspection with a sample barcode, verify Kuma status. Afterward: push a controlled `production` update and prove the workflow deploys it to Paiju without touching or restarting Fuji; test atomic release rollback to the previous Paiju build and document DNS rollback to Fuji. Keep the old version until the soak gate is complete.

Update this repository's deployment workflow and RUNBOOK/README, Paiju and Fuji context entries, and the existing Aztec deployment note only with observed final facts. Replace stale statements (including the historical NXDOMAIN claim and obsolete Hostinger DNS/SSH alias) rather than carrying two contradictory deploy procedures. Canonical contexts and Journal edits require their respective review/publication rules. Secrets remain referenced by item name only.

## Open implementation checks

- Confirm the Cloudflare zone/account permissions and exact existing DNS/proxy record before any cutover; no record identifier or tunnel token is assumed here.
- Confirm approved Tailscale ephemeral CI authentication/tag grant and a deploy-only SSH account's lifecycle before replacing the current Actions secrets. Avoid broad reusable tailnet access.
- Confirm how Paiju's image pinning, Compose/project ownership, disk headroom and Caddy patterns should be reused; do not alter the unrelated Device Keys stack.
- Confirm a stable, distinctive app marker for Kuma and release provenance without changing the user-facing app unnecessarily.
- Confirm the agreed soak duration before removing Fuji's Aztec route, assets, or credentials; absent that decision, leave them intact.
