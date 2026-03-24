# ZAWADI - Africa's Premier Marketplace

A full-stack mobile app for buying and selling properties, land, cars, and mining sites across all 54 African countries.

## App Overview

**ZAWADI** (Swahili for "treasure/gift") is a premium marketplace connecting buyers and sellers across Africa with four main categories:
- 🏠 **Property** - Houses, apartments, villas, commercial spaces
- 🗺️ **Land** - Plots, farms, agricultural land, estates
- 🚗 **Cars** - Vehicles of all types and conditions
- ⛏️ **Mining Sites** - Gold, diamond, copper, and mineral extraction sites

## Tech Stack

### Mobile (`mobile/`)
- Expo SDK 53 + React Native 0.79
- Expo Router for file-based navigation
- React Query for server state management
- NativeWind (Tailwind CSS) for styling
- React Native Reanimated for animations
- Custom auth client (direct API calls to Better Auth endpoints)

### Backend (`backend/`)
- Hono framework on Bun runtime
- Prisma ORM with SQLite database
- Better Auth with Email OTP authentication
- RESTful API with typed responses

## Architecture

### Authentication Flow
1. User enters email on sign-in screen
2. OTP sent via Vibecode SMTP service
3. User verifies 6-digit code
4. Session stored securely via cookie management
5. Stack.Protected guards route access

### App Structure
```
mobile/src/app/
├── _layout.tsx          - Root layout with auth guards (Stack.Protected)
├── sign-in.tsx          - Email input screen (public)
├── verify-otp.tsx       - OTP verification screen (public)
├── listing/[id].tsx     - Listing detail screen (protected)
└── (app)/
    ├── _layout.tsx      - Tab navigator
    ├── index.tsx        - Home: browse by category + featured
    ├── search.tsx       - Search with filters (category, country)
    ├── post.tsx         - Create new listing (2-step form)
    ├── saved.tsx        - Saved/favorited listings
    └── profile.tsx      - User profile + my listings
```

### Backend Routes
- `POST /api/auth/email-otp/send-verification-otp` - Send OTP
- `POST /api/auth/sign-in/email-otp` - Sign in
- `POST /api/auth/sign-out` - Sign out
- `GET /api/auth/get-session` - Get session
- `GET /api/listings` - Browse listings (with filters)
- `GET /api/listings/featured` - Featured listings
- `GET /api/listings/:id` - Single listing
- `POST /api/listings` - Create listing
- `PUT /api/listings/:id` - Update listing
- `DELETE /api/listings/:id` - Delete listing
- `GET /api/favorites` - User's saved listings
- `POST /api/favorites/:listingId` - Toggle favorite
- `GET /api/me` - User profile
- `PUT /api/me` - Update profile
- `GET /api/me/my/listings` - Current user's listings

## Design System
- Background: `#0A0A0F` (deep black)
- Primary accent: `#D4A843` (gold)
- Secondary: `#E8890C` (amber)
- Property: `#D4A843` (gold)
- Land: `#1A6B4A` (emerald green)
- Cars: `#E8890C` (amber)
- Mining: `#C17B50` (terracotta)

## Database Schema
- **User** - Auth users with profile data
- **Session/Account/Verification** - Better Auth tables
- **Listing** - All marketplace listings with category-specific fields
- **ListingImage** - Multiple images per listing
- **Favorite** - User saved listings

## Countries Supported
All 54 African countries including Nigeria, South Africa, Kenya, Ghana, Egypt, Morocco, Tanzania, and more.

## Currencies Supported
USD, EUR, GBP, ZAR (South African Rand), NGN (Nigerian Naira), KES (Kenyan Shilling), GHS (Ghanaian Cedi), EGP (Egyptian Pound), MAD (Moroccan Dirham), TZS (Tanzanian Shilling)
