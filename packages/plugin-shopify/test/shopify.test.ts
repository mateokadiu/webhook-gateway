import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { shopifyPlugin } from '../src/index.js';

const secret = 'shopify-secret';
const body = Buffer.from('{"id":1234567890}');

function sig(): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

describe('shopifyPlugin', () => {
  it('accepts a valid X-Shopify-Hmac-Sha256 (base64)', () => {
    expect(
      shopifyPlugin.verify({
        rawBody: body,
        headers: { 'x-shopify-hmac-sha256': sig() },
        secret,
      }),
    ).toBe(true);
  });

  it('rejects when header missing', () => {
    expect(shopifyPlugin.verify({ rawBody: body, headers: {}, secret })).toBe(false);
  });

  it('rejects on tampered body', () => {
    expect(
      shopifyPlugin.verify({
        rawBody: Buffer.from('{"id":42}'),
        headers: { 'x-shopify-hmac-sha256': sig() },
        secret,
      }),
    ).toBe(false);
  });

  it('extracts X-Shopify-Topic as topic', () => {
    expect(
      shopifyPlugin.extractTopic?.({
        rawBody: body,
        headers: { 'x-shopify-topic': 'orders/create' },
      }),
    ).toBe('orders/create');
  });

  it('extracts X-Shopify-Webhook-Id as idempotency key', () => {
    expect(
      shopifyPlugin.extractIdempotencyKey?.({
        rawBody: body,
        headers: { 'x-shopify-webhook-id': 'abc-123' },
      }),
    ).toBe('abc-123');
  });
});
