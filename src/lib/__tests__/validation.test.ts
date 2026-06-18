import { describe, it, expect } from 'vitest';
import { parseTweetRef } from '@/lib/validation';

describe('parseTweetRef', () => {
  it('extracts id from an x.com status URL', () => {
    expect(parseTweetRef('https://x.com/jenilt/status/1788889999000111222')).toEqual({
      tweetId: '1788889999000111222',
    });
  });

  it('extracts id from a twitter.com status URL', () => {
    expect(
      parseTweetRef('https://twitter.com/someone/status/1234567890'),
    ).toEqual({ tweetId: '1234567890' });
  });

  it('extracts id from a www.x.com URL with query/fragment', () => {
    expect(
      parseTweetRef('https://www.x.com/a/status/1788889999000111?s=20&t=abc#x'),
    ).toEqual({ tweetId: '1788889999000111' });
  });

  it('accepts a bare numeric tweet id', () => {
    expect(parseTweetRef('1788889999000111222')).toEqual({
      tweetId: '1788889999000111222',
    });
  });

  it('rejects a javascript: scheme', () => {
    const r = parseTweetRef('javascript:alert(1)//x.com/a/status/1');
    expect('error' in r).toBe(true);
  });

  it('rejects a non-twitter host', () => {
    const r = parseTweetRef('https://evil.com/a/status/123');
    expect('error' in r).toBe(true);
  });

  it('rejects an http (non-https) twitter URL', () => {
    const r = parseTweetRef('http://x.com/a/status/123');
    expect('error' in r).toBe(true);
  });

  it('rejects a twitter URL without a status id', () => {
    const r = parseTweetRef('https://x.com/jenilt');
    expect('error' in r).toBe(true);
  });

  it('rejects empty input', () => {
    const r = parseTweetRef('   ');
    expect('error' in r).toBe(true);
  });
});
