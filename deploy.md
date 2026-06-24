# ZAWADI — VPS Deployment Runbook

Complete, copy-paste-able guide to take ZAWADI from `git clone` to a public
production stack at `https://zawadi.app` + `https://api.zawadi.app`.

Time budget: ~45 minutes the first time, ~3 minutes for every subsequent
deploy (which is fully automated via GitHub Actions).

---

## 0. Prerequisites checklist

| Item | Where | Cost | Required? |
|---|---|---|---|
| GitHub account with admin on the repo | github.com/devtestor/Zawadi | free | yes |
| VPS provider account | Hetzner Cloud recommended | ~€4.51/mo | yes |
| Domain name | Cloudflare Registrar recommended | ~$13/yr | yes |
| Resend account (transactional email) | resend.com | free up to 100/day | yes (sign-in OTP) |
| Pesapal merchant account | developer.pesapal.com | free, requires KYC | only if you want boost + wallet top-up |
| S3-compatible bucket | Cloudflare R2 recommended | free up to 10GB | yes (image uploads) |
| Sentry account | sentry.io | free hobby | optional |
| OpenAI API key | platform.openai.com | pay-per-use | optional (AI writer + voice search) |
| Sightengine | sightengine.com | free 2k ops/mo | optional (image moderation) |
| Twilio or WhatsApp Cloud | twilio.com / business.facebook.com | pay-per-msg | optional (SMS phone verification) |
| LiveKit Cloud | livekit.io | free 100 min/mo | optional (video tour rooms) |

The stack boots and serves listings without any of the "optional" rows, but
sign-in (email OTP via Resend) and uploads (S3) are required for normal use.

---

## 1. Provision the VPS

### 1.1 Sign up at Hetzner Cloud

1. <https://accounts.hetzner.com/signUp> — needs ID upload for KYC, ~10 min.
2. Add a payment method (Hetzner uses SEPA, card, PayPal).
3. Create a new project, name it `zawadi`.

### 1.2 Upload your SSH public key

```bash
cat ~/.ssh/id_ed25519.pub
```

In Hetzner Console → **Security → SSH Keys → Add SSH Key**, paste the line.

### 1.3 Spin up the server

In your project: **Servers → New Server**

| Field | Value |
|---|---|
| Location | **Falkenstein (FSN1)** (lowest €/perf, good EU↔Africa) |
| Image | **Ubuntu 24.04** |
| Type | **CX22** (2 vCPU x86, 4 GB RAM, 40 GB SSD) |
| Networking | IPv4 + IPv6 (default) |
| SSH Key | the one you just uploaded |
| Volumes | none (the 40 GB is enough until you grow) |
| Firewalls | leave empty (we set ufw inside) |
| Backups | enable ✅ (20% surcharge, well worth it) |
| Name | `zawadi-prod` |

Create. You'll get a **public IPv4** like `5.78.123.45`. Save it — you'll
use it three times.

### 1.4 Smoke test

```bash
ssh root@5.78.123.45 'uname -a && cat /etc/os-release | head -2'
```

You should see Ubuntu 24.04. If you get a host-key warning, type `yes`.

---

## 2. Buy the domain

### 2.1 Cloudflare Registrar

1. Sign in at <https://dash.cloudflare.com>.
2. **Domain Registration → Register Domains**.
3. Search `zawadi.app` (or your preferred name). `.app` is ~$13/yr.
4. Complete the purchase — Cloudflare auto-creates a free Cloudflare zone
   for it, with their nameservers already set.

### 2.2 DNS records

In **DNS → Records** for your zone, **delete every record** Cloudflare added
by default (they're parked-page records). Add these two:

| Type | Name | IPv4 | Proxy | TTL |
|---|---|---|---|---|
| A | `@` (root) | your VPS IP | **DNS only** (grey cloud) | Auto |
| A | `api` | your VPS IP | **DNS only** (grey cloud) | Auto |

> ⚠️ Keep proxy OFF for both. Caddy provisions Let's Encrypt directly. You
> can flip the web record to proxied later, but the API record must stay DNS
> only because Better Auth's CSRF check inspects the `Origin` header, which
> Cloudflare strips when proxied.

Optional but recommended:

| Type | Name | Content | Purpose |
|---|---|---|---|
| CAA | `@` | `0 issue "letsencrypt.org"` | only Let's Encrypt can issue certs |
| TXT | `@` | (SPF — set up after Resend, see §6) | email deliverability |

### 2.3 Propagation check

DNS at Cloudflare is near-instant. Verify from your laptop:

```bash
dig +short zawadi.app
dig +short api.zawadi.app
```

Both should return your VPS IPv4 within 30 seconds.

---

## 3. Bootstrap the VPS

This installs Docker, creates a `zawadi` deploy user, hardens sshd, sets up
ufw + fail2ban, prints a private SSH key for CI, and drops a starter `.env`.

### 3.1 Run the bootstrap script

From your laptop (in the repo root):

```bash
ssh root@5.78.123.45 'bash -s' < scripts/vps-bootstrap.sh
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
ssh -i ~/.ssh/id_ed25519 zawadi@5.78.123.45 'docker --version && id'
```

You should see Docker 27.x and the `zawadi` user in the `docker` group. If
this fails, re-run the bootstrap — it's idempotent.

### 3.3 Verify the firewall

Still in that SSH session:

```bash
sudo ufw status numbered
```

Expect ports 22 (OpenSSH), 80, and 443 ALLOW. Nothing else.

---

## 4. Configure GitHub repo secrets + variables

The deploy workflow needs four secrets and two repo variables.

### 4.1 Repo secrets

Open <https://github.com/devtestor/Zawadi/settings/secrets/actions> and add:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `5.78.123.45` (your VPS IPv4) |
| `DEPLOY_USER` | `zawadi` |
| `DEPLOY_SSH_KEY` | the private key block from §3.1 (entire `BEGIN`/`END` block) |

Or from your terminal with `gh`:

```bash
gh secret set DEPLOY_HOST -b "5.78.123.45"
gh secret set DEPLOY_USER -b "zawadi"
gh secret set DEPLOY_SSH_KEY < /tmp/zawadi-deploy-private-key
```

### 4.2 Repo variables

Open <https://github.com/devtestor/Zawadi/settings/variables/actions> and add:

| Name | Value |
|---|---|
| `API_DOMAIN` | `api.zawadi.app` |
| `WEB_DOMAIN` | `zawadi.app` |

The web image bakes `EXPO_PUBLIC_BACKEND_URL=https://${API_DOMAIN}` at build
time, so changing it later requires a rebuild.

---

## 5. Set up Cloudflare R2 (image uploads)

The backend uses S3-compatible storage for listing images. R2 is the cheapest
sensible option — free up to 10 GB stored + 1 M operations/month + zero
egress.

### 5.1 Create the bucket

1. <https://dash.cloudflare.com> → your account → **R2 Object Storage → Create bucket**.
2. Name: `zawadi-prod`. Location hint: leave Automatic.
3. After creation, open the bucket → **Settings → Public access → Allow access** (this exposes a `pub-xxxxx.r2.dev` URL; you can attach a custom domain like `cdn.zawadi.app` later).

### 5.2 Create an API token

1. **R2 → Manage R2 API Tokens → Create API Token**.
2. Permissions: **Object Read & Write**, restricted to bucket `zawadi-prod`.
3. Save the **Access Key ID** and **Secret Access Key** — you'll see the
   Secret exactly once.

### 5.3 Note the endpoint

R2's S3 endpoint is account-scoped:
`https://<account-id>.r2.cloudflarestorage.com`

Your account ID is visible at the top of the R2 dashboard. Save it.

---

## 6. Set up Resend (email)

### 6.1 Get the API key

1. <https://resend.com/signup>.
2. **API Keys → Create API Key** with **Full Access** scope, name `zawadi-prod`.
3. Copy the `re_xxxxxxxx...` key.

### 6.2 Verify your sending domain

1. **Domains → Add Domain → `zawadi.app`**.
2. Copy the three TXT/DKIM records Resend gives you.
3. Add them to Cloudflare DNS (DNS → Records).
4. Back in Resend, click **Verify**. Cloudflare DNS is fast — usually 30s.

Until verified, Resend lets you send from `onboarding@resend.dev`, which
works for testing but lands in spam.

### 6.3 Set the From address

Decide which sender to use:

- Verified: `EMAIL_FROM="ZAWADI <no-reply@zawadi.app>"`
- Sandbox:   `EMAIL_FROM="ZAWADI <onboarding@resend.dev>"`

---

## 7. (Optional but recommended) Pesapal merchant account

Boost payments + wallet top-ups go through Pesapal. Skip this section if
you're deferring monetization.

### 7.1 Sandbox first

1. <https://developer.pesapal.com> → **Get Started** → sandbox account.
2. Create an app called `zawadi-sandbox`.
3. Copy the **Consumer Key** and **Consumer Secret**.
4. For sandbox use `PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`.

### 7.2 Production switch (later)

Once your business is registered in your target country (KE/RW/UG/TZ) and
KYC-approved by Pesapal:

1. Get production credentials.
2. Switch `PESAPAL_BASE_URL=https://pay.pesapal.com/v3`.
3. Re-deploy.

---

## 8. Fill in /opt/zawadi/.env on the VPS

The bootstrap script created a starter `.env`. SSH in and edit it with real
values:

```bash
ssh zawadi@5.78.123.45
sudo nano /opt/zawadi/.env
```

Minimum to boot the stack:

```env
# ---- core ----
API_DOMAIN=api.zawadi.app
WEB_DOMAIN=zawadi.app
GITHUB_REPO=devtestor/Zawadi
IMAGE_TAG=latest
LOG_LEVEL=info

# ---- database ----
POSTGRES_USER=zawadi
POSTGRES_PASSWORD=<openssl rand -base64 24>     # paste a strong one
POSTGRES_DB=zawadi

# ---- auth ----
BETTER_AUTH_SECRET=<openssl rand -base64 32>    # paste a strong one

# ---- email (Resend) ----
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=ZAWADI <no-reply@zawadi.app>

# ---- storage (Cloudflare R2) ----
STORAGE_PROVIDER=s3
S3_REGION=auto
S3_BUCKET=zawadi-prod
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from §5.2>
S3_SECRET_ACCESS_KEY=<from §5.2>
S3_PUBLIC_URL=https://pub-xxxxx.r2.dev      # or your CDN domain
```

Save (Ctrl+O, Enter, Ctrl+X).

> ⚠️ The file is mode 600 owned by `zawadi`. Don't `chmod` it world-readable
> and don't move it out of `/opt/zawadi/`.

### 8.1 Pesapal block (skip if §7 skipped)

Append to the same `.env`:

```env
PESAPAL_CONSUMER_KEY=<from §7>
PESAPAL_CONSUMER_SECRET=<from §7>
PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3  # or production URL
PESAPAL_CURRENCY=KES                                   # or USD / RWF / UGX / TZS
```

### 8.2 Policy knobs (sensible defaults)

```env
PLATFORM_FEE_BPS=250            # 2.5% on every escrow release
HIGH_VALUE_USD=500000           # listings above this go to admin queue
KYC_REQUIRED_OVER_USD=1000      # trades above this require approved KYC
TWOFA_REQUIRED_OVER_USD=5000    # withdrawals above this require TOTP
HOLDING_PERIOD_DAYS=3           # auto-release escrow N days after delivered
WALLET_DEFAULT_CURRENCY=USD
```

### 8.3 Optional integrations

```env
SENTRY_DSN=https://xxxx@oXXXX.ingest.us.sentry.io/XXXX
OPENAI_API_KEY=sk-proj-xxxx
SIGHTENGINE_USER=xxxx
SIGHTENGINE_SECRET=xxxx
LIVEKIT_API_KEY=APIxxxx
LIVEKIT_API_SECRET=xxxx
LIVEKIT_URL=wss://xxxxx.livekit.cloud
IPINFO_TOKEN=xxxx
SANCTIONS_PROVIDER=opensanctions
OPENSANCTIONS_API_KEY=xxxx
WHATSAPP_PHONE_ID=xxxxx
WHATSAPP_TOKEN=EAA...
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_FROM=+15551234567
```

---

## 9. First deploy

### 9.1 Push to main

From your laptop:

```bash
git push origin main
```

Or trigger manually via GitHub Actions UI:
<https://github.com/devtestor/Zawadi/actions/workflows/deploy.yml> →
**Run workflow** → `main` → Run.

### 9.2 Watch the workflow

It runs two jobs:

1. **build-and-push** (~4 min) — builds the backend + web Docker images and
   pushes them to GHCR (`ghcr.io/devtestor/zawadi/backend:<sha>` and
   `ghcr.io/devtestor/zawadi/web:<sha>`, plus `:latest` tags).
2. **deploy** (~1 min) — SCPs the compose + Caddyfile + deploy.sh to
   `/opt/zawadi/` on the VPS, then SSHes in and runs `./scripts/deploy.sh`
   which bumps `IMAGE_TAG`, pulls, restarts, and polls `/health` for 60s.

### 9.3 Confirm

From your laptop:

```bash
curl -fsS https://api.zawadi.app/health
# {"status":"ok"}

curl -I https://zawadi.app
# HTTP/2 200, Caddy + your web bundle
```

Visit:

- <https://api.zawadi.app/api/docs> — Scalar API explorer.
- <https://zawadi.app> — the web app.

Caddy provisions Let's Encrypt certs on first HTTPS hit. The first call to
each host can take 10–20 seconds; subsequent calls are instant.

### 9.4 Apply the Prisma schema

The backend Dockerfile entrypoint runs `prisma migrate deploy` on every
boot. If no migrations exist yet (this is the case until you generate them),
it falls back to `prisma db push --accept-data-loss` to materialise the
tables. Watch the logs:

```bash
ssh zawadi@5.78.123.45 'cd /opt/zawadi && docker compose -f docker-compose.prod.yml logs backend | tail -40'
```

Look for `Environment variables loaded` followed by `server started`.

### 9.5 Promote yourself to admin

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
docker compose -f docker-compose.prod.yml exec db psql -U zawadi -d zawadi \
  -c "UPDATE \"User\" SET role='admin' WHERE email='you@example.com';"
```

Replace `you@example.com` with your sign-in email. You'll need to sign in
once via the mobile app or web first so the row exists.

---

## 10. Verify the stack

### 10.1 Functional smoke test

| Path | Expected |
|---|---|
| `GET https://api.zawadi.app/health` | `{"status":"ok"}` |
| `GET https://api.zawadi.app/api/openapi.json` | OpenAPI 3.1 JSON |
| `GET https://api.zawadi.app/api/listings` | `{"data":{"items":[],"nextCursor":null}}` initially |
| `GET https://zawadi.app/` | Expo web app HTML |
| `POST https://api.zawadi.app/api/auth/email-otp/send-verification-otp` with body `{"email":"you@example.com","type":"sign-in"}` | 200 + email arrives at your inbox |

### 10.2 Container health

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
docker compose -f docker-compose.prod.yml ps
```

All five services should be `running (healthy)`:
`caddy`, `db`, `backend`, `web`, `db_backup`.

### 10.3 Backup test

```bash
ssh zawadi@5.78.123.45 'ls -lh /opt/zawadi/backups/'
```

The `db_backup` sidecar runs nightly. Within 24h you should see a
`zawadi-YYYYMMDD-HHMMSS.sql.gz` file. Older than 14 days are pruned.

To restore (in disaster recovery):

```bash
gunzip -c /opt/zawadi/backups/zawadi-20260615-020000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U zawadi -d zawadi
```

### 10.4 Tail logs

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=20 backend caddy
```

You should see one structured-log line per request like:
`{"levelName":"info","msg":"request","reqId":"...","method":"GET","path":"/health","status":200,"ms":2}`

---

## 11. Every-day operations

### 11.1 Deploy a new version

Just push to `main`. The workflow rebuilds + redeploys atomically. Roll-back
by re-running the workflow with a previous tag (Actions → Run workflow →
type the older commit SHA).

### 11.2 Inspect a request

Every request has an `x-request-id` header in its response. Grab one from
the client and grep:

```bash
ssh zawadi@5.78.123.45 \
  'cd /opt/zawadi && docker compose -f docker-compose.prod.yml logs backend' \
  | grep <request-id>
```

### 11.3 Rotate secrets

Rotate `BETTER_AUTH_SECRET`:

```bash
ssh zawadi@5.78.123.45
sudo nano /opt/zawadi/.env       # change BETTER_AUTH_SECRET
cd /opt/zawadi
docker compose -f docker-compose.prod.yml restart backend
```

> ⚠️ Rotating the auth secret invalidates every active session. Users will
> have to sign in again.

### 11.4 Add an admin

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
docker compose -f docker-compose.prod.yml exec db psql -U zawadi -d zawadi \
  -c "UPDATE \"User\" SET role='admin' WHERE email='teammate@example.com';"
```

### 11.5 Resize the VPS

When CPU or RAM are pinned, Hetzner Console → your server → **Rescale**.
Pick CX32 (4 vCPU / 8 GB) or CPX31 (4 vCPU AMD / 8 GB). Reboot takes <30s.
For RAM-only rescales, the data volume is preserved automatically.

### 11.6 Migrate to Postgres on a managed host

When you outgrow self-hosted Postgres on the VPS:

1. Provision a managed instance (Neon, Supabase, Railway, Hetzner Postgres).
2. Take a final backup: `docker compose exec db pg_dump -U zawadi zawadi | gzip > final.sql.gz`.
3. Restore into the managed host.
4. Update `DATABASE_URL` in `.env`.
5. Remove the `db` and `db_backup` services from `docker-compose.prod.yml`.
6. `docker compose up -d`.

---

## 12. Disaster recovery scenarios

### 12.1 Backend is crashlooping

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
docker compose -f docker-compose.prod.yml logs --tail=200 backend
# Roll back to previous tag:
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<previous-sha>/" .env
./scripts/deploy.sh
```

### 12.2 Postgres data corruption

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
# Stop the backend so nothing is mid-write.
docker compose -f docker-compose.prod.yml stop backend
# Drop the database, recreate it.
docker compose -f docker-compose.prod.yml exec db dropdb -U zawadi zawadi
docker compose -f docker-compose.prod.yml exec db createdb -U zawadi zawadi
# Restore the most recent backup.
LATEST=$(ls -t backups/zawadi-*.sql.gz | head -1)
gunzip -c "$LATEST" | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U zawadi -d zawadi
# Restart the backend.
docker compose -f docker-compose.prod.yml start backend
```

### 12.3 TLS cert isn't issuing

Caddy provisions Let's Encrypt automatically; if it fails, check:

```bash
ssh zawadi@5.78.123.45
cd /opt/zawadi
docker compose -f docker-compose.prod.yml logs caddy | tail -50
```

Usual causes:

- DNS hasn't propagated to LE's resolvers yet (wait 5 min).
- Port 80 is blocked (check `sudo ufw status` — must allow 80/tcp).
- Domain is behind Cloudflare proxy (turn it OFF, then back ON after first
  cert issues).
- Rate-limit hit (LE allows 5 failed validations / hour / host); wait an
  hour.

### 12.4 Lost SSH key

If you lose the `~/.ssh/id_ed25519` key but Hetzner still has your account:

1. Hetzner Console → server → **Rescue → Enable** with a fresh root password.
2. Reboot into rescue. Mount the disk, add a new key to `/root/.ssh/authorized_keys`.
3. Disable rescue, reboot. SSH in with the new key.
4. Add the corresponding pub key to GitHub for future workflow runs (update `DEPLOY_SSH_KEY`).

### 12.5 GitHub Actions can't reach the VPS

Most likely the SSH key on GitHub doesn't match the VPS. Generate a new
keypair on the VPS:

```bash
ssh zawadi@5.78.123.45 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/zawadi-deploy && \
  cat ~/.ssh/zawadi-deploy.pub >> ~/.ssh/authorized_keys && \
  cat ~/.ssh/zawadi-deploy'
```

Copy the private key from the output, replace `DEPLOY_SSH_KEY` secret in
GitHub.

---

## 13. Monitoring + alerting

Out of the box the stack is observable but unalerted. Hook up at least one
of:

### 13.1 Cheapest: UptimeRobot

1. <https://uptimerobot.com/signup> — free 50 monitors, 5-min interval.
2. Add monitor: `https://api.zawadi.app/health`, expect string `ok`.
3. Add monitor: `https://zawadi.app/`, expect HTTP 200.
4. Notification: email or a Telegram bot.

### 13.2 Better: BetterStack (Better Uptime + Logtail)

1. <https://betterstack.com> — free 10 monitors + 1 GB logs/mo.
2. Add the two HTTP monitors.
3. Optional: install the Vector agent on the VPS to ship JSON logs to
   Logtail for search + alerting.

### 13.3 Sentry for app errors

If you set `SENTRY_DSN` in `.env`, every uncaught backend error and every
React error-boundary on mobile/web reports automatically. Set up an alert
rule: **frequency > 5 events / hour → notify**.

---

## 14. Security checklist before you go public

- [ ] Strong, unique `BETTER_AUTH_SECRET` (32 bytes from `openssl rand -base64 32`).
- [ ] Strong, unique `POSTGRES_PASSWORD`.
- [ ] `STORAGE_PROVIDER=s3` with bucket-scoped R2 token (read+write, no delete-bucket).
- [ ] DNS A records have `Proxy = DNS only` (NOT Cloudflare-proxied) so Better Auth's CSRF works.
- [ ] `ufw` shows only 22, 80, 443 open.
- [ ] `/etc/ssh/sshd_config` has `PermitRootLogin prohibit-password` + `PasswordAuthentication no`.
- [ ] You've signed in once + ran the `UPDATE "User" SET role='admin'` SQL.
- [ ] `BETTER_AUTH_SECRET` from your dev `.env` is **not** the same as prod.
- [ ] Pesapal credentials are PRODUCTION keys, not sandbox (when you flip).
- [ ] You've revoked the personal access token used for the first push (if any).
- [ ] You've enabled GitHub repo "Secret scanning push protection" (auto for public repos).
- [ ] You've added a billing alert on Hetzner so a runaway resource can't surprise you.
- [ ] You've set up at least one uptime monitor (§13).
- [ ] You've tested a backup restore on a throwaway VPS within the first week.

---

## 15. Mobile app submission (out of scope but linked)

The same backend serves the iOS + Android apps. To ship them:

1. Buy an Apple Developer account ($99/yr) and a Google Play Console account
   ($25 one-time).
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
4. For over-the-air JS updates between store releases:
   ```bash
   bunx eas-cli update --branch production --message "Bug fixes"
   ```

EAS handles the build + signing + store metadata.

---

## 16. Estimated monthly cost

| Item | Monthly | Notes |
|---|---|---|
| Hetzner CX22 + backups | ~€5.50 | scales to thousands of users |
| Cloudflare R2 (10 GB stored, 1 M ops) | $0 | free tier covers MVP |
| Cloudflare Registrar (.app) | $1.10 | $13/yr ÷ 12 |
| Resend (3k emails/mo) | $0 | free up to 100/day |
| Pesapal | $0 | per-transaction fee only (1.5–3%) |
| Sentry (hobby) | $0 | 5k events/mo free |
| UptimeRobot | $0 | free 50 monitors |
| **Total** | **~$6.60/mo** | adequate for 5–10k MAU |

When you outgrow CX22 (sustained CPU > 70% or RAM > 75%):
- Vertical: rescale to CX32 (~€11/mo, 4 vCPU / 8 GB).
- Then split: managed Postgres + a second backend container behind a Caddy
  load-balance directive.

---

## Appendix A — Files this guide references

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | The stack: Caddy + backend + Postgres + web + nightly backup |
| `Caddyfile` | TLS + reverse-proxy config for both hosts |
| `backend/Dockerfile` | Backend runtime image (multi-stage Bun) |
| `mobile/Dockerfile.web` | Web app build → static Caddy server image |
| `scripts/vps-bootstrap.sh` | Fresh-VPS bring-up (Docker, ufw, deploy user, sshd hardening) |
| `scripts/deploy.sh` | Idempotent pull + restart + health-poll |
| `.github/workflows/deploy.yml` | Build images, push to GHCR, SSH + redeploy |
| `backend/.env.example` | Every supported env var with sensible defaults |

## Appendix B — Quick reference commands

```bash
# SSH as the deploy user
ssh zawadi@<VPS_IP>

# Tail backend logs
docker compose -f /opt/zawadi/docker-compose.prod.yml logs -f backend

# Restart just the backend
docker compose -f /opt/zawadi/docker-compose.prod.yml restart backend

# Open a Prisma Studio tunnel (from your laptop)
ssh -L 5555:localhost:5555 zawadi@<VPS_IP> \
  'docker compose -f /opt/zawadi/docker-compose.prod.yml exec backend bunx prisma studio --hostname 0.0.0.0'
# Then visit http://localhost:5555

# Manual backup (on demand)
docker compose -f /opt/zawadi/docker-compose.prod.yml exec db \
  pg_dump -U zawadi zawadi | gzip > /opt/zawadi/backups/manual-$(date +%s).sql.gz

# Force-bump to a specific image tag
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<sha-or-tag>/" /opt/zawadi/.env
/opt/zawadi/scripts/deploy.sh

# Verify the running image
docker compose -f /opt/zawadi/docker-compose.prod.yml images backend
```
