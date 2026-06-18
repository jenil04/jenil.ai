import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from '@/app/api/mcp/route';

function mcpReq(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

beforeAll(() => {
  // Present-but-unreachable so paymentsReady() passes and the audit log fails fast & silently.
  process.env.X402_PAYEE_WALLET = '0x7c0460aAf5D6DdA08ACD3e9161ee2BAC75a87090';
  process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/db';
});

describe('MCP route', () => {
  it('tools/list returns the three tools with price text', async () => {
    const res = await POST(mcpReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(['know_about_jenil', 'request_repost', 'request_intro']);
    const repost = body.result.tools.find((t: { name: string }) => t.name === 'request_repost');
    expect(repost.description).toContain('$1 USDC');
    const intro = body.result.tools.find((t: { name: string }) => t.name === 'request_intro');
    expect(intro.description).toContain('$5 USDC');
  });

  it('unknown tool → method not found', async () => {
    const res = await POST(
      mcpReq({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope' } }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it('request_repost without payment → flat 402 with a $1 challenge', async () => {
    const res = await POST(
      mcpReq({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'request_repost',
          arguments: { tweet: 'https://x.com/jenilt/status/1788889999000111222' },
        },
      }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBe(2);
    expect(body.accepts[0].maxAmountRequired).toBe('1000000');
    expect(body.accepts[0].amount).toBe('1000000');
    expect(body.accepts[0].extra.name).toBe('USD Coin');
    expect(body.accepts[0].payTo).toBe('0x7c0460aAf5D6DdA08ACD3e9161ee2BAC75a87090');
  });

  it('request_intro without payment → flat 402 with a $5 challenge', async () => {
    const res = await POST(
      mcpReq({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'request_intro',
          arguments: {
            project_name: 'Acme',
            category: 'defi',
            contact: 'me@acme.xyz',
            pitch: 'We build x.',
          },
        },
      }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.accepts[0].maxAmountRequired).toBe('5000000');
  });

  it('request_repost with an invalid tweet → invalid params, no charge', async () => {
    const res = await POST(
      mcpReq({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'request_repost', arguments: { tweet: 'https://evil.com/x/status/1' } },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it('request_intro missing required fields → invalid params', async () => {
    const res = await POST(
      mcpReq({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'request_intro', arguments: { project_name: 'Acme' } },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });
});
