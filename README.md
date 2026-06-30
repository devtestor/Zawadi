# Alcurry — Africa's Marketplace

Full-stack mobile marketplace for Property, Land, Cars, Mining Sites, and Machinery across 54 African countries.

## Stack

**Mobile** (`mobile/`)
- Expo SDK 53 + React Native 0.79, Expo Router
- React Query (server state) + Zustand (local)
- NativeWind / Tailwind 3, react-native-reanimated, FlashList
- Better Auth (email OTP) via custom client
- Expo Notifications for chat push

**Backend** (`backend/`)
- Bun + Hono + Zod-validated routes
- Prisma ORM, SQLite (dev) → Postgres (production)
- Better Auth with email OTP + rate limits + CSRF
- Pesapal integration for boost payments
- Expo Push API for chat notifications

## Features

- Listings (Property / Land / Car / Mining / Machinery) with multi-currency
- Sale & rent listings (with rental periods)
- Image upload (up to 5 per listing) with tap-to-zoom gallery + map of the listing location
- Cursor-paginated browse + search + country filter (with search-as-you-type)
- Favorites (server-authoritative)
- In-app chat between buyers and sellers, with Expo push notifications
- Seller profiles with ⭐ reviews (auto-verifies a seller at 3+ reviews avg ≥4)
- Listing reports + admin moderation endpoints (`/api/admin/*`, role-gated)
- Boost listings via Pesapal (Mobile Money + cards) — Basic / Standard / Premium tiers
- Edit / mark sold / reactivate / delete from listing detail (owners only)
- Share listing via system share sheet

## Project layout

```
backend/
├── prisma/
│   ├── schema.prisma              # dev (SQLite)
│   └── schema.postgresql.prisma   # production (Postgres) — used by Docker
├── src/
│   ├── auth.ts                    # Better Auth + email OTP + rate limits
│   ├── env.ts                     # Zod-validated env
│   ├── index.ts                   # Hono app, CORS, mounts routers
│   ├── lib/
│   │   ├── schemas.ts             # shared Zod schemas
│   │   ├── email.ts               # Resend transactional email
│   │   ├── storage.ts             # S3-compatible uploads (SigV4)
│   │   ├── sms.ts                 # Twilio / WhatsApp Cloud (optional)
│   │   ├── fx.ts                  # Live USD->local FX
│   │   ├── push.ts                # Expo push helper
│   │   ├── logger.ts              # Structured logger
│   │   └── sentry.ts              # Error capture shim
│   └── routes/
│       ├── listings.ts            # browse / detail / create / update / delete + cursor pagination
│       ├── favorites.ts
│       ├── users.ts               # GET/PUT /api/me + /:id/listings
│       ├── messages.ts            # conversations + messages + read state
│       ├── reviews.ts
│       ├── reports.ts             # user-facing report endpoint
│       ├── admin.ts               # /api/admin/* (role-gated)
│       ├── push-tokens.ts
│       └── boost.ts               # Pesapal checkout + IPN
├── Dockerfile
└── .dockerignore

mobile/src/
├── app/                            # Expo Router file-based routes
│   ├── _layout.tsx                 # Root layout, push setup, deep-link to chat
│   ├── (app)/                      # Tabbed area
│   │   ├── _layout.tsx             # Tabs: Home / Search / Post / Saved / Profile
│   │   ├── index.tsx               # Home: featured + paginated listings (FlashList)
│   │   ├── search.tsx              # Search with cursor pagination
│   │   ├── post.tsx                # Create listing (2-step wizard)
│   │   ├── saved.tsx
│   │   ├── profile.tsx
│   │   └── messages.tsx            # Conversation list (not a tab)
│   ├── chat/[id].tsx               # Chat thread
│   ├── listing/[id].tsx            # Listing detail (gallery, map, share, owner actions, report)
│   ├── listing/edit/[id].tsx       # Edit modal
│   ├── boost/[id].tsx              # Boost checkout
│   ├── seller/[id].tsx             # Seller profile + reviews
│   ├── sign-in.tsx
│   └── verify-otp.tsx
├── components/
│   ├── ListingCard.tsx
│   └── ListingSkeleton.tsx
└── lib/
    ├── api/api.ts
    ├── auth/{auth-client,use-session}.ts
    ├── push.ts
    ├── types.ts
    └── upload.ts

docker-compose.yml                  # Postgres + backend
.github/workflows/typecheck.yml     # Backend / mobile typecheck + Docker build
```

## Local development

```bash
# Backend
cd backend
cp .env.example .env                # then fill in BETTER_AUTH_SECRET + Pesapal keys
bun install
bunx prisma generate
bunx prisma db push                 # apply schema to SQLite dev.db
bun run dev                         # http://localhost:3000

# Mobile
cd mobile
cp .env.example .env                # set EXPO_PUBLIC_BACKEND_URL
bun install
bun run start                       # then 'i' for iOS / 'a' for Android
```

## Production deploy with Docker

```bash
# At the repo root
cp backend/.env.example .env        # set BETTER_AUTH_SECRET + Pesapal keys + BACKEND_URL
docker compose up -d --build
```

The compose file provisions a Postgres 16 database, runs Prisma migrations on
boot (or `prisma db push` if no migration history yet), and exposes the API
on port 3000. The backend image swaps in `schema.postgresql.prisma` during the
build so Prisma generates a Postgres-aware client.

To create a one-off admin user, after the stack is up:

```bash
docker compose exec db psql -U zawadi -d zawadi -c \
  "UPDATE \"User\" SET role = 'admin' WHERE email = 'you@example.com';"
```

## Required env (backend)

| Variable | Required | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `DATABASE_URL` | yes | sqlite file path (dev) or postgres URL |
| `DATABASE_PROVIDER` | recommended | `sqlite` (default) or `postgresql` |
| `BACKEND_URL` | yes | Public URL of the API (used in cookies + Pesapal callbacks) |
| `PESAPAL_CONSUMER_KEY` / `PESAPAL_CONSUMER_SECRET` | for boost | from Pesapal dashboard |
| `PESAPAL_BASE_URL` | for boost | `https://cybqa.pesapal.com/pesapalv3` (sandbox) or `https://pay.pesapal.com/v3` |
| `PESAPAL_CURRENCY` | for boost | RWF / KES / UGX / TZS / USD |
| `PESAPAL_IPN_ID` | optional | leave blank to auto-register at boot |

## API surface (high-level)

```
POST   /api/auth/email-otp/send-verification-otp   # rate-limited 3/min
POST   /api/auth/sign-in/email-otp                  # rate-limited 10/min
GET    /api/auth/get-session
POST   /api/auth/sign-out

GET    /api/listings?category&country&search&cursor&limit
GET    /api/listings/featured
GET    /api/listings/:id
POST   /api/listings
PUT    /api/listings/:id
DELETE /api/listings/:id

POST   /api/upload                                  # multipart file
GET    /api/me + PUT /api/me + GET /api/me/my/listings + GET /api/me/:id/listings

GET    /api/favorites + POST /api/favorites/:listingId

GET    /api/messages                                # threads list
POST   /api/messages/start                          # find/create conversation
GET    /api/messages/:id
POST   /api/messages/:id
POST   /api/messages/:id/read

GET    /api/reviews/user/:userId
POST   /api/reviews/user/:userId
DELETE /api/reviews/:id

POST   /api/reports                                 # file a report

POST   /api/push-tokens + DELETE /api/push-tokens/:token

POST   /api/boost/:listingId                        # start Pesapal checkout
GET    /api/boost/return  /  GET /api/boost/ipn

GET    /api/admin/reports                           # role: admin
POST   /api/admin/reports/:id/resolve
POST   /api/admin/users/:id/ban  /  /unban
DELETE /api/admin/listings/:id
```

## On-chain escrow audit trail

Alcurry can anchor every Trade transition to a public EVM chain (Polygon by
default, but the contract is chain-agnostic). When enabled, each agreement
gets created, signed, funded, delivered, completed, refunded, or cancelled
on chain in addition to the wallet ledger — giving you an immutable public
record that disputes and auditors can verify.

The contract is custodial-relayer style: users don't hold wallets or pay
gas. The backend signs on their behalf after verifying the action via the
authenticated API. Buyer/seller appear as pseudonymous addresses derived
from their user id.

**One-time setup**

1. Deploy `backend/contracts/src/ZawadiEscrowFactory.sol` to your chain.
   The full walkthrough (Foundry + Remix paths) is in
   `backend/contracts/README.md`.
2. Drop the deployed address into `backend/.env` as `CHAIN_ESCROW_FACTORY`,
   set `CHAIN_ENABLED=true`, and restart.
3. From the mobile app, every Trade and Contract signature gets a "View on
   chain" link to the explorer.

Disable any time with `CHAIN_ENABLED=false` — the off-chain wallet ledger
remains the source of truth.

## Notes

- The local SQLite db (`prisma/prisma/dev.db`) and all `.env*` files are gitignored. Never commit secrets.
- The mobile app uses cookies stored in `expo-secure-store` for session auth.
- Push notifications only work on physical devices, not simulators.
