# ZAWADI — Linode (Ubuntu) Deployment Runbook

Complete, copy-paste-able guide to take ZAWADI from `git clone` to a public
production stack at `https://alcurry.app` + `https://api.alcurry.app`,
running on a Linode VPS with Ubuntu 24.04 LTS.

Time budget: ~45 minutes the first time, ~3 minutes for every subsequent
deploy (fully automated via GitHub Actions).

---

## 0. Prerequisites checklist

| Item | Where | Cost | Required? |
|---|---|---|---|
| GitHub account with admin on the repo | github.com/devtestor/Zawadi | free | yes |
| Linode account | cloud.linode.com | from $12/mo (Linode 2 GB) | yes |
| Domain `alcurry.app` | Cloudflare Registrar | ~$13/yr | yes (already owned) |
| Resend account (transactional email) | resend.com | free up to 100/day | yes (sign-in OTP) |
| Cloudflare R2 bucket | dash.cloudflare.com | free up to 10 GB | yes (image uploads) |
| Pesapal merchant account | developer.pesapal.com | free, requires KYC | only for boost / wallet top-ups |
| Sentry account | sentry.io | free hobby | optional |
| OpenAI API key | platform.openai.com | pay-per-use | optional (AI writer + voice search) |
| Sightengine | sightengine.com | free 2k ops/mo | optional (image moderation) |
| Twilio or WhatsApp Cloud | twilio.com / business.facebook.com | pay-per-msg | optional (SMS phone verification) |
| LiveKit Cloud | livekit.io | free 100 min/mo | optional (video tour rooms) |

The stack boots and serves listings without any "optional" rows, but
sign-in (email OTP via Resend) and uploads (R2) are required for normal use.

---

## 1. Provision the Linode

### 1.1 Sign up

1. <https://login.linode.com/signup> — ID + a $5 deposit (refunded as credit).
2. Add a payment method.

### 1.2 Upload your SSH public key

```bash
cat ~/.ssh/id_ed25519.pub
```

In Linode Cloud Manager → **Account → SSH Keys → Add an SSH Key**, paste the line.

### 1.3 Create the Linode

**Linodes → Create Linode**

| Field | Value |
|---|---|
| Image | **Ubuntu 24.04 LTS** |
| Region | **Frankfurt (DE)** for EU + East Africa latency. Singapore or Mumbai for closer Africa coverage |
| Plan | **Shared CPU → Linode 2 GB** ($12/mo, 1 vCPU / 2 GB / 50 GB SSD). Bump to **Linode 4 GB** ($24/mo) if you expect >1k DAU at launch |
| Label | `alcurry-prod` |
| Tags | `prod,alcurry` |
| Root password | generate a strong one — you won't use it after bootstrap |
| SSH Keys | the one you just uploaded |
| Backups | **enable** ($2.50/mo, worth it) |
| Private IP | enable (free) |

Create. You'll get a **public IPv4** like `139.144.42.10`. Save it — you'll
use it three times.

### 1.4 Smoke test

Wait ~60 seconds for "Running" state, then:

```bash
ssh root@139.144.42.10 'uname -a && cat /etc/os-release | head -2'
```

Expected: `Ubuntu 24.04 LTS`. If you get a host-key warning, type `yes`.

### 1.5 Linode Cloud Firewall (recommended)

Cloud Manager → **Network → Firewalls → Create Firewall**:

| Inbound | Port | Source |
|---|---|---|
| Accept TCP | 22 | All IPv4 + IPv6 (or restrict to your IP) |
| Accept TCP | 80 | All IPv4 + IPv6 |
| Accept TCP | 443 | All IPv4 + IPv6 |

Drop everything else. Attach to `alcurry-prod`. This is belt-and-suspenders
on top of the ufw rules we'll set in §3.

---

## 2. Configure DNS at Cloudflare

Your domain `alcurry.app` is registered at Cloudflare.

In **DNS → Records** for `alcurry.app`, **delete the default parked-page
records** Cloudflare added. Add these two:

| Type | Name | IPv4 | Proxy | TTL |
|---|---|---|---|---|
| A | `@` (root) | your Linode IP | **DNS only** (grey cloud) | Auto |
| A | `api` | your Linode IP | **DNS only** (grey cloud) | Auto |

> ⚠️ Keep proxy OFF for both. Caddy provisions Let's Encrypt directly. You
> can flip the web record to proxied later, but the API record must stay
> DNS-only because Better Auth's CSRF check inspects the `Origin` header,
> which Cloudflare strips when proxied.

Recommended hardening:

| Type | Name | Content | Purpose |
|---|---|---|---|
| CAA | `@` | `0 issue "letsencrypt.org"` | only Let's Encrypt can issue certs |
| TXT | `@` | (SPF — added during §6 Resend setup) | email deliverability |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:postmaster@alcurry.app` | inbox-placement |

### 2.1 Propagation check

```bash
dig +short alcurry.app
dig +short api.alcurry.app
```

Both should return your Linode IPv4 within 30 seconds.

---

## 3. Bootstrap the VPS

This installs Docker, creates an `alcurry` deploy user, hardens sshd, sets
up ufw + fail2ban, prints a private SSH key for CI, and drops a starter
`.env`.

### 3.1 Run the bootstrap script

From your laptop (in the repo root):

```bash
ssh root@139.144.42.10 'bash -s' < scripts/vps-bootstrap.sh
```

The output ends with a private key block:

```
----------------- BEGIN -----------------
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXkt...
-----END OPENSSH PRIVATE KEY-----
------------------ END ------------------
```

Copy the entire block (including BEGIN/END lines) — this is the key
GitHub Actions will use to SSH in.

### 3.2 Confirm the deploy user works

```bash
ssh -i ~/.ssh/id_ed25519 alcurry@139.144.42.10 'docker --version && id'
```

You should see Docker 27.x and the `alcurry` user in the `docker` group. If
this fails, re-run the bootstrap — it's idempotent.

### 3.3 Verify the firewall

```bash
sudo ufw status numbered
```

Expect only 22 (OpenSSH), 80, 443 ALLOW.

### 3.4 Verify swap (Linode 2 GB)

The bootstrap script provisions a 2 GB swapfile so a memory spike during
`bun install` or `prisma generate` doesn't OOM-kill Postgres. Verify:

```bash
free -h
swapon --show
```

You should see ~2 GB of swap on `/swapfile`.

---

## 4. Configure GitHub repo secrets + variables

The deploy workflow needs three secrets and two repo variables.

### 4.1 Repo secrets

<https://github.com/devtestor/Zawadi/settings/secrets/actions> — add:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `139.144.42.10` (your Linode IPv4) |
| `DEPLOY_USER` | `alcurry` |
| `DEPLOY_SSH_KEY` | the private key block from §3.1 (entire `BEGIN`/`END` block) |

Or from your terminal with `gh`:

```bash
gh secret set DEPLOY_HOST -b "139.144.42.10"
gh secret set DEPLOY_USER -b "alcurry"
gh secret set DEPLOY_SSH_KEY < /tmp/alcurry-deploy-private-key
```

### 4.2 Repo variables

<https://github.com/devtestor/Zawadi/settings/variables/actions> — add:

| Name | Value |
|---|---|
| `API_DOMAIN` | `api.alcurry.app` |
| `WEB_DOMAIN` | `alcurry.app` |

The web image bakes `EXPO_PUBLIC_BACKEND_URL=https://${API_DOMAIN}` at build
time, so changing it later requires a rebuild.

---

## 5. Set up Cloudflare R2 (image uploads)

R2 is the cheapest sensible S3-compatible option — free up to 10 GB stored
+ 1 M operations/month + zero egress.

### 5.1 Create the bucket

1. <https://dash.cloudflare.com> → your account → **R2 Object Storage → Create bucket**.
2. Name: `alcurry-prod`. Location hint: leave Automatic.
3. After creation, open the bucket → **Settings → Public access → Allow access**
   (this exposes a `pub-xxxxx.r2.dev` URL; you can attach `cdn.alcurry.app`
   later).

### 5.2 Create an API token

1. **R2 → Manage R2 API Tokens → Create API Token**.
2. Permissions: **Object Read & Write**, restricted to bucket `alcurry-prod`.
3. Save the **Access Key ID** and **Secret Access Key** — the Secret is
   shown exactly once.

### 5.3 Note the endpoint

R2's S3 endpoint is account-scoped:
`https://<account-id>.r2.cloudflarestorage.com`

Your account ID is at the top of the R2 dashboard. Save it.

---

## 6. Set up Resend (email)

### 6.1 Get the API key

1. <https://resend.com/signup>.
2. **API Keys → Create API Key** with **Full Access** scope, name `alcurry-prod`.
3. Copy the `re_xxxxxxxx...` key.

### 6.2 Verify your sending domain

1. **Domains → Add Domain → `alcurry.app`**.
2. Copy the three TXT/DKIM records Resend gives you.
3. Add them to Cloudflare DNS (DNS → Records).
4. Back in Resend, click **Verify**. Cloudflare DNS verifies in <30s.

Until verified, Resend lets you send from `onboarding@resend.dev` — fine
for testing but lands in spam.

### 6.3 Set the From address

- Verified: `EMAIL_FROM="ALCURRY <no-reply@alcurry.app>"`
- Sandbox:  `EMAIL_FROM="ALCURRY <onboarding@resend.dev>"`

---

## 7. (Optional) Pesapal merchant account

Boost payments + wallet top-ups go through Pesapal. Skip if deferring
monetization.

### 7.1 Sandbox first

1. <https://developer.pesapal.com> → **Get Started** → sandbox account.
2. Create an app called `alcurry-sandbox`.
3. Copy the **Consumer Key** and **Consumer Secret**.
4. For sandbox use `PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`.

### 7.2 Production switch (later)

Once your business is KYC-approved by Pesapal:

1. Get production credentials.
2. Switch `PESAPAL_BASE_URL=https://pay.pesapal.com/v3`.
3. Re-deploy.

> ⚠️ **History scrub required before going public.** The previous Pesapal
> sandbox keys were committed to git history (see commits
> `474377d` / `e47b0ef`). They're no longer tracked but remain in history.
> Before switching to production credentials, either rotate them in the
> Pesapal dashboard or rewrite history (`git filter-repo --invert-paths
> --path backend/.env.production`) and force-push. The same applies to the
> `BETTER_AUTH_SECRET` and `OPENAI_API_KEY` in that file.

---

## 8. Fill in `/opt/alcurry/.env` on the VPS

The bootstrap script created a starter `.env`. SSH in and edit it with real
values. The canonical template — every supported variable, with comments —
lives in `.env.production.example` at the repo root. Copy from there:

```bash
# from your laptop, in the repo root:
scp .env.production.example alcurry@139.144.42.10:/tmp/.env.template

# then on the VPS:
ssh alcurry@139.144.42.10
sudo cp /opt/alcurry/.env /opt/alcurry/.env.bak.$(date +%s) 2>/dev/null || true
sudo cp /tmp/.env.template /opt/alcurry/.env
sudo chown alcurry:alcurry /opt/alcurry/.env
sudo chmod 600 /opt/alcurry/.env
sudo nano /opt/alcurry/.env
```

Minimum to boot the stack:

```env
API_DOMAIN=api.alcurry.app
WEB_DOMAIN=alcurry.app
GITHUB_REPO=devtestor/Zawadi
IMAGE_TAG=latest

POSTGRES_USER=alcurry
POSTGRES_PASSWORD=<openssl rand -base64 24>
POSTGRES_DB=alcurry

BETTER_AUTH_SECRET=<openssl rand -base64 32>

RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=ALCURRY <no-reply@alcurry.app>

STORAGE_PROVIDER=s3
S3_REGION=auto
S3_BUCKET=alcurry-prod
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from §5.2>
S3_SECRET_ACCESS_KEY=<from §5.2>
S3_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

Save (Ctrl+O, Enter, Ctrl+X).

> ⚠️ The file is mode 600 owned by `alcurry`. Don't `chmod` it
> world-readable and don't move it out of `/opt/alcurry/`.

---

## 9. First deploy

### 9.1 Push to main

From your laptop:

```bash
git push origin main
```

Or trigger manually:
<https://github.com/devtestor/Zawadi/actions/workflows/deploy.yml> →
**Run workflow** → `main` → Run.

### 9.2 Watch the workflow

Two jobs:

1. **build-and-push** (~4 min) — builds the backend + web Docker images and
   pushes them to GHCR (`ghcr.io/devtestor/zawadi/backend:<sha>` and
   `ghcr.io/devtestor/zawadi/web:<sha>`, plus `:latest`).
2. **deploy** (~1 min) — SCPs compose + Caddyfile + `deploy.sh` to
   `/opt/alcurry/` on the VPS, then SSHes in and runs `./scripts/deploy.sh`
   which bumps `IMAGE_TAG`, pulls, restarts, and polls `/health` for 60s.

### 9.3 Confirm

```bash
curl -fsS https://api.alcurry.app/health
# {"status":"ok"}

curl -I https://alcurry.app
# HTTP/2 200, Caddy + your web bundle
```

Visit:

- <https://api.alcurry.app/api/docs> — Scalar API explorer.
- <https://alcurry.app> — the web app.

Caddy provisions Let's Encrypt certs on first HTTPS hit. The first call to
each host can take 10–20 seconds; subsequent calls are instant.

### 9.4 Apply the Prisma schema

The backend Dockerfile entrypoint runs `prisma migrate deploy` on every
boot. If no migrations exist yet, it falls back to
`prisma db push --accept-data-loss` to materialise the tables.

```bash
ssh alcurry@139.144.42.10 \
  'cd /opt/alcurry && docker compose -f docker-compose.prod.yml logs backend | tail -40'
```

Look for `Environment variables loaded` followed by `server started`.

### 9.5 Promote yourself to admin

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml exec db psql -U alcurry -d alcurry \
  -c "UPDATE \"User\" SET role='admin' WHERE email='you@example.com';"
```

You must sign in once via the web/mobile app first so the row exists.

---

## 10. Verify the stack

### 10.1 Functional smoke test

| Path | Expected |
|---|---|
| `GET https://api.alcurry.app/health` | `{"status":"ok"}` |
| `GET https://api.alcurry.app/api/openapi.json` | OpenAPI 3.1 JSON |
| `GET https://api.alcurry.app/api/listings` | `{"data":{"items":[],"nextCursor":null}}` initially |
| `GET https://alcurry.app/` | Expo web app HTML |
| `POST https://api.alcurry.app/api/auth/email-otp/send-verification-otp` with `{"email":"you@example.com","type":"sign-in"}` | 200 + email arrives |

### 10.2 Container health

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml ps
```

All five services should be `running (healthy)`:
`caddy`, `db`, `backend`, `web`, `db_backup`.

### 10.3 Backup test

```bash
ssh alcurry@139.144.42.10 'ls -lh /opt/alcurry/backups/'
```

The `db_backup` sidecar runs nightly. Within 24h you should see an
`alcurry-YYYYMMDD-HHMMSS.sql.gz` file. Files older than 14 days are pruned.

To restore (DR):

```bash
gunzip -c /opt/alcurry/backups/alcurry-20260615-020000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U alcurry -d alcurry
```

### 10.4 Tail logs

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=20 backend caddy
```

Expect one structured-log line per request like:
`{"levelName":"info","msg":"request","reqId":"...","method":"GET","path":"/health","status":200,"ms":2}`

---

## 11. Every-day operations

### 11.1 Deploy a new version

Push to `main`. Workflow rebuilds + redeploys atomically. Roll back by
re-running the workflow with a previous tag (Actions → Run workflow →
type the older commit SHA).

### 11.2 Inspect a request

Every response has an `x-request-id` header. Grab one and:

```bash
ssh alcurry@139.144.42.10 \
  'cd /opt/alcurry && docker compose -f docker-compose.prod.yml logs backend' \
  | grep <request-id>
```

### 11.3 Rotate secrets

```bash
ssh alcurry@139.144.42.10
sudo nano /opt/alcurry/.env       # change BETTER_AUTH_SECRET
cd /opt/alcurry
docker compose -f docker-compose.prod.yml restart backend
```

> ⚠️ Rotating the auth secret invalidates every active session.

### 11.4 Add an admin

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml exec db psql -U alcurry -d alcurry \
  -c "UPDATE \"User\" SET role='admin' WHERE email='teammate@example.com';"
```

### 11.5 Resize the Linode

Cloud Manager → your Linode → **Resize**. Pick Linode 4 GB or 8 GB. Reboot
takes <60s; disk is preserved.

### 11.6 Migrate to managed Postgres

When self-hosted Postgres on the VPS becomes a bottleneck:

1. Provision a managed instance (Linode Managed Databases / Neon / Supabase).
2. Take a final dump: `docker compose exec db pg_dump -U alcurry alcurry | gzip > final.sql.gz`.
3. Restore into the managed host.
4. Update `DATABASE_URL` in `.env`.
5. Remove the `db` and `db_backup` services from `docker-compose.prod.yml`.
6. `docker compose up -d`.

---

## 12. Disaster recovery

### 12.1 Backend is crashlooping

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml logs --tail=200 backend
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<previous-sha>/" .env
./scripts/deploy.sh
```

### 12.2 Postgres data corruption

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec db dropdb -U alcurry alcurry
docker compose -f docker-compose.prod.yml exec db createdb -U alcurry alcurry
LATEST=$(ls -t backups/alcurry-*.sql.gz | head -1)
gunzip -c "$LATEST" | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U alcurry -d alcurry
docker compose -f docker-compose.prod.yml start backend
```

### 12.3 TLS cert isn't issuing

```bash
ssh alcurry@139.144.42.10
cd /opt/alcurry
docker compose -f docker-compose.prod.yml logs caddy | tail -50
```

Usual causes:

- DNS hasn't propagated to LE's resolvers yet (wait 5 min).
- Port 80 blocked (check `sudo ufw status` and Linode Cloud Firewall).
- Domain is Cloudflare-proxied (turn it OFF until the first cert issues).
- LE rate-limit hit (5 failed validations / hour / host); wait an hour.

### 12.4 Lost SSH key

Linode → your Linode → **Rescue** → boot rescue mode. Mount the disk, add a
new key to `/home/alcurry/.ssh/authorized_keys`. Reboot. SSH in. Update
`DEPLOY_SSH_KEY` in GitHub.

### 12.5 GitHub Actions can't reach the VPS

Most likely the SSH key on GitHub doesn't match the VPS. Regenerate:

```bash
ssh alcurry@139.144.42.10 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/alcurry-deploy && \
  cat ~/.ssh/alcurry-deploy.pub >> ~/.ssh/authorized_keys && \
  cat ~/.ssh/alcurry-deploy'
```

Copy the private key from the output, replace `DEPLOY_SSH_KEY` in GitHub.

---

## 13. Monitoring + alerting

### 13.1 Cheapest: UptimeRobot

1. <https://uptimerobot.com/signup> — free 50 monitors, 5-min interval.
2. Add monitor: `https://api.alcurry.app/health`, expect string `ok`.
3. Add monitor: `https://alcurry.app/`, expect HTTP 200.
4. Notification: email or a Telegram bot.

### 13.2 Better: BetterStack

1. <https://betterstack.com> — free 10 monitors + 1 GB logs/mo.
2. Add the two HTTP monitors.
3. Optional: install the Vector agent on the VPS to ship JSON logs.

### 13.3 Sentry for app errors

Set `SENTRY_DSN` in `.env` and every uncaught backend error + every
React error-boundary on mobile/web reports automatically. Set an alert
rule: **frequency > 5 events / hour → notify**.

### 13.4 Linode Longview (free, host-level)

Cloud Manager → **Longview → Add Client**. Run the install one-liner on the
VPS. You get CPU/RAM/disk/network history for free.

---

## 14. Pre-production security checklist

Mandatory:

- [ ] Strong, unique `BETTER_AUTH_SECRET` (32 bytes from `openssl rand -base64 32`).
- [ ] Strong, unique `POSTGRES_PASSWORD`.
- [ ] Dev and prod `BETTER_AUTH_SECRET`s differ.
- [ ] `STORAGE_PROVIDER=s3` with bucket-scoped R2 token (read+write, no delete-bucket).
- [ ] DNS A records have `Proxy = DNS only` (NOT Cloudflare-proxied) so Better Auth's CSRF works.
- [ ] `ufw` shows only 22, 80, 443 open.
- [ ] Linode Cloud Firewall mirrors the ufw rules.
- [ ] `/etc/ssh/sshd_config` has `PermitRootLogin prohibit-password` + `PasswordAuthentication no`.
- [ ] You've signed in once + ran the `UPDATE "User" SET role='admin'` SQL.
- [ ] CAA record at Cloudflare restricts CA issuance to Let's Encrypt.
- [ ] Resend domain is verified (DKIM + SPF + DMARC).
- [ ] At least one uptime monitor (§13) is firing test pages.
- [ ] A Linode disk snapshot exists from BEFORE go-live.
- [ ] Linode billing alert is set.
- [ ] GitHub repo "Secret scanning push protection" is enabled.

Strongly recommended:

- [ ] You've tested a backup restore on a throwaway Linode within the first week.
- [ ] `git log -p -- backend/.env.production mobile/.env.production` shows
  only sandbox/placeholder values. The Pesapal sandbox keys and
  `BETTER_AUTH_SECRET` currently in commits `474377d` / `e47b0ef` should be
  rotated before launch (see §7.2 note). Untracked locally now, but still
  in history.
- [ ] You've revoked any personal access token used for the first push.
- [ ] Pesapal credentials are PRODUCTION keys, not sandbox (when you flip).

---

## 15. Mobile app submission (out of scope but linked)

1. Apple Developer account ($99/yr) + Google Play Console account ($25 one-time).
2. From `mobile/`:
   ```bash
   bunx eas-cli login
   bunx eas-cli build --platform all --profile production
   ```
3. Submit:
   ```bash
   bunx eas-cli submit --platform ios
   bunx eas-cli submit --platform android
   ```
4. OTA updates between store releases:
   ```bash
   bunx eas-cli update --branch production --message "Bug fixes"
   ```

---

## 16. Estimated monthly cost

| Item | Monthly | Notes |
|---|---|---|
| Linode 2 GB + backups | ~$14.50 | scales to thousands of users |
| Linode Cloud Firewall | $0 | free |
| Cloudflare R2 (10 GB, 1 M ops) | $0 | free tier covers MVP |
| Cloudflare Registrar (.app) | $1.10 | $13/yr ÷ 12 |
| Resend (3k emails/mo) | $0 | free up to 100/day |
| Pesapal | $0 | per-transaction fee only (1.5–3%) |
| Sentry (hobby) | $0 | 5k events/mo free |
| UptimeRobot | $0 | free 50 monitors |
| **Total** | **~$15.60/mo** | adequate for 5–10k MAU |

When you outgrow Linode 2 GB (sustained CPU > 70% or RAM > 75%):
- Vertical: resize to Linode 4 GB (~$24/mo).
- Then split: Linode Managed Postgres + a second backend container behind
  a Caddy `load-balance` directive.

---

## Appendix A — Files this guide references

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | The stack: Caddy + backend + Postgres + web + nightly backup |
| `Caddyfile` | TLS + reverse-proxy config for both hosts |
| `backend/Dockerfile` | Backend runtime image (multi-stage Bun) |
| `mobile/Dockerfile.web` | Web app build → static Caddy server image |
| `scripts/vps-bootstrap.sh` | Fresh-VPS bring-up (Docker, ufw, deploy user, sshd hardening, swap) |
| `scripts/deploy.sh` | Idempotent pull + restart + health-poll |
| `.github/workflows/deploy.yml` | Build images, push to GHCR, SSH + redeploy |
| `.env.production.example` | Every supported env var with annotated defaults |

## Appendix B — Quick reference commands

```bash
# SSH as the deploy user
ssh alcurry@<LINODE_IP>

# Tail backend logs
docker compose -f /opt/alcurry/docker-compose.prod.yml logs -f backend

# Restart just the backend
docker compose -f /opt/alcurry/docker-compose.prod.yml restart backend

# Open a Prisma Studio tunnel (from your laptop)
ssh -L 5555:localhost:5555 alcurry@<LINODE_IP> \
  'docker compose -f /opt/alcurry/docker-compose.prod.yml exec backend bunx prisma studio --hostname 0.0.0.0'
# Then visit http://localhost:5555

# Manual backup (on demand)
docker compose -f /opt/alcurry/docker-compose.prod.yml exec db \
  pg_dump -U alcurry alcurry | gzip > /opt/alcurry/backups/manual-$(date +%s).sql.gz

# Force-bump to a specific image tag
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<sha-or-tag>/" /opt/alcurry/.env
/opt/alcurry/scripts/deploy.sh

# Verify the running image
docker compose -f /opt/alcurry/docker-compose.prod.yml images backend
```
