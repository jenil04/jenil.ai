import type { Metadata } from 'next';
import Link from 'next/link';
import {
  REPOST_PRICE_USDC,
  INTRO_PRICE_USDC,
  USDC_BASE_ADDRESS,
} from '@/lib/config';

export const metadata: Metadata = {
  title: 'Jenil AI — Agent docs (MCP + x402)',
  description:
    'How AI agents call Jenil AI over MCP and pay in USDC via x402 on Base mainnet.',
};

function Code({ children }: { children: string }) {
  return <pre>{children}</pre>;
}

export default function AgentDocsPage() {
  return (
    <div className="container">
      <h1>
        Jenil AI — Agent docs
        <span className="status-dot" aria-hidden />
      </h1>

      <section>
        <p>
          Jenil AI exposes paid actions over the{' '}
          <a href="https://modelcontextprotocol.io">Model Context Protocol</a>. AI
          agents call a JSON-RPC server and pay in USDC via{' '}
          <a href="https://x402.org">x402</a> on Base mainnet. Discovery and the{' '}
          <code>know_about_jenil</code> tool are free. <Link href="/">← back to jenil.ai</Link>
        </p>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Quick start</h2>
        <p>The MCP server speaks JSON-RPC 2.0 at:</p>
        <Code>POST https://jenil.ai/api/mcp</Code>
        <p>List the available tools:</p>
        <Code>{`curl -s https://jenil.ai/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
        <p>MCP client config (Claude Desktop / Cursor style):</p>
        <Code>{`{
  "mcpServers": {
    "jenil-ai": { "url": "https://jenil.ai/api/mcp" }
  }
}`}</Code>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Tools</h2>

        <div className="highlight-box">
          <h3>
            know_about_jenil <span className="tag tag-free">free</span>
          </h3>
          <p>Learn who Jenil is, what he is building, and how to work with him.</p>
          <Code>{`curl -s https://jenil.ai/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"know_about_jenil","arguments":{}}}'`}</Code>
        </div>

        <div className="highlight-box">
          <h3>
            request_repost <span className="tag tag-price">${REPOST_PRICE_USDC} USDC</span>
          </h3>
          <p>
            Jenil AI reposts (native retweet) your tweet on X — <strong>only if</strong>{' '}
            it passes an automated content-safety screen. Genuine projects and ideas
            are welcome. Scammy, malicious, or deceptive content is rejected and the
            fee is <strong>not refundable</strong>.
          </p>
          <Code>{`curl -s https://jenil.ai/api/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'X-Payment: <base64 x402 payload>' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"request_repost",
                 "arguments":{"tweet":"https://x.com/you/status/123..."}}}'`}</Code>
        </div>

        <div className="highlight-box">
          <h3>
            request_intro <span className="tag tag-price">${INTRO_PRICE_USDC} USDC</span>
          </h3>
          <p>
            Submit your project for an introduction to Jenil&apos;s network. Reviewed
            and fulfilled <strong>manually on merit</strong> — selective and{' '}
            <strong>not guaranteed</strong>.
          </p>
          <Code>{`curl -s https://jenil.ai/api/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'X-Payment: <base64 x402 payload>' \\
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call",
       "params":{"name":"request_intro",
                 "arguments":{
                   "project_name":"Acme",
                   "category":"defi",
                   "contact":"you@acme.xyz",
                   "pitch":"What you do and who you want to meet.",
                   "links":["https://acme.xyz"]}}}'`}</Code>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Payment flow (x402)</h2>
        <p>
          Call a paid tool with no <code>X-Payment</code> header and you get a flat
          HTTP <strong>402</strong> body (not a JSON-RPC envelope):
        </p>
        <Code>{`{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "${REPOST_PRICE_USDC}000000",
    "amount": "${REPOST_PRICE_USDC}000000",
    "asset": "${USDC_BASE_ADDRESS}",
    "payTo": "0x<jenil-wallet>",
    "resource": "https://jenil.ai/api/mcp",
    "extra": { "name": "USD Coin", "version": "2", "assetTransferMethod": "eip3009" }
  }]
}`}</Code>
        <p>To pay:</p>
        <ul>
          <li>Read <code>accepts[0]</code>.</li>
          <li>
            Sign an EIP-3009 USDC <code>transferWithAuthorization</code> over the
            amount to <code>payTo</code>. The EIP-712 domain name is{' '}
            <code>&quot;USD Coin&quot;</code> (NOT <code>&quot;USDC&quot;</code>).
          </li>
          <li>
            Base64-encode the x402 v2 payment payload and re-call the same tool with
            it in the <code>X-Payment</code> header.
          </li>
        </ul>
        <p>
          USDC on Base mainnet has 6 decimals — so ${REPOST_PRICE_USDC} ={' '}
          <code>{`${REPOST_PRICE_USDC}000000`}</code> base units. Asset:{' '}
          <code>{USDC_BASE_ADDRESS}</code>. Network: <code>eip155:8453</code>.
        </p>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Terms</h2>
        <ul>
          <li>
            <strong>Payment settles before screening.</strong> The repost fee is
            charged on-chain first; if your tweet fails the content-safety screen it
            is not reposted and the fee is non-refundable. Only submit genuine content.
          </li>
          <li>
            <strong>Introductions are selective.</strong> Paying the intro fee submits
            your project for review on merit. We cannot introduce everyone; payment is
            not a guarantee.
          </li>
          <li>
            Jenil AI maintains a reputation. We are happy to amplify real projects and
            will decline anything that looks like a scam, phishing, impersonation, or
            deceptive financial promotion.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Errors &amp; gotchas</h2>
        <ul>
          <li>
            <code>HTTP 402</code> with a flat <code>{`{x402Version, accepts}`}</code>{' '}
            body — payment required. Sign and retry with <code>X-Payment</code>.
          </li>
          <li>
            JSON-RPC error <code>-32002</code> — payment verification/settlement failed.
            Check the network (<code>eip155:8453</code>), asset, amount, and domain name.
          </li>
          <li>
            <code>HTTP 409</code> &quot;payment has already been used&quot; — each
            settled payment is single-use (replay protection). Make a fresh payment.
          </li>
          <li>
            JSON-RPC error <code>-32602</code> — invalid arguments (e.g. a tweet URL
            not on x.com/twitter.com, or missing intro fields). You are not charged.
          </li>
          <li>
            <code>HTTP 503</code> — payments temporarily unconfigured server-side. You
            are not charged.
          </li>
          <li>
            A <code>{`{"reposted": false, "screened": "fail"}`}</code> result means your
            tweet did not pass the screen; the fee is non-refundable.
          </li>
        </ul>
      </section>

      <footer>
        <p>
          <Link href="/">jenil.ai</Link> · <a href="/llms.txt">llms.txt</a> ·{' '}
          <a href="https://x.com/jenilt">X</a>
        </p>
      </footer>
    </div>
  );
}
