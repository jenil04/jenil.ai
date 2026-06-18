import { SignJWT, importPKCS8 } from 'jose';
import { randomBytes } from 'node:crypto';
import {
  USDC_BASE_ADDRESS,
  USDC_DECIMALS,
  USDC_DOMAIN_NAME,
  X402_VERSION,
  getNetwork,
  getFacilitatorUrl,
  isCdpFacilitator,
  type Caip2Network,
} from './config';

/**
 * x402 payment helpers — Base mainnet, x402 v2 wire shape, CDP facilitator.
 * Every constant and field here is fixed by the verified guide in
 * minidev-backend/src/prompts/protocols/x402.md. Do not "simplify" the shapes.
 */

export interface X402Extra {
  name: string;
  version: string;
  assetTransferMethod: 'eip3009';
}

export interface X402Accept {
  scheme: 'exact';
  network: Caip2Network;
  maxAmountRequired: string;
  amount: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: X402Extra;
}

export interface X402Challenge {
  x402Version: typeof X402_VERSION;
  accepts: X402Accept[];
}

export type X402Result =
  | { valid: true; txHash: string }
  | { valid: false; error: string };

/** USDC float → atomic units string (6 decimals). `1` → `"1000000"`. */
export function usdcToAtomic(usdc: number): string {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS)).toString();
}

/**
 * Build the single `accepts` entry. It is BOTH the body of the 402 challenge
 * and the `paymentRequirements` we send to the facilitator — the guide
 * requires they be the same entry.
 */
export function buildAccept(opts: {
  resource: string;
  description: string;
  amountUsdc: number;
  payTo: string;
  network?: Caip2Network;
}): X402Accept {
  const atomic = usdcToAtomic(opts.amountUsdc);
  return {
    scheme: 'exact',
    network: opts.network ?? getNetwork(),
    maxAmountRequired: atomic,
    amount: atomic, // MUST equal maxAmountRequired
    resource: opts.resource,
    description: opts.description,
    mimeType: 'application/json',
    payTo: opts.payTo,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_ADDRESS,
    extra: {
      name: USDC_DOMAIN_NAME, // "USD Coin" — EIP-712 domain literal, NOT "USDC"
      version: '2',
      assetTransferMethod: 'eip3009',
    },
  };
}

export function buildChallenge(opts: {
  resource: string;
  description: string;
  amountUsdc: number;
  payTo: string;
  network?: Caip2Network;
}): X402Challenge {
  return {
    x402Version: X402_VERSION,
    accepts: [buildAccept(opts)],
  };
}

// ── CDP facilitator auth (EdDSA / Ed25519 JWT) ────────────────────────────────

const PKCS8_PREFIX_HEX = '302e020100300506032b657004220420';

/** Ed25519 raw seed (base64) → PKCS8 PEM so jose can importPKCS8 it. */
export function buildEd25519Pkcs8Pem(secretBase64: string): string {
  const raw = Buffer.from(secretBase64, 'base64');
  // CDP exports sometimes embed a 64-byte expanded key — first 32 bytes are the seed.
  const seed = raw.length === 64 ? raw.subarray(0, 32) : raw;
  if (seed.length !== 32) {
    throw new Error(
      `CDP_API_KEY_SECRET decoded to ${raw.length} bytes; expected 32 or 64`,
    );
  }
  const pkcs8Der = Buffer.concat([Buffer.from(PKCS8_PREFIX_HEX, 'hex'), seed]);
  const wrapped = pkcs8Der.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

export async function signCdpJwt(
  method: string,
  host: string,
  path: string,
): Promise<string> {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) {
    throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET are required');
  }
  const key = await importPKCS8(buildEd25519Pkcs8Pem(apiKeySecret), 'EdDSA');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: apiKeyId,
    uri: `${method.toUpperCase()} ${host}${path}`,
  })
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: apiKeyId,
      typ: 'JWT',
      nonce: randomBytes(16).toString('hex'),
    })
    .setIssuer('cdp')
    .setAudience(['cdp_service'])
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

// ── Facilitator calls ─────────────────────────────────────────────────────────

async function facilitatorCall(
  endpoint: 'verify' | 'settle',
  paymentPayload: unknown,
  paymentRequirements: unknown,
): Promise<Record<string, unknown>> {
  const base = getFacilitatorUrl().replace(/\/+$/, ''); // tolerate a trailing slash in the env
  const parsed = new URL(`${base}/${endpoint}`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isCdpFacilitator()) {
    // The signed path MUST equal the path we POST to (no extra /facilitator/ segment).
    const jwt = await signCdpJwt('POST', parsed.host, parsed.pathname);
    headers.Authorization = `Bearer ${jwt}`;
  }
  const res = await fetch(parsed.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      x402Version: X402_VERSION, // required at request-body top level
      paymentPayload,
      paymentRequirements,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`CDP ${endpoint} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function decodePaymentHeader(paymentHeader: string): unknown {
  // X-Payment header is base64-encoded JSON.
  const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

function extractTxHash(result: Record<string, unknown>): string {
  return (
    (result.transaction as string | undefined) ??
    (result.txHash as string | undefined) ??
    `unsettled-${Date.now()}-${randomBytes(4).toString('hex')}`
  );
}

/** Verify the payment signature on-chain (no state change). */
export async function verifyPayment(opts: {
  paymentHeader: string;
  accept: X402Accept;
}): Promise<X402Result> {
  try {
    const paymentPayload = decodePaymentHeader(opts.paymentHeader);
    const result = await facilitatorCall('verify', paymentPayload, opts.accept);
    // The CDP/open facilitators signal validity with `isValid`. Don't accept an
    // undocumented `valid` field — an error envelope could carry it coincidentally.
    if (result.isValid === true) {
      return { valid: true, txHash: extractTxHash(result) };
    }
    return {
      valid: false,
      error:
        (result.invalidReason as string | undefined) ??
        (result.error as string | undefined) ??
        'Payment invalid',
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

/** Settle the payment — broadcasts the EIP-3009 transfer (USDC actually moves). */
export async function settlePayment(opts: {
  paymentHeader: string;
  accept: X402Accept;
}): Promise<X402Result> {
  try {
    const paymentPayload = decodePaymentHeader(opts.paymentHeader);
    const result = await facilitatorCall('settle', paymentPayload, opts.accept);
    const txHash = extractTxHash(result);
    // A real on-chain tx hash is the ONLY proof USDC moved. If the facilitator
    // returned none, `extractTxHash` produced an `unsettled-…` sentinel — never
    // treat that as a successful settlement (would record a fake tx_hash for a
    // payment that may not have settled).
    if (txHash.startsWith('unsettled-')) {
      return {
        valid: false,
        error:
          (result.error as string | undefined) ??
          'Settlement did not return an on-chain transaction hash.',
      };
    }
    return { valid: true, txHash };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Settlement failed',
    };
  }
}

/**
 * Try to read the payer wallet address out of the (already base64-decoded)
 * X-Payment payload, for logging/attribution. Best-effort — never throws.
 */
export function extractPayerWallet(paymentHeader: string): string | null {
  try {
    const p = decodePaymentHeader(paymentHeader) as {
      payload?: { authorization?: { from?: string } };
    };
    return p.payload?.authorization?.from ?? null;
  } catch {
    return null;
  }
}
