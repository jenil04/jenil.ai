import { describe, it, expect } from 'vitest';
import { interpretScreenResponse, CONFIDENCE_THRESHOLD } from '@/lib/screening';

const M = 'claude-test';

describe('interpretScreenResponse', () => {
  it('passes clearly-benign, high-confidence content', () => {
    const r = interpretScreenResponse(
      '{"decision":"pass","reason":"Genuine product launch.","confidence":0.95}',
      M,
    );
    expect(r.decision).toBe('pass');
    expect(r.confidence).toBe(0.95);
  });

  it('fails scam content', () => {
    const r = interpretScreenResponse(
      '{"decision":"fail","reason":"Guaranteed 100x token shill.","confidence":0.97}',
      M,
    );
    expect(r.decision).toBe('fail');
  });

  it('is conservative on malformed output', () => {
    const r = interpretScreenResponse('not json at all', M);
    expect(r.decision).toBe('fail');
    expect(r.confidence).toBe(0);
  });

  it('downgrades a low-confidence pass to fail', () => {
    const r = interpretScreenResponse(
      `{"decision":"pass","reason":"maybe ok","confidence":${CONFIDENCE_THRESHOLD - 0.1}}`,
      M,
    );
    expect(r.decision).toBe('fail');
  });

  it('tolerates markdown-fenced JSON', () => {
    const r = interpretScreenResponse(
      '```json\n{"decision":"pass","reason":"ok","confidence":0.9}\n```',
      M,
    );
    expect(r.decision).toBe('pass');
  });

  it('treats an unknown decision value as fail', () => {
    const r = interpretScreenResponse(
      '{"decision":"maybe","reason":"unsure","confidence":0.9}',
      M,
    );
    expect(r.decision).toBe('fail');
  });
});
