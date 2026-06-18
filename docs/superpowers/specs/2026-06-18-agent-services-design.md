# jenil.ai — Agent Services (MCP + x402) — Design Spec

**Status:** APPROVED (design) — awaiting spec review before plan
**Owner:** earnkit
**Created:** 2026-06-18
**Repo / working copy:** `/Users/earnkit/Desktop/minidev-mobile/jenil-ai` (branch `feat/agent-services`)
**Upstream:** `github.com/jenil04/jenil.ai`

## 1. Goal & user story

jenil.ai is today a static `index.html` + two TTF fonts describing **Jenil AI**, an
autonomous AI agent transacting on Base, co-founder alongside Jenil Thakker. We convert
it into a small **Next.js App Router app on Vercel** that keeps the exact look and adds an
**agent-callable surface**: an MCP server where AI agents pay USDC (x402, Base mainnet) to
get Jenil AI to act for them.

> **As an AI agent**, I discover jenil.ai, read `/llms.txt`, and call its `/api/mcp` server.
> I can learn who Jenil is for free. I can pay **$1 USDC** to have Jenil AI repost my tweet
> (only if it passes an automated content-safety screen — payment is non-refundable if it
> fails). I can pay **$5 USDC** to submit my project for a network introduction (fulfilled
> manually on merit, not guaranteed).

The human landing page stays intact (same fonts/theme). We add agent docs and tool endpoints.

## 2. Decisions (locked)

- **Build target:** convert jenil.ai → Next.js App Router, deploy on **Vercel** (was static on GitHub Pages).
- **Chain/payments:** **Base mainnet**, USDC, x402 **v2** via the **CDP facilitator**, per the repo's verified `minidev-backend/src/prompts/protocols/x402.md`.
- **Repost fulfillment:** **fully automated** — pay → screen → pass ⇒ repost immediately; fail ⇒ no repost, **no refund**.
- **Repost type:** **native retweet ("repost")** — not quote-tweet.
- **X posting:** **direct X API v2** from this app (OAuth2 user tokens, write scope).
- **Network intro:** store in Neon + **email Jenil** (Resend) + **admin dashboard**.
- **Screening:** **LLM-driven** (Anthropic Claude), conservative bias, no hardcoded blocklists/regex.
- **DB:** **Neon Postgres** via `@neondatabase/serverless` + Drizzle (matches Crystals convention; NOT Supabase as in the alpha reference app).

## 3. Surfaces (routes)

- `/` — ported jenil.ai page. **Server component**, no `'use client'`. Same `Custom` (body) /
  `CustomTitle` (headings) TTF fonts, monochrome palette with dark-mode via
  `prefers-color-scheme`, 600px column, Lucide icons, pulsing green status dot, metric rows.
  Adds one on-brand section: **"Work with Jenil AI (for agents)"** linking to `/agents`.
  Metrics sourced from the existing `metrics.json` content.
- `/agents` — full human+agent docs page (**server component**) per `mcp.md` §2.2: quick start,
  tool reference with concrete `tools/call` examples, x402 payment flow, pricing, **terms**
  (non-refundable screening; intros merit-based/not guaranteed), errors & gotchas. No placeholder.
- `/llms.txt` — machine-readable discovery index (served from `public/llms.txt`) per `mcp.md` §2.1.
- `POST /api/mcp` — JSON-RPC 2.0 MCP server. `tools/list` + `tools/call`. Discovery anonymous;
  payment enforced at call time. CORS `OPTIONS` for MCP clients.
- `/admin` — minimal password-gated dashboard listing repost + intro submissions.

## 4. MCP tools

| Tool | Price | Auth | Behavior |
|---|---|---|---|
| `know_about_jenil` | Free (per-IP rate-limited) | open | Returns curated, prefed knowledge: who Jenil is, what he's building (tokens.fun), how to work with him, links, and the paid tools available. |
| `request_repost` | **$1 USDC** (x402) | x402 payment | Input: tweet URL or ID. Payment settles first → LLM screens the tweet → **pass** ⇒ retweet via X API, return repost link + tx hash → **fail** ⇒ no repost, **no refund**, return screening reason. |
| `request_intro` | **$5 USDC** (x402) | x402 payment | Input: `project_name`, `category`, `contact`, `pitch`, optional `links`. Payment settles → stored in Neon → emails Jenil + appears in `/admin`. Returns confirmation + disclaimer (merit-based, not guaranteed). |

`tools/list` descriptions state price in plain English (e.g. "Costs $1 USDC via x402") per `mcp.md` §1.

## 5. x402 payment flow (verified pattern — from `x402.md`)

- **Network:** `eip155:8453` (Base mainnet). **USDC:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals).
- **Facilitator:** CDP-managed `https://api.cdp.coinbase.com/platform/v2/x402`, EdDSA/Ed25519 JWT per request
  (`CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`). Manual JWT construction (version-drift-proof) as in `x402.md`.
- **Wire shape v2:** `x402Version: 2` on challenge, payload, AND the verify/settle POST body.
  `extra.name = "USD Coin"` (EIP-712 domain literal). Both `maxAmountRequired` and `amount` set and equal.
  `resource = new URL(request.url).toString()`. CAIP-2 network strings only.
- **`payTo` = `process.env.X402_PAYEE_WALLET`** (Jenil's wallet). Never hardcoded. 503 if unset.
- **No `X-Payment` header on a paid tool ⇒ flat HTTP 402 body** (NOT wrapped in a JSON-RPC envelope) so
  off-the-shelf x402 clients parse it (Pattern A in `x402.md` — improvement over the alpha app's enveloped 402).
- A payment is **verify + settle + DB log**. Verify alone does not move USDC.
- `tx_hash` column **UNIQUE** (replay protection). Money settles on-chain **before** screening — this is what
  makes "scammy ⇒ no refund" sound and enforceable.

## 6. Screening (reputation gate) — LLM-driven, no hardcoded lists

- Fetch the tweet text via X API tweet-lookup, send to **Claude** (Anthropic API) with a rubric:
  phishing/malware, scam/rug token shilling, impersonation, hate/illegal content, deceptive financial claims.
- Returns `{ decision: 'pass'|'fail', reason: string, confidence: number }`.
- **Conservative bias:** ambiguous or low-confidence ⇒ **fail** (protects the account).
- Per the `no-hardcoded-heuristics` preference: semantic LLM judgment, not regex blocklists.
- Every decision (tweet snapshot, model id, reason, confidence) logged to Neon for audit.
- **Safety valve:** `REPOST_REQUIRE_APPROVAL` env flag (default `false` = fully automated, the locked choice).
  Set `true` later ⇒ passed reposts queue for one-tap approval in `/admin` instead of auto-posting. No code change.
- Screening only runs **after** successful settle. If the tweet can't be fetched (deleted/invalid/private),
  the request fails with a clear reason; payment is non-refundable per terms.

## 7. X API integration

- **X API v2**, OAuth2 user-context tokens with write scope, for the configured posting account.
- `request_repost`: resolve tweet ID from URL → call the retweet endpoint (native repost).
- A post failure after a paid + passed screen is logged and surfaced in the tool response; payment already
  settled (terms cover this). No silent success.
- Tokens live in env; never logged or echoed.

## 8. Data model (Neon Postgres, Drizzle)

- **`repost_requests`** — `id`, `payer_wallet`, `tweet_url`, `tweet_id`, `tweet_text_snapshot`,
  `screen_decision`, `screen_reason`, `screen_confidence`, `screen_model`, `reposted` (bool),
  `repost_tweet_id`, `tx_hash` **UNIQUE**, `amount_usdc`, `created_at`.
- **`intro_requests`** — `id`, `payer_wallet`, `project_name`, `category`, `contact`, `pitch`,
  `links`, `status` (`pending`|`contacted`|`declined`), `tx_hash` **UNIQUE**, `amount_usdc`, `created_at`.
- **`mcp_events`** — audit log: `id`, `tool`, `ip`, `payer_wallet`, `outcome`, `detail`, `created_at`.

## 9. Admin & email

- `/admin` gated by `ADMIN_PASSWORD` (env) → httpOnly cookie session. Tables of both request types;
  ability to mark `intro_requests.status`. A repost **approve** action is shown only when
  `REPOST_REQUIRE_APPROVAL=true` (§6); in the default automated mode the repost table is read-only. Styled in the jenil.ai theme.
- New `request_intro` → email Jenil via **Resend** (`RESEND_API_KEY`, `JENIL_NOTIFY_EMAIL`) with the
  submission details. Email send failure does not fail the paid call (logged; submission still stored).

## 10. Project layout (Next.js App Router)

```
jenil-ai/
  src/app/
    page.tsx                 ← ported landing (server component) + "for agents" section
    agents/page.tsx          ← full MCP/x402 docs (server component)
    admin/page.tsx           ← password-gated dashboard
    api/mcp/route.ts         ← JSON-RPC MCP server (tools/list, tools/call, OPTIONS)
    api/admin/login/route.ts ← admin auth
    layout.tsx, globals.css  ← fonts (@font-face), monochrome theme, dark-mode
  src/lib/
    x402.ts                  ← challenge build, CDP JWT, verify + settle
    screening.ts             ← Claude content-safety screen
    twitter.ts               ← X API v2 retweet + tweet lookup
    jenil.ts                 ← prefed bio/knowledge (know_about_jenil source)
    db.ts + schema.ts        ← Neon + Drizzle
    email.ts                 ← Resend notify
    rateLimit.ts             ← in-memory per-IP limiter for the free tool
  public/
    llms.txt, font.ttf, font-title.ttf, favicon.jpg
  drizzle/                   ← migrations
```

Keep MCP tool handlers thin; business logic in `src/lib/*` so handlers stay small and testable.

## 11. Security (financial-product rules)

- **Server-side enforcement only:** payment verify/settle, amount, payTo, screening decision — all server-side.
- **Never trust the client:** payer identity comes from the settled x402 payload, not tool args. No
  client-supplied wallet/amount honored.
- **Clean tool descriptions:** no model-directed instructions in tool/param descriptions (MCP injection vector).
- **No secret leakage:** keys in env only; never logged or echoed. `tx_hash` UNIQUE = replay protection.
- **URL validation:** tweet URLs validated to `https://(x|twitter).com/...` host allow-list; reject other schemes.

## 12. Env vars (set by owner in `.env.local` + Vercel; never pasted into chat)

`DATABASE_URL`, `X402_PAYEE_WALLET`, `X402_NETWORK=eip155:8453`,
`X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402`, `CDP_API_KEY_ID`,
`CDP_API_KEY_SECRET`, `ANTHROPIC_API_KEY`, `X_API_*` (OAuth2 tokens), `RESEND_API_KEY`,
`JENIL_NOTIFY_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`.

## 13. Testing & verification

- `npm run typecheck` + lint clean; Vitest unit tests for `x402.ts` (challenge shape, JWT claims),
  `screening.ts` (pass/fail/conservative), URL validation, and the MCP dispatcher.
- `tools/list` validates via MCP Inspector.
- Manual: Base **Sepolia** end-to-end with the open facilitator first (free), then a small real-money
  mainnet round trip ($1 repost) before launch.
- Confirm `/llms.txt` + `/agents` are real (no placeholder) per `mcp.md` §3.
- **Post-completion `codex review`** of the diff before reporting done (per CLAUDE.md).

## 14. Out of scope (v1)

Bearer-token API keys (x402 is the gate), quote-tweets, Farcaster reposts, on-chain refunds,
multi-account posting, Upstash/Redis rate-limit backend (in-memory v1).

## 15. Open items for owner

- Provide secrets above via env (not chat). A Neon connection string contains a password — set it in
  `.env.local`/Vercel directly.
- Confirm the X account to post from and that it has API v2 write access (Basic tier+).
- Confirm Jenil's receiving wallet for `X402_PAYEE_WALLET` and notify email.
