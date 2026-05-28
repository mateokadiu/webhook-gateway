import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { DeliveryClient } from './delivery.client.js';

const SECRET = 'whsec_test';
const BODY = Buffer.from('{"hi":"there"}');

describe('DeliveryClient signing format', () => {
  let client: DeliveryClient;
  let originalFetch: typeof globalThis.fetch;
  let captured: { url: string; headers: Record<string, string>; body: unknown } | null = null;

  beforeEach(() => {
    client = new DeliveryClient();
    captured = null;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
      const i = init as { headers?: Record<string, string>; body?: unknown };
      captured = { url: String(url), headers: i.headers ?? {}, body: i.body };
      return new Response('', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('emits X-WG-Signature by default', async () => {
    await client.post({
      url: 'http://example.test/wh',
      body: BODY,
      headers: {},
      timeoutMs: 1000,
      signingSecret: SECRET,
    });
    expect(captured).not.toBeNull();
    const sig = captured!.headers['x-wg-signature'];
    expect(sig).toMatch(/^v1,t=\d+,s=[a-f0-9]{64}$/);
    expect(captured!.headers['stripe-signature']).toBeUndefined();
  });

  it('emits Stripe-Signature when signingFormat=stripe', async () => {
    await client.post({
      url: 'http://example.test/wh',
      body: BODY,
      headers: {},
      timeoutMs: 1000,
      signingSecret: SECRET,
      signingFormat: 'stripe',
    });
    const sig = captured!.headers['stripe-signature'];
    expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(captured!.headers['x-wg-signature']).toBeUndefined();
  });

  it('stripe-format signature is verifiable like the Stripe SDK does it', async () => {
    await client.post({
      url: 'http://example.test/wh',
      body: BODY,
      headers: {},
      timeoutMs: 1000,
      signingSecret: SECRET,
      signingFormat: 'stripe',
    });
    const sig = captured!.headers['stripe-signature']!;
    const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
    const t = parts.t!;
    const v1 = parts.v1!;
    const expected = createHmac('sha256', SECRET).update(`${t}.`).update(BODY).digest('hex');
    expect(v1).toBe(expected);
  });

  it('omits signature header entirely when secret is null', async () => {
    await client.post({
      url: 'http://example.test/wh',
      body: BODY,
      headers: {},
      timeoutMs: 1000,
      signingSecret: null,
    });
    expect(captured!.headers['x-wg-signature']).toBeUndefined();
    expect(captured!.headers['stripe-signature']).toBeUndefined();
  });
});
