import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { slackPlugin } from '../src/index.js';

const secret = 'shh-slack';
const body = Buffer.from('token=xxx&team_id=T12345');

function sign(ts: number, rawBody = body): string {
  const base = Buffer.concat([Buffer.from(`v0:${ts}:`, 'utf-8'), rawBody]);
  return `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
}

describe('slackPlugin', () => {
  it('accepts when timestamp + signature both valid', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(
      slackPlugin.verify({
        rawBody: body,
        headers: {
          'x-slack-signature': sign(ts),
          'x-slack-request-timestamp': String(ts),
        },
        secret,
      }),
    ).toBe(true);
  });

  it('rejects stale timestamps (default 300s)', () => {
    const ts = Math.floor(Date.now() / 1000) - 9999;
    expect(
      slackPlugin.verify({
        rawBody: body,
        headers: {
          'x-slack-signature': sign(ts),
          'x-slack-request-timestamp': String(ts),
        },
        secret,
      }),
    ).toBe(false);
  });

  it('rejects when either header is missing', () => {
    expect(
      slackPlugin.verify({
        rawBody: body,
        headers: { 'x-slack-signature': 'v0=deadbeef' },
        secret,
      }),
    ).toBe(false);
  });

  it('rejects mismatched signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(
      slackPlugin.verify({
        rawBody: body,
        headers: {
          'x-slack-signature': `v0=${'00'.repeat(32)}`,
          'x-slack-request-timestamp': String(ts),
        },
        secret,
      }),
    ).toBe(false);
  });
});
