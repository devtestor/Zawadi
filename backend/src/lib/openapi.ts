// Hand-written OpenAPI 3.1 description. Keep this in sync with new routes.
// We chose static JSON over auto-generation to avoid pulling extra deps.

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "ZAWADI API",
    description: "African marketplace API — listings, chat, reviews, boost payments, admin moderation.",
    version: "1.0.0",
  },
  servers: [
    { url: "http://localhost:3000", description: "Dev" },
    { url: "https://api.zawadi.app", description: "Production (configure your domain)" },
  ],
  tags: [
    { name: "auth" }, { name: "listings" }, { name: "favorites" },
    { name: "users" }, { name: "messages" }, { name: "reviews" },
    { name: "reports" }, { name: "admin" }, { name: "boost" },
    { name: "saved-searches" }, { name: "push-tokens" }, { name: "upload" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { message: { type: "string" } } } },
      },
      Listing: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          currency: { type: "string" },
          category: { type: "string", enum: ["property", "land", "car", "mining", "machinery"] },
          status: { type: "string", enum: ["active", "sold", "pending"] },
          country: { type: "string" },
          city: { type: ["string", "null"] },
          viewCount: { type: "integer" },
          boosted: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { summary: "Health check", responses: { "200": { description: "ok" } } },
    },
    "/api/listings": {
      get: {
        tags: ["listings"],
        summary: "Browse listings (cursor-paginated)",
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "number" } },
          { name: "maxPrice", in: "query", schema: { type: "number" } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
        ],
        responses: { "200": { description: "Listings page" } },
      },
      post: {
        tags: ["listings"],
        summary: "Create a listing",
        security: [{ cookieAuth: [] }],
        responses: { "201": { description: "Created" }, "401": { description: "Unauthorized" }, "429": { description: "Rate-limited" } },
      },
    },
    "/api/listings/featured": { get: { tags: ["listings"], summary: "Boosted listings" } },
    "/api/listings/{id}": {
      get: { tags: ["listings"], summary: "Single listing", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
      put: { tags: ["listings"], summary: "Update (owner only)", security: [{ cookieAuth: [] }] },
      delete: { tags: ["listings"], summary: "Soft delete (owner)", security: [{ cookieAuth: [] }] },
    },
    "/api/listings/{id}/view": { post: { tags: ["listings"], summary: "Bump view counter" } },

    "/api/favorites": { get: { tags: ["favorites"], security: [{ cookieAuth: [] }] } },
    "/api/favorites/{listingId}": { post: { tags: ["favorites"], summary: "Toggle favorite", security: [{ cookieAuth: [] }] } },

    "/api/me": {
      get: { tags: ["users"], summary: "Current user profile", security: [{ cookieAuth: [] }] },
      put: { tags: ["users"], summary: "Update profile", security: [{ cookieAuth: [] }] },
    },
    "/api/me/my/listings": { get: { tags: ["users"], summary: "My listings", security: [{ cookieAuth: [] }] } },
    "/api/me/phone/start": { post: { tags: ["users"], summary: "Send phone verification SMS", security: [{ cookieAuth: [] }] } },
    "/api/me/phone/verify": { post: { tags: ["users"], summary: "Confirm phone code", security: [{ cookieAuth: [] }] } },
    "/api/me/notifications": { put: { tags: ["users"], summary: "Update notification prefs", security: [{ cookieAuth: [] }] } },

    "/api/messages": { get: { tags: ["messages"], summary: "Conversation list", security: [{ cookieAuth: [] }] } },
    "/api/messages/start": { post: { tags: ["messages"], summary: "Find or create conversation", security: [{ cookieAuth: [] }] } },
    "/api/messages/{id}": {
      get: { tags: ["messages"], summary: "Thread", security: [{ cookieAuth: [] }] },
      post: { tags: ["messages"], summary: "Send a message", security: [{ cookieAuth: [] }] },
    },
    "/api/messages/{id}/read": { post: { tags: ["messages"], summary: "Mark thread read", security: [{ cookieAuth: [] }] } },

    "/api/reviews/user/{userId}": {
      get: { tags: ["reviews"], summary: "Reviews for a user" },
      post: { tags: ["reviews"], summary: "Leave / update a review", security: [{ cookieAuth: [] }] },
    },
    "/api/reviews/{id}": { delete: { tags: ["reviews"], security: [{ cookieAuth: [] }] } },

    "/api/reports": { post: { tags: ["reports"], summary: "File a report", security: [{ cookieAuth: [] }] } },

    "/api/saved-searches": {
      get: { tags: ["saved-searches"], security: [{ cookieAuth: [] }] },
      post: { tags: ["saved-searches"], security: [{ cookieAuth: [] }] },
    },
    "/api/saved-searches/{id}": { delete: { tags: ["saved-searches"], security: [{ cookieAuth: [] }] } },

    "/api/push-tokens": { post: { tags: ["push-tokens"], security: [{ cookieAuth: [] }] } },
    "/api/push-tokens/{token}": { delete: { tags: ["push-tokens"], security: [{ cookieAuth: [] }] } },

    "/api/boost/{listingId}": { post: { tags: ["boost"], summary: "Start Pesapal checkout", security: [{ cookieAuth: [] }] } },
    "/api/boost/return": { get: { tags: ["boost"] } },
    "/api/boost/ipn": { get: { tags: ["boost"], summary: "Pesapal IPN" } },

    "/api/admin/reports": { get: { tags: ["admin"], security: [{ cookieAuth: [] }] } },
    "/api/admin/reports/{id}/resolve": { post: { tags: ["admin"], security: [{ cookieAuth: [] }] } },
    "/api/admin/users/{id}/ban": { post: { tags: ["admin"], security: [{ cookieAuth: [] }] } },
    "/api/admin/users/{id}/unban": { post: { tags: ["admin"], security: [{ cookieAuth: [] }] } },
    "/api/admin/listings/{id}": { delete: { tags: ["admin"], security: [{ cookieAuth: [] }] } },

    "/api/upload": { post: { tags: ["upload"], summary: "Image upload (multipart)", security: [{ cookieAuth: [] }] } },

    "/api/chain": { get: { tags: ["chain"], summary: "On-chain integration status (factory address + explorer)" } },

    "/api/wallet": { get: { tags: ["wallet"], security: [{ cookieAuth: [] }] } },
    "/api/wallet/topup": { post: { tags: ["wallet"], security: [{ cookieAuth: [] }] } },

    "/api/kyc": {
      get: { tags: ["kyc"], security: [{ cookieAuth: [] }] },
      post: { tags: ["kyc"], summary: "Submit KYC documents", security: [{ cookieAuth: [] }] },
    },

    "/api/trades": {
      get: { tags: ["trades"], security: [{ cookieAuth: [] }] },
      post: { tags: ["trades"], summary: "Start a trade on a listing", security: [{ cookieAuth: [] }] },
    },
    "/api/trades/{id}": { get: { tags: ["trades"], security: [{ cookieAuth: [] }] } },
    "/api/trades/{id}/action": {
      post: {
        tags: ["trades"],
        summary: "State machine: fund / deliver / confirm / cancel / refund / dispute",
        security: [{ cookieAuth: [] }],
      },
    },

    "/api/contracts": { post: { tags: ["contracts"], summary: "Draft a contract attached to a trade", security: [{ cookieAuth: [] }] } },
    "/api/contracts/{id}": { get: { tags: ["contracts"], security: [{ cookieAuth: [] }] } },
    "/api/contracts/{id}/sign": { post: { tags: ["contracts"], summary: "Sign as buyer or seller (chain-anchored if enabled)", security: [{ cookieAuth: [] }] } },

    "/api/bids/listing/{listingId}": {
      get: { tags: ["bids"], summary: "List bids" },
      post: { tags: ["bids"], summary: "Place a bid", security: [{ cookieAuth: [] }] },
    },
    "/api/bids/listing/{listingId}/auction": {
      post: { tags: ["bids"], summary: "Owner configures the auction", security: [{ cookieAuth: [] }] },
    },
    "/api/bids/{id}/withdraw": { post: { tags: ["bids"], security: [{ cookieAuth: [] }] } },
  },
} as const;
