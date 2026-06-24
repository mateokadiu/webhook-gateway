import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stripePlugin } from '../src/index.js';

const secret = 'whsec_test';
const body = Buffer.from('{"id":"evt_123","type":"payment_intent.succeeded"}');

function signedHeader(t: number, rawBody = body, s = secret): string {
  const sig = createHmac('sha256', s).update(`${t}.`).update(rawBody).digest('hex');
  return `t=${t},v1=${sig}`;
}

describe('stripePlugin', () => {
  it('accepts a valid Stripe-Signature within tolerance', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(
      stripePlugin.verify({
        rawBody: body,
        headers: { 'stripe-signature': signedHeader(t) },
        secret,
      }),
    ).toBe(true);
  });

  it('rejects when timestamp is outside the default 300s tolerance', () => {
    const t = Math.floor(Date.now() / 1000) - 600;
    expect(
      stripePlugin.verify({
        rawBody: body,
        headers: { 'stripe-signature': signedHeader(t) },
        secret,
      }),
    ).toBe(false);
  });

  it('respects a smaller per-source tolerance', () => {
    const t = Math.floor(Date.now() / 1000) - 60;
    expect(
      stripePlugin.verify({
        rawBody: body,
        headers: { 'stripe-signature': signedHeader(t) },
        secret,
        tolerance: 30,
      }),
    ).toBe(false);
  });

  it('rejects on missing header', () => {
    expect(stripePlugin.verify({ rawBody: body, headers: {}, secret })).toBe(false);
  });

  it('rejects when v1 signature does not match', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(
      stripePlugin.verify({
        rawBody: body,
        headers: { 'stripe-signature': `t=${t},v1=${'00'.repeat(32)}` },
        secret,
      }),
    ).toBe(false);
  });

  it('accepts when one of multiple v1 signatures matches (rotating keys)', () => {
    const t = Math.floor(Date.now() / 1000);
    const right = createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
    expect(
      stripePlugin.verify({
        rawBody: body,
        headers: { 'stripe-signature': `t=${t},v1=${'00'.repeat(32)},v1=${right}` },
        secret,
      }),
    ).toBe(true);
  });

  it('extracts event.id as idempotency key', () => {
    expect(stripePlugin.extractIdempotencyKey?.({ rawBody: body, headers: {} })).toBe('evt_123');
  });

  it('extracts event.type as topic', () => {
    expect(stripePlugin.extractTopic?.({ rawBody: body, headers: {} })).toBe(
      'payment_intent.succeeded',
    );
  });
});
