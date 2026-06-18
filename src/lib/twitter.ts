import { getXApiBearerToken } from './config';

/**
 * Minimal X (Twitter) API v2 client.
 *
 * `X_API_BEARER_TOKEN` is an OAuth2 user-context access token for the account
 * that performs the repost (scopes: tweet.read, users.read, tweet.write).
 * App-only bearer tokens can read but CANNOT retweet on behalf of a user, so a
 * user-context token is required for `retweet`.
 */

const API_BASE = 'https://api.twitter.com/2';

// Cache the resolved user id keyed to the token value, so a token rotation can
// never cause us to post as a stale/different account.
let cachedUser: { token: string; id: string } | null = null;

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getXApiBearerToken()}` };
}

async function xFetch(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      (json.detail as string | undefined) ??
      (json.title as string | undefined) ??
      JSON.stringify(json).slice(0, 200);
    throw new Error(`X API ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

/** Resolve and cache the authenticated user's numeric id (per token). */
async function getMyUserId(): Promise<string> {
  const token = getXApiBearerToken();
  if (cachedUser && cachedUser.token === token) return cachedUser.id;
  const json = await xFetch('/users/me');
  const id = (json.data as { id?: string } | undefined)?.id;
  if (!id) throw new Error('Could not resolve authenticated X user id');
  cachedUser = { token, id };
  return id;
}

/** Fetch the text of a tweet by id (for screening). */
export async function lookupTweetText(tweetId: string): Promise<string> {
  const json = await xFetch(`/tweets/${encodeURIComponent(tweetId)}?tweet.fields=text`);
  const data = json.data as { text?: string } | undefined;
  if (!data || typeof data.text !== 'string') {
    throw new Error('Tweet not found or has no readable text');
  }
  return data.text;
}

/** Repost (native retweet) a tweet by id. Returns the resulting repost id. */
export async function retweet(tweetId: string): Promise<{ repostId: string }> {
  const userId = await getMyUserId();
  const json = await xFetch(`/users/${userId}/retweets`, {
    method: 'POST',
    body: JSON.stringify({ tweet_id: tweetId }),
  });
  const data = json.data as { retweeted?: boolean; rest_id?: string } | undefined;
  if (!data?.retweeted) {
    throw new Error('Retweet was not confirmed by the X API');
  }
  return { repostId: data.rest_id ?? tweetId };
}
