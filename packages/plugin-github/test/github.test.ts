import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { githubPlugin } from '../src/index.js';

const secret = 'shh';
const body = Buffer.from('{"action":"opened"}');

function sig(): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('githubPlugin', () => {
  it('accepts a valid X-Hub-Signature-256', () => {
    expect(
      githubPlugin.verify({
        rawBody: body,
        headers: { 'x-hub-signature-256': sig() },
        secret,
      }),
    ).toBe(true);
  });

  it('rejects when signature is missing', () => {
    expect(githubPlugin.verify({ rawBody: body, headers: {}, secret })).toBe(false);
  });

  it('rejects when prefix is wrong', () => {
    expect(
      githubPlugin.verify({
        rawBody: body,
        headers: { 'x-hub-signature-256': `sha1=${'a'.repeat(40)}` },
        secret,
      }),
    ).toBe(false);
  });

  it('rejects on tampered body', () => {
    expect(
      githubPlugin.verify({
        rawBody: Buffer.from('{"action":"closed"}'),
        headers: { 'x-hub-signature-256': sig() },
        secret,
      }),
    ).toBe(false);
  });

  it('extracts X-GitHub-Delivery as idempotency key', () => {
    expect(
      githubPlugin.extractIdempotencyKey?.({
        rawBody: body,
        headers: { 'x-github-delivery': '12345-uuid' },
      }),
    ).toBe('12345-uuid');
  });

  it('extracts X-GitHub-Event as topic', () => {
    expect(
      githubPlugin.extractTopic?.({
        rawBody: body,
        headers: { 'x-github-event': 'pull_request' },
      }),
    ).toBe('pull_request');
  });
});
