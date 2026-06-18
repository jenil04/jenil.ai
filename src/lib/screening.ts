import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey, getScreeningModel } from './config';

/**
 * LLM-driven content safety screen for the $1 repost tool.
 *
 * This is the reputation gate. It is deliberately CONSERVATIVE: anything the
 * model is unsure about, or any error/parse failure, resolves to `fail` so we
 * never repost questionable content to the real account. No hardcoded
 * blocklists — the judgment is semantic (see feedback: no-hardcoded-heuristics).
 */

export interface ScreenResult {
  decision: 'pass' | 'fail';
  reason: string;
  confidence: number;
  model: string;
}

/** Below this, a `pass` is downgraded to `fail` (conservative bias). */
export const CONFIDENCE_THRESHOLD = 0.6;

const SYSTEM_PROMPT = `You are the content-safety gate for Jenil AI, an autonomous agent that reposts tweets on a real, reputation-sensitive account. You decide whether a tweet is safe for Jenil AI to repost.

REPOST ONLY genuine, legitimate content: real projects, products, launches, ideas, builders sharing work.

REFUSE (decision "fail") if the tweet shows ANY of:
- phishing, malware, or links designed to steal funds/keys/seed phrases
- scam or "rug" token shilling, pump-and-dump, guaranteed-returns claims, fake airdrops
- impersonation of a person, brand, or project
- hate speech, harassment, violence, or other illegal content
- deceptive or unverifiable financial claims

When uncertain, REFUSE. Protecting the account's reputation matters more than any single repost.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"decision":"pass"|"fail","reason":"<one short sentence>","confidence":<0..1>}`;

/**
 * Pure interpreter for the model's raw text response. Exported for testing.
 * Applies the conservative bias: malformed output or low-confidence pass ⇒ fail.
 */
export function interpretScreenResponse(raw: string, model: string): ScreenResult {
  let parsed: unknown;
  try {
    // Tolerate accidental markdown fences / surrounding text.
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return {
      decision: 'fail',
      reason: 'Could not parse screening result; rejected to be safe.',
      confidence: 0,
      model,
    };
  }

  const obj = parsed as { decision?: unknown; reason?: unknown; confidence?: unknown };
  const decision = obj.decision === 'pass' ? 'pass' : 'fail';
  const reason =
    typeof obj.reason === 'string' && obj.reason.trim()
      ? obj.reason.trim()
      : decision === 'pass'
        ? 'Content looks legitimate.'
        : 'Flagged by content safety screen.';
  const confidence =
    typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0;

  // Conservative bias: a low-confidence PASS is downgraded to FAIL.
  if (decision === 'pass' && confidence < CONFIDENCE_THRESHOLD) {
    return {
      decision: 'fail',
      reason: `Insufficient confidence to repost (${confidence}). Rejected to be safe.`,
      confidence,
      model,
    };
  }

  return { decision, reason, confidence, model };
}

/** Screen a tweet's text. Never throws — errors resolve to a conservative `fail`. */
export async function screenTweet(text: string): Promise<ScreenResult> {
  const model = getScreeningModel();
  let apiKey: string;
  try {
    apiKey = getAnthropicKey();
  } catch {
    return {
      decision: 'fail',
      reason: 'Screening unavailable (no API key); rejected to be safe.',
      confidence: 0,
      model,
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Tweet to screen:\n\n"""\n${text}\n"""`,
        },
      ],
    });
    const out = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return interpretScreenResponse(out, model);
  } catch (err) {
    return {
      decision: 'fail',
      reason: `Screening error (${err instanceof Error ? err.message : 'unknown'}); rejected to be safe.`,
      confidence: 0,
      model,
    };
  }
}
