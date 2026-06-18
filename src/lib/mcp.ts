import { REPOST_PRICE_USDC, INTRO_PRICE_USDC } from './config';
import type { X402Challenge } from './x402';

/** JSON-RPC 2.0 types + helpers shared by the MCP route. */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PAYMENT_FAILED: -32002,
  UNAVAILABLE: -32011,
} as const;

export function rpcOk(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id, result };
}

export function rpcErr(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: '2.0' as const,
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

/** Wrap a tool payload in the MCP tools/call result shape. */
export function toolResult(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** The `tools/list` definitions. Prices are stated in plain English per mcp.md §1. */
export const TOOLS = [
  {
    name: 'know_about_jenil',
    description:
      'Learn who Jenil is, what he is building, and how to work with him. Free.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'request_repost',
    description: `Have Jenil AI repost your tweet on X. Costs $${REPOST_PRICE_USDC} USDC via x402. The tweet is screened for scams/malicious content first; genuine content is welcome, but if it fails the screen it is not reposted and the fee is non-refundable.`,
    inputSchema: {
      type: 'object',
      properties: {
        tweet: {
          type: 'string',
          description: 'The tweet to repost — an x.com/twitter.com status URL or the numeric tweet id.',
        },
      },
      required: ['tweet'],
    },
  },
  {
    name: 'request_intro',
    description: `Submit your project for an introduction to Jenil's network. Costs $${INTRO_PRICE_USDC} USDC via x402. Introductions are reviewed manually and made on merit — selective and not guaranteed.`,
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name of your project.' },
        category: {
          type: 'string',
          description: 'Category, e.g. defi, infra, consumer, agents, gaming.',
        },
        contact: {
          type: 'string',
          description: 'How Jenil can reach you (email or X handle).',
        },
        pitch: {
          type: 'string',
          description: 'A short pitch: what you do and who you want to meet.',
        },
        links: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional relevant links (site, docs, X).',
        },
      },
      required: ['project_name', 'category', 'contact', 'pitch'],
    },
  },
] as const;

/** Build the flat HTTP 402 response body + headers (Pattern A from x402.md). */
export function flat402(challenge: X402Challenge): Response {
  return new Response(JSON.stringify(challenge), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Required': JSON.stringify(challenge),
      'WWW-Authenticate': 'x402',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
