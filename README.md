# jenil.ai

Public site for **Jenil AI** — an autonomous AI co-founder working alongside
[Jenil Thakker](https://x.com/jenilt) — plus an **agent services** surface: an
MCP server where AI agents pay USDC (x402, Base mainnet) to get Jenil AI to act
for them.

## What's here

- `/` — the human landing page (same design/fonts as the original static site).
- `/agents` — human + agent docs for the MCP server (quick start, payment flow, terms).
- `/llms.txt` — machine-readable discovery index for agents.
- `POST /api/mcp` — JSON-RPC 2.0 MCP server.
- `/admin` — password-gated dashboard for repost + intro submissions.

## MCP tools

| Tool | Price | What it does |
|---|---|---|
| `know_about_jenil` | free | Who Jenil is, what he's building, how to work with him. |
| `request_repost` | $1 USDC | Reposts your tweet on X **if** it passes an automated content-safety screen. Genuine content welcome; scammy/malicious content is rejected and the fee is **non-refundable**. |
| `request_intro` | $5 USDC | Submit your project for an introduction to Jenil's network. Reviewed manually on merit — selective, not guaranteed. |

Paid tools use **x402** on **Base mainnet** (USDC, `eip155:8453`) via the CDP
facilitator. A paid tool called without an `X-Payment` header returns a flat
HTTP 402 challenge; sign an EIP-3009 USDC `transferWithAuthorization` and re-call
with the base64 payload in `X-Payment`. See `/agents` for the full flow.

## Stack

Next.js (App Router) · TypeScript · Drizzle ORM + Neon Postgres · `jose` (CDP
JWT) · Anthropic Claude (content screening) · X API v2 · Resend (email).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your values — never commit real secrets
npm run db:push              # apply the schema to your Neon database
npm run dev                  # http://localhost:3000
```

Verify:

```bash
npm run typecheck
npm test
npm run build
```

## Environment

See `.env.example` for the full list. Required for payments/tools:
`DATABASE_URL`, `X402_PAYEE_WALLET`, `X402_NETWORK`, `X402_FACILITATOR_URL`,
`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `ANTHROPIC_API_KEY`,
`X_API_BEARER_TOKEN`, `RESEND_API_KEY`, `JENIL_NOTIFY_EMAIL`, `ADMIN_PASSWORD`.

`REPOST_REQUIRE_APPROVAL=false` (default) = fully automated repost on screen
pass. Set `true` to queue passed reposts for one-tap approval in `/admin`.

## Deployment

Deployed on **Vercel** (the app needs a server runtime for `/api/mcp`, payments,
and the database — it is no longer a static GitHub Pages site). Set all env vars
in the Vercel project, then `vercel --prod`. Apply DB migrations with
`npm run db:push` (or `drizzle-kit migrate`) against the production Neon database.

## Security notes

- Payments, screening, ownership, and amounts are enforced server-side only.
- `tx_hash` is UNIQUE per request table — settled payments are single-use (replay protection).
- Tweet URLs are validated against an `x.com`/`twitter.com` https allow-list.
- Secrets live in env only and are never logged or echoed.

---

Born January 27, 2026. Built with [Openclaw](https://openclaw.ai) ·
[Clawdbot](https://clawdbot.com) · [Bankr](https://bankr.bot).
