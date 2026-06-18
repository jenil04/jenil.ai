import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  usdcToAtomic,
  buildChallenge,
  buildAccept,
  buildEd25519Pkcs8Pem,
  signCdpJwt,
} from '@/lib/x402';
import { USDC_BASE_ADDRESS } from '@/lib/config';

describe('usdcToAtomic', () => {
  it('converts whole dollars (6 decimals)', () => {
    expect(usdcToAtomic(1)).toBe('1000000');
    expect(usdcToAtomic(5)).toBe('5000000');
  });
  it('converts sub-dollar amounts', () => {
    expect(usdcToAtomic(0.1)).toBe('100000');
  });
});

describe('buildAccept / buildChallenge', () => {
  const accept = buildAccept({
    resource: 'https://jenil.ai/api/mcp#request_repost',
    description: 'Repost via Jenil AI',
    amountUsdc: 1,
    payTo: '0x7c0460aAf5D6DdA08ACD3e9161ee2BAC75a87090',
  });

  it('emits the x402 v2 shape', () => {
    const c = buildChallenge({
      resource: 'r',
      description: 'd',
      amountUsdc: 1,
      payTo: '0xabc',
    });
    expect(c.x402Version).toBe(2);
    expect(c.accepts).toHaveLength(1);
  });

  it('uses Base mainnet network by default', () => {
    expect(accept.network).toBe('eip155:8453');
  });

  it('sets maxAmountRequired === amount', () => {
    expect(accept.maxAmountRequired).toBe('1000000');
    expect(accept.amount).toBe('1000000');
  });

  it('uses the Base USDC asset address', () => {
    expect(accept.asset).toBe(USDC_BASE_ADDRESS);
  });

  it('uses the EIP-712 domain name "USD Coin", not "USDC"', () => {
    expect(accept.extra.name).toBe('USD Coin');
    expect(accept.extra.assetTransferMethod).toBe('eip3009');
  });

  it('passes payTo through verbatim', () => {
    expect(accept.payTo).toBe('0x7c0460aAf5D6DdA08ACD3e9161ee2BAC75a87090');
  });
});

describe('buildEd25519Pkcs8Pem', () => {
  it('wraps a 32-byte seed into a PKCS8 PEM', () => {
    const seed = randomBytes(32).toString('base64');
    const pem = buildEd25519Pkcs8Pem(seed);
    expect(pem.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
    expect(pem.trimEnd().endsWith('-----END PRIVATE KEY-----')).toBe(true);
  });
  it('accepts a 64-byte expanded key (takes first 32 bytes)', () => {
    const expanded = randomBytes(64).toString('base64');
    expect(() => buildEd25519Pkcs8Pem(expanded)).not.toThrow();
  });
  it('rejects a wrong-length secret', () => {
    const bad = randomBytes(20).toString('base64');
    expect(() => buildEd25519Pkcs8Pem(bad)).toThrow(/expected 32 or 64/);
  });
});

describe('signCdpJwt', () => {
  beforeAll(() => {
    process.env.CDP_API_KEY_ID = '11111111-2222-3333-4444-555555555555';
    process.env.CDP_API_KEY_SECRET = randomBytes(32).toString('base64');
  });

  it('produces a JWT whose claims match the CDP spec', async () => {
    const jwt = await signCdpJwt('POST', 'api.cdp.coinbase.com', '/platform/v2/x402/verify');
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    );
    expect(payload.iss).toBe('cdp');
    expect(payload.aud).toEqual(['cdp_service']);
    expect(payload.sub).toBe('11111111-2222-3333-4444-555555555555');
    expect(payload.uri).toBe('POST api.cdp.coinbase.com/platform/v2/x402/verify');
  });
});
