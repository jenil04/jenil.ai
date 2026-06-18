/**
 * Parse and validate a tweet reference (URL or bare id).
 *
 * Security: per the financial-product URL rules, only `https://` URLs on the
 * x.com / twitter.com host allow-list are accepted. Other schemes
 * (`javascript:`, `data:`, etc.) and other hosts are rejected. A bare numeric
 * id is also accepted (agents sometimes pass the id directly).
 */

const ALLOWED_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

export type TweetRef = { tweetId: string } | { error: string };

export function parseTweetRef(input: string): TweetRef {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return { error: 'Empty tweet reference' };

  // Bare numeric id.
  if (/^\d{5,25}$/.test(trimmed)) {
    return { tweetId: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'Not a valid tweet URL or numeric id' };
  }

  if (url.protocol !== 'https:') {
    return { error: 'Tweet URL must use https' };
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { error: 'Tweet URL must be on x.com or twitter.com' };
  }

  // Path shape: /<user>/status/<id>  (also /statuses/<id> on legacy URLs)
  const match = url.pathname.match(/\/status(?:es)?\/(\d{5,25})/);
  if (!match) {
    return { error: 'Could not find a tweet id in the URL' };
  }
  return { tweetId: match[1] };
}
