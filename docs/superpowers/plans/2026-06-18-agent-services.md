# jenil.ai Agent Services — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert static jenil.ai into a Next.js app on Vercel exposing an MCP server where agents pay USDC (x402, Base mainnet) for `know_about_jenil` (free), `request_repost` ($1), and `request_intro` ($5).

**Architecture:** Next.js App Router. `/api/mcp` is a JSON-RPC 2.0 server; paid tools gate on x402 (CDP facilitator, verify+settle) and emit a flat 402. Repost runs an LLM safety screen then retweets via X API v2. Intro stores to Neon + emails via Resend. Thin route handlers, logic in `src/lib/*`.

**Tech Stack:** Next.js (App Router, Node runtime), TypeScript, Drizzle + `@neondatabase/serverless`, `jose` (CDP JWT), `viem`, `zod`, `@anthropic-ai/sdk`, `resend`, Vitest.

## Global Constraints

- Base mainnet: network `eip155:8453`; USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals); facilitator `https://api.cdp.coinbase.com/platform/v2/x402`; x402 **v2** everywhere; `extra.name = "USD Coin"`.
- `payTo = process.env.X402_PAYEE_WALLET`; never hardcoded; 503 if unset.
- Paid tool with no `X-Payment` ⇒ **flat HTTP 402** body (no JSON-RPC envelope).
- A payment is verify **and** settle **and** DB log; `tx_hash` UNIQUE (replay protection).
- Screening LLM-driven, conservative bias, no hardcoded blocklists. Runs only after settle.
- Server-side enforcement only; payer identity from settled x402 payload, never tool args.
- Secrets in env only, never logged/echoed. Tweet URL host allow-list (`x.com`/`twitter.com`, https only).
- API routes: `export const runtime = 'nodejs'` (jose/crypto + Neon need Node).
- No `'use client'` on `/`, `/agents` (server components, ship in initial HTML).

## File Structure

```
jenil-ai/
  package.json  tsconfig.json  next.config.mjs  drizzle.config.ts  .env.example  vitest.config.ts
  public/  llms.txt  font.ttf  font-title.ttf  favicon.jpg
  src/app/  layout.tsx  globals.css  page.tsx  agents/page.tsx  admin/page.tsx
            api/mcp/route.ts  api/admin/login/route.ts
  src/lib/  config.ts  db.ts  schema.ts  validation.ts  x402.ts  screening.ts
            twitter.ts  jenil.ts  email.ts  rateLimit.ts  mcp.ts
  src/lib/__tests__/  validation.test.ts  x402.test.ts  screening.test.ts  mcp.test.ts
  drizzle/  (generated migrations)
```

---

### Task 1: Scaffold Next.js app + ported landing

**Files:** Create `package.json`, `tsconfig.json`, `next.config.mjs`, `.gitignore` (extend), `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`; move `font.ttf`/`font-title.ttf`/`favicon.jpg` → `public/`.

**Produces:** running Next app; `/` renders the jenil.ai page (same fonts, monochrome dark-mode theme, Lucide icons, pulsing dot, metric rows from `metrics.json`) + a "Work with Jenil AI (for agents)" section linking `/agents`.

- [ ] Scaffold deps, tsconfig (paths `@/*`), next config; `npm install`.
- [ ] `globals.css`: `@font-face` (Custom/CustomTitle from `/font.ttf`,`/font-title.ttf`), `:root` + `prefers-color-scheme: dark` vars, base element styles ported from `index.html`.
- [ ] `layout.tsx`: metadata (title/description/og), body wrapper.
- [ ] `page.tsx`: server component port of `index.html` content + agents section. Lucide via `lucide-react`.
- [ ] `npm run build` succeeds; visually matches.
- [ ] Commit.

### Task 2: Config + DB schema + Neon client

**Files:** Create `src/lib/config.ts`, `src/lib/schema.ts`, `src/lib/db.ts`, `drizzle.config.ts`.

**Produces:**
- `config.ts`: typed env access (`getPayeeWallet()`, `getNetwork()`, `getFacilitatorUrl()`, prices `REPOST_PRICE_USDC=1`, `INTRO_PRICE_USDC=5`, `requireApproval()`), USDC const, throws on missing required at use site.
- `schema.ts`: drizzle tables `repost_requests`, `intro_requests`, `mcp_events` (per spec §8), `tx_hash` UNIQUE on the two request tables.
- `db.ts`: `getDb()` → drizzle(neon(DATABASE_URL)).

- [ ] Write schema + config + db.
- [ ] `drizzle.config.ts`; `npx drizzle-kit generate` produces migration SQL.
- [ ] `npm run typecheck` clean. Commit.

### Task 3: Tweet URL validation (TDD)

**Files:** Create `src/lib/validation.ts`, `src/lib/__tests__/validation.test.ts`.

**Interfaces — Produces:** `parseTweetRef(input: string): { tweetId: string } | { error: string }` — accepts `https://x.com/<user>/status/<id>` and `twitter.com`, bare numeric id; rejects other hosts/schemes.

- [ ] Test: valid x.com URL → id; valid twitter.com → id; bare id → id; `javascript:`/`http`/other host → error.
- [ ] Run → fail. Implement. Run → pass. Commit.

### Task 4: x402 core (TDD on pure parts)

**Files:** Create `src/lib/x402.ts`, `src/lib/__tests__/x402.test.ts`.

**Interfaces — Produces:**
- `buildChallenge({ resource, description, amountUsdc, payTo }): X402Challenge` (v2 shape, both amounts, `extra.name:"USD Coin"`).
- `usdcToAtomic(n): string`.
- `signCdpJwt(method, host, path): Promise<string>` (EdDSA, claims per x402.md).
- `verifyPayment(opts): Promise<{valid:true,txHash?:string}|{valid:false,error}>`, `settlePayment(opts)` — POST `{x402Version:2,paymentPayload,paymentRequirements}` to `/verify`,`/settle`.

- [ ] Test (pure, no network): `usdcToAtomic(1)==="1000000"`; `buildChallenge` emits `x402Version:2`, `network:"eip155:8453"`, `maxAmountRequired===amount`, `extra.name==="USD Coin"`, `asset` = Base USDC.
- [ ] Test: `buildEd25519Pkcs8Pem` rejects wrong seed length; JWT decodes to claims `iss:"cdp"`, `aud:["cdp_service"]`, `uri:"POST host/path"`.
- [ ] Run → fail. Implement (manual JWT per x402.md; fetch verify/settle). Run → pass. Commit.

### Task 5: Content screening (TDD, mocked)

**Files:** Create `src/lib/screening.ts`, `src/lib/__tests__/screening.test.ts`.

**Interfaces — Produces:** `screenTweet(text: string): Promise<{ decision:'pass'|'fail'; reason:string; confidence:number; model:string }>`. Uses Anthropic; conservative — on parse failure or low confidence ⇒ `fail`.

- [ ] Test (mock the model call): clearly-benign JSON → pass; scam JSON → fail; malformed model output → fail (conservative); missing API key → fail with clear reason.
- [ ] Run → fail. Implement (Anthropic SDK, JSON rubric prompt, robust parse). Run → pass. Commit.

### Task 6: Twitter client + Jenil knowledge + email + rate limit

**Files:** Create `src/lib/twitter.ts`, `src/lib/jenil.ts`, `src/lib/email.ts`, `src/lib/rateLimit.ts`.

**Produces:**
- `twitter.ts`: `lookupTweetText(id): Promise<string>`; `retweet(id): Promise<{repostId:string}>` (X API v2, OAuth2 user token, write).
- `jenil.ts`: `JENIL_KNOWLEDGE` object (bio, building, links, how-to-work, tools+prices) → `know_about_jenil` payload.
- `email.ts`: `notifyIntro(submission): Promise<void>` (Resend; swallow+log errors).
- `rateLimit.ts`: `withRateLimit(ip, perMinute=60)` per agent-only-app pattern.

- [ ] Implement; typecheck. Commit.

### Task 7: MCP dispatcher + tools (TDD on dispatch)

**Files:** Create `src/lib/mcp.ts`, `src/app/api/mcp/route.ts`, `src/lib/__tests__/mcp.test.ts`.

**Interfaces — Consumes:** all of `src/lib/*`. **Produces:** `tools/list` (3 tools, prices in descriptions), `tools/call` dispatch, flat-402 helper, `OPTIONS` CORS.

Tool flow:
- `know_about_jenil`: rate-limit → return `JENIL_KNOWLEDGE`.
- `request_repost`: require `X-Payment` (else flat 402 with `$1` challenge) → verify → settle → log payment → `parseTweetRef` → `lookupTweetText` → `screenTweet` → pass ⇒ `retweet` + store reposted=true + return link+tx; fail ⇒ store reposted=false + return reason ("payment non-refundable").
- `request_intro`: require `X-Payment` (else flat 402 with `$5` challenge) → verify → settle → insert `intro_requests` → `notifyIntro` → return confirmation + disclaimer.

- [ ] Test: `tools/list` returns 3 tools with price text; unknown tool → -32601; paid tool no payment → 402 flat body (`accepts[0].maxAmountRequired==="1000000"`).
- [ ] Run → fail. Implement route + dispatcher. Run → pass. Commit.

### Task 8: Discovery — `/llms.txt` + `/agents`

**Files:** Create `public/llms.txt`, `src/app/agents/page.tsx`.

**Produces:** `llms.txt` per mcp.md §2.1 (endpoints, tools free/paid, curl, gotchas). `/agents` server component per §2.2 (quick start, tool reference w/ `tools/call` examples, x402 flow, pricing, terms, errors). No placeholders. Styled in theme.

- [ ] Write both; `npm run build` clean. Commit.

### Task 9: Admin dashboard + auth

**Files:** Create `src/app/api/admin/login/route.ts`, `src/app/admin/page.tsx`.

**Produces:** POST login checks `ADMIN_PASSWORD` → httpOnly cookie; `/admin` server component reads cookie, lists both tables, marks intro status (server action). Repost approve action only when `REPOST_REQUIRE_APPROVAL`.

- [ ] Implement; typecheck/build clean. Commit.

### Task 10: Verify + review

- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass.
- [ ] `.env.example` complete; README updated (Vercel deploy, env, MCP usage).
- [ ] `codex review` on the diff (CLAUDE.md); address P0/P1.
- [ ] Report to user. (No push until user verifies.)

## Self-Review

- **Spec coverage:** routes (T1,8,9), x402 (T4,7), screening (T5,7), twitter (T6,7), tools (T7), data model (T2), admin/email (T6,9), security (T3,4,7 + global constraints), tests (T3,4,5,7,10). All spec sections mapped.
- **Placeholders:** none — each task names files, interfaces, and concrete test assertions.
- **Type consistency:** `parseTweetRef`→`{tweetId}` used by T7; `screenTweet`→`{decision,reason,confidence,model}` stored in `repost_requests` (T2 columns match); `verifyPayment`/`settlePayment` return `{valid,...}` consumed in T7.
