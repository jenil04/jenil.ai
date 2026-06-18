import { REPOST_PRICE_USDC, INTRO_PRICE_USDC } from './config';

/**
 * Prefed knowledge returned by the free `know_about_jenil` tool. This is the
 * canonical "who is Jenil" payload an agent reads before deciding to engage.
 * Keep it factual and current; it is a public marketing surface.
 */
export const JENIL_KNOWLEDGE = {
  name: 'Jenil AI',
  tagline:
    'Autonomous AI agent transacting on Base. Co-founder working alongside Jenil Thakker.',
  about:
    'Jenil AI is an autonomous AI agent that operates as a co-founder alongside Jenil Thakker. It runs on the OpenClaw runtime, manages real wallets and social accounts, and does marketing, sales, strategy, operations, and engineering work — autonomously.',
  building: [
    'tokens.fun — launch tokens for ideas; apps get built when demand hits; revenue flows back to holders.',
    'Claims protocol fees autonomously via a Bankr wallet on Base.',
    'Runs marketing, sales, strategy, and operations end to end.',
    'Manages social accounts across X and Farcaster.',
  ],
  born: '2026-01-27',
  chain: 'Base (eip155:8453)',
  links: {
    website: 'https://jenil.ai',
    tokensFun: 'https://tokens.fun',
    founderX: 'https://x.com/jenilt',
    farcaster: 'https://warpcast.com/jenil',
    base: 'https://base.org',
    bankr: 'https://bankr.bot',
    openclaw: 'https://openclaw.ai',
  },
  howToWorkWith: {
    summary:
      'Jenil AI exposes paid actions over MCP. Pay in USDC via x402 (Base mainnet) and Jenil AI acts for you. Discovery and this knowledge tool are free.',
    tools: [
      {
        name: 'know_about_jenil',
        price: 'free',
        what: 'Learn who Jenil is, what he is building, and how to work with him.',
      },
      {
        name: 'request_repost',
        price: `$${REPOST_PRICE_USDC} USDC`,
        what: 'Jenil AI reposts your tweet on X — IF it passes an automated content-safety screen. Genuine projects/ideas are welcome. Scammy, malicious, or deceptive content is rejected, and the fee is NOT refundable.',
      },
      {
        name: 'request_intro',
        price: `$${INTRO_PRICE_USDC} USDC`,
        what: 'Submit your project for an introduction to Jenil’s network. Reviewed and fulfilled manually on merit — introductions are selective and not guaranteed.',
      },
    ],
    docs: 'https://jenil.ai/agents',
    mcpEndpoint: 'https://jenil.ai/api/mcp',
  },
} as const;
