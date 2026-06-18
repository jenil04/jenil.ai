/**
 * Centralized, typed env access + protocol constants.
 *
 * Required secrets throw at their point of use (not at import) so the app can
 * still build and serve discovery routes (`/`, `/agents`, `/llms.txt`) even
 * when payment/twitter/db env is unset.
 */

// ── Protocol constants (Base mainnet, verified per x402.md) ──────────────────

/** Base mainnet USDC. 6 decimals. */
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALS = 6;
/** EIP-712 domain name literally baked into the Base USDC contract. NOT "USDC". */
export const USDC_DOMAIN_NAME = 'USD Coin';
export const X402_VERSION = 2 as const;

export const REPOST_PRICE_USDC = 1;
export const INTRO_PRICE_USDC = 5;

export type Caip2Network = 'eip155:8453' | 'eip155:84532';

// ── Env accessors ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/** CAIP-2 network. Defaults to Base mainnet. */
export function getNetwork(): Caip2Network {
  return process.env.X402_NETWORK === 'eip155:84532'
    ? 'eip155:84532'
    : 'eip155:8453';
}

/** Numeric chainId derived from the CAIP-2 network. */
export function getChainId(): number {
  return Number(getNetwork().replace(/^eip155:/, ''));
}

export function getFacilitatorUrl(): string {
  return (
    process.env.X402_FACILITATOR_URL ??
    'https://api.cdp.coinbase.com/platform/v2/x402'
  );
}

export function isCdpFacilitator(): boolean {
  return getFacilitatorUrl().includes('cdp.coinbase.com');
}

/** Wallet that receives USDC. Throws (caller maps to 503) if unset. */
export function getPayeeWallet(): string {
  return requireEnv('X402_PAYEE_WALLET');
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://jenil.ai';
}

export function getDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}

export function getAnthropicKey(): string {
  return requireEnv('ANTHROPIC_API_KEY');
}

export function getScreeningModel(): string {
  return process.env.SCREENING_MODEL ?? 'claude-sonnet-4-6';
}

export function getXApiBearerToken(): string {
  return requireEnv('X_API_BEARER_TOKEN');
}

export function getResendKey(): string {
  return requireEnv('RESEND_API_KEY');
}

export function getNotifyEmail(): string {
  return requireEnv('JENIL_NOTIFY_EMAIL');
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'agent@jenil.ai';
}

export function getAdminPassword(): string {
  return requireEnv('ADMIN_PASSWORD');
}

/** When true, passed reposts queue for manual approval instead of auto-posting. */
export function repostRequiresApproval(): boolean {
  return process.env.REPOST_REQUIRE_APPROVAL === 'true';
}
