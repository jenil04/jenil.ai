import { eq } from 'drizzle-orm';
import {
  X402_VERSION,
  REPOST_PRICE_USDC,
  INTRO_PRICE_USDC,
  getPayeeWallet,
  getDatabaseUrl,
  repostRequiresApproval,
} from '@/lib/config';
import {
  buildAccept,
  verifyPayment,
  settlePayment,
  extractPayerWallet,
  type X402Accept,
} from '@/lib/x402';
import { parseTweetRef } from '@/lib/validation';
import { screenTweet } from '@/lib/screening';
import { lookupTweetText, retweet } from '@/lib/twitter';
import { JENIL_KNOWLEDGE } from '@/lib/jenil';
import { notifyIntro } from '@/lib/email';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { getDb } from '@/lib/db';
import { repostRequests, introRequests, mcpEvents } from '@/lib/schema';
import {
  RPC,
  TOOLS,
  rpcOk,
  rpcErr,
  toolResult,
  flat402,
  jsonResponse,
  type JsonRpcRequest,
} from '@/lib/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── helpers ───────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    (typeof (err as { code?: string }).code === 'string' &&
      (err as { code?: string }).code === '23505')
  );
}

async function logEvent(e: {
  tool: string;
  ip?: string;
  payerWallet?: string | null;
  outcome: string;
  detail?: string;
  httpStatus?: number;
}): Promise<void> {
  try {
    await getDb().insert(mcpEvents).values({
      tool: e.tool,
      ip: e.ip ?? null,
      payerWallet: e.payerWallet ?? null,
      outcome: e.outcome,
      detail: e.detail ?? null,
      httpStatus: e.httpStatus ?? null,
    });
  } catch {
    /* best-effort audit log; never fail a request on logging */
  }
}

/** Ensure payments + storage are configured before we ever issue a 402. */
function paymentsReady(): { ok: true; payee: string } | { ok: false; reason: string } {
  try {
    getDatabaseUrl();
    const payee = getPayeeWallet();
    return { ok: true, payee };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unavailable' };
  }
}

function challenge(accept: X402Accept) {
  return { x402Version: X402_VERSION, accepts: [accept] };
}

function asString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

// ── tool: know_about_jenil (free) ─────────────────────────────────────────────

async function handleKnow(id: JsonRpcRequest['id'], ip: string): Promise<Response> {
  const rl = checkRateLimit(ip, 60);
  if (!rl.ok) {
    return jsonResponse(
      rpcErr(id, RPC.UNAVAILABLE, `Rate limited. Retry in ${rl.retryAfterSec}s.`),
      429,
    );
  }
  await logEvent({ tool: 'know_about_jenil', ip, outcome: 'ok', httpStatus: 200 });
  return jsonResponse(rpcOk(id, toolResult(JENIL_KNOWLEDGE)));
}

// ── tool: request_repost ($1) ──────────────────────────────────────────────────

async function handleRepost(
  req: Request,
  id: JsonRpcRequest['id'],
  args: Record<string, unknown>,
  ip: string,
): Promise<Response> {
  const rl = checkRateLimit(`repost:${ip}`, 20);
  if (!rl.ok) {
    return jsonResponse(rpcErr(id, RPC.UNAVAILABLE, `Rate limited. Retry in ${rl.retryAfterSec}s.`), 429);
  }
  const tweetInput = asString(args.tweet, 500);
  if (!tweetInput) {
    return jsonResponse(rpcErr(id, RPC.INVALID_PARAMS, 'Missing required "tweet" argument.'), 400);
  }
  const ref = parseTweetRef(tweetInput);
  if ('error' in ref) {
    return jsonResponse(rpcErr(id, RPC.INVALID_PARAMS, ref.error), 400);
  }

  const ready = paymentsReady();
  if (!ready.ok) {
    return jsonResponse(rpcErr(id, RPC.UNAVAILABLE, 'Payments are not configured.'), 503);
  }

  const resource = new URL(req.url).toString();
  const accept = buildAccept({
    resource,
    description: `Jenil AI reposts your tweet (screened). $${REPOST_PRICE_USDC} USDC.`,
    amountUsdc: REPOST_PRICE_USDC,
    payTo: ready.payee,
  });

  const paymentHeader = req.headers.get('x-payment');
  if (!paymentHeader) {
    await logEvent({ tool: 'request_repost', ip, outcome: 'payment_required', httpStatus: 402 });
    return flat402(challenge(accept));
  }

  const verify = await verifyPayment({ paymentHeader, accept });
  if (!verify.valid) {
    await logEvent({ tool: 'request_repost', ip, outcome: 'payment_failed', detail: verify.error, httpStatus: 402 });
    return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, `Payment verification failed: ${verify.error}`), 402);
  }
  const settle = await settlePayment({ paymentHeader, accept });
  if (!settle.valid) {
    await logEvent({ tool: 'request_repost', ip, outcome: 'payment_failed', detail: settle.error, httpStatus: 402 });
    return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, `Settlement failed: ${settle.error}`), 402);
  }
  const txHash = settle.txHash;
  const payerWallet = extractPayerWallet(paymentHeader);
  const db = getDb();

  // Store a canonical URL (the input may be a bare numeric id).
  const canonicalUrl = /^https?:\/\//i.test(tweetInput)
    ? tweetInput
    : `https://x.com/i/status/${ref.tweetId}`;

  // Claim the payment (replay guard via UNIQUE tx_hash) before doing any work.
  try {
    await db.insert(repostRequests).values({
      payerWallet,
      tweetUrl: canonicalUrl,
      tweetId: ref.tweetId,
      txHash,
      amountUsdc: REPOST_PRICE_USDC,
      status: 'processing',
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, 'This payment has already been used.'), 409);
    }
    await logEvent({ tool: 'request_repost', ip, payerWallet, outcome: 'error', detail: 'db insert failed', httpStatus: 500 });
    return jsonResponse(rpcErr(id, RPC.INTERNAL_ERROR, 'Could not record the payment.'), 500);
  }

  // Fetch the tweet text for screening.
  let tweetText: string;
  try {
    tweetText = await lookupTweetText(ref.tweetId);
  } catch {
    await db.update(repostRequests)
      .set({ screenDecision: 'fail', screenReason: 'Tweet could not be fetched (deleted/invalid/private).', status: 'tweet_unavailable' })
      .where(eq(repostRequests.txHash, txHash));
    await logEvent({ tool: 'request_repost', ip, payerWallet, outcome: 'tweet_unavailable', httpStatus: 200 });
    return jsonResponse(rpcOk(id, toolResult({
      reposted: false,
      error: 'The tweet could not be fetched. Per terms, the fee is non-refundable.',
      txHash,
    })));
  }

  // Screen.
  const screen = await screenTweet(tweetText);
  await db.update(repostRequests)
    .set({
      tweetTextSnapshot: tweetText,
      screenDecision: screen.decision,
      screenReason: screen.reason,
      screenConfidence: screen.confidence,
      screenModel: screen.model,
    })
    .where(eq(repostRequests.txHash, txHash));

  if (screen.decision === 'fail') {
    await db.update(repostRequests).set({ status: 'rejected' }).where(eq(repostRequests.txHash, txHash));
    await logEvent({ tool: 'request_repost', ip, payerWallet, outcome: 'screen_failed', detail: screen.reason, httpStatus: 200 });
    return jsonResponse(rpcOk(id, toolResult({
      reposted: false,
      screened: 'fail',
      reason: screen.reason,
      txHash,
      note: 'Per the terms, the fee is non-refundable for content that fails screening.',
    })));
  }

  // Passed — fully automated (or queued if the safety valve is on).
  if (repostRequiresApproval()) {
    await db.update(repostRequests).set({ status: 'pending_approval' }).where(eq(repostRequests.txHash, txHash));
    await logEvent({ tool: 'request_repost', ip, payerWallet, outcome: 'pending_approval', httpStatus: 200 });
    return jsonResponse(rpcOk(id, toolResult({
      reposted: false,
      status: 'pending_approval',
      message: 'Passed screening and queued for Jenil to approve.',
      txHash,
    })));
  }

  try {
    const { repostId } = await retweet(ref.tweetId);
    await db.update(repostRequests)
      .set({ reposted: true, repostTweetId: repostId, status: 'auto' })
      .where(eq(repostRequests.txHash, txHash));
    await logEvent({ tool: 'request_repost', ip, payerWallet, outcome: 'ok', httpStatus: 200 });
    return jsonResponse(rpcOk(id, toolResult({
      reposted: true,
      tweetId: ref.tweetId,
      repostId,
      txHash,
      message: 'Reposted by Jenil AI.',
    })));
  } catch (err) {
    // Log the raw error server-side only — never leak X API internals to the client.
    console.error('[request_repost] retweet failed:', err);
    await db.update(repostRequests).set({ status: 'repost_failed' }).where(eq(repostRequests.txHash, txHash));
    await logEvent({
      tool: 'request_repost',
      ip,
      payerWallet,
      outcome: 'error',
      detail: `repost failed: ${err instanceof Error ? err.message : 'unknown'}`,
      httpStatus: 200,
    });
    return jsonResponse(rpcOk(id, toolResult({
      reposted: false,
      error: 'Payment settled and content passed screening, but the repost could not be completed. Jenil has a record and will follow up.',
      txHash,
    })));
  }
}

// ── tool: request_intro ($5) ───────────────────────────────────────────────────

async function handleIntro(
  req: Request,
  id: JsonRpcRequest['id'],
  args: Record<string, unknown>,
  ip: string,
): Promise<Response> {
  const rl = checkRateLimit(`intro:${ip}`, 20);
  if (!rl.ok) {
    return jsonResponse(rpcErr(id, RPC.UNAVAILABLE, `Rate limited. Retry in ${rl.retryAfterSec}s.`), 429);
  }
  const projectName = asString(args.project_name, 200);
  const category = asString(args.category, 100);
  const contact = asString(args.contact, 200);
  const pitch = asString(args.pitch, 5000);
  if (!projectName || !category || !contact || !pitch) {
    return jsonResponse(rpcErr(id, RPC.INVALID_PARAMS, 'project_name, category, contact and pitch are all required.'), 400);
  }
  // Only keep http(s) links — reject javascript:/data:/file: etc. (URL allow-list rule).
  const links = Array.isArray(args.links)
    ? args.links
        .filter((l): l is string => typeof l === 'string' && /^https?:\/\//i.test(l.trim()))
        .map((l) => l.trim())
        .slice(0, 10)
    : undefined;

  const ready = paymentsReady();
  if (!ready.ok) {
    return jsonResponse(rpcErr(id, RPC.UNAVAILABLE, 'Payments are not configured.'), 503);
  }

  const resource = new URL(req.url).toString();
  const accept = buildAccept({
    resource,
    description: `Submit your project to Jenil AI for a network introduction. $${INTRO_PRICE_USDC} USDC.`,
    amountUsdc: INTRO_PRICE_USDC,
    payTo: ready.payee,
  });

  const paymentHeader = req.headers.get('x-payment');
  if (!paymentHeader) {
    await logEvent({ tool: 'request_intro', ip, outcome: 'payment_required', httpStatus: 402 });
    return flat402(challenge(accept));
  }

  const verify = await verifyPayment({ paymentHeader, accept });
  if (!verify.valid) {
    await logEvent({ tool: 'request_intro', ip, outcome: 'payment_failed', detail: verify.error, httpStatus: 402 });
    return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, `Payment verification failed: ${verify.error}`), 402);
  }
  const settle = await settlePayment({ paymentHeader, accept });
  if (!settle.valid) {
    await logEvent({ tool: 'request_intro', ip, outcome: 'payment_failed', detail: settle.error, httpStatus: 402 });
    return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, `Settlement failed: ${settle.error}`), 402);
  }
  const txHash = settle.txHash;
  const payerWallet = extractPayerWallet(paymentHeader);
  const db = getDb();

  try {
    await db.insert(introRequests).values({
      payerWallet,
      projectName,
      category,
      contact,
      pitch,
      links,
      txHash,
      amountUsdc: INTRO_PRICE_USDC,
      status: 'pending',
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonResponse(rpcErr(id, RPC.PAYMENT_FAILED, 'This payment has already been used.'), 409);
    }
    await logEvent({ tool: 'request_intro', ip, payerWallet, outcome: 'error', detail: 'db insert failed', httpStatus: 500 });
    return jsonResponse(rpcErr(id, RPC.INTERNAL_ERROR, 'Could not record the submission.'), 500);
  }

  await notifyIntro({ projectName, category, contact, pitch, links, payerWallet, txHash });
  await logEvent({ tool: 'request_intro', ip, payerWallet, outcome: 'ok', httpStatus: 200 });

  return jsonResponse(rpcOk(id, toolResult({
    received: true,
    status: 'pending',
    disclaimer: 'Introductions are selective and made on merit. We cannot introduce everyone, and this submission is not a guarantee.',
    txHash,
  })));
}

// ── POST dispatcher ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonResponse(rpcErr(null, RPC.PARSE_ERROR, 'Invalid JSON'), 400);
  }

  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return jsonResponse(rpcErr(body?.id ?? null, RPC.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request'), 400);
  }

  const { id, method, params } = body;
  const ip = clientIp(req.headers);

  if (method === 'initialize') {
    return jsonResponse(rpcOk(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'Jenil AI MCP Server', version: '1.0.0' },
    }));
  }

  if (method === 'tools/list') {
    return jsonResponse(rpcOk(id, { tools: TOOLS }));
  }

  if (method === 'tools/call') {
    const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const name = p.name;
    const args = p.arguments ?? {};
    switch (name) {
      case 'know_about_jenil':
        return handleKnow(id, ip);
      case 'request_repost':
        return handleRepost(req, id, args, ip);
      case 'request_intro':
        return handleIntro(req, id, args, ip);
      default:
        return jsonResponse(rpcErr(id, RPC.METHOD_NOT_FOUND, `Unknown tool: ${name}`), 404);
    }
  }

  return jsonResponse(rpcErr(id, RPC.METHOD_NOT_FOUND, `Method not found: ${method}`), 404);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Payment',
    },
  });
}
