import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacPlugin } from '../src/index.js';

const secret = 'shhh';
const body = Buffer.from('{"hello":"world"}');

function hexSig(b: Buffer = body, s: string = secret): string {
  return createHmac('sha256', s).update(b).digest('hex');
}

describe('hmacPlugin.verify', () => {
  it('accepts a matching hex signature via the default X-Signature header', () => {
    const ok = hmacPlugin.verify({
      rawBody: body,
      headers: { 'x-signature': hexSig() },
      secret,
    });
    expect(ok).toBe(true);
  });

  it('rejects when no signature header is present', () => {
    expect(hmacPlugin.verify({ rawBody: body, headers: {}, secret })).toBe(false);
  });

  it('rejects when the signature is wrong', () => {
    expect(
      hmacPlugin.verify({
        rawBody: body,
        headers: { 'x-signature': 'deadbeef'.repeat(8) },
        secret,
      }),
    ).toBe(false);
  });

  it('honors a custom header name via plugin_config.header', () => {
    const ok = hmacPlugin.verify({
      rawBody: body,
      headers: { 'x-shopify-hmac-sha256': hexSig() },
      secret,
      config: { header: 'X-Shopify-Hmac-Sha256' },
    });
    expect(ok).toBe(true);
  });

  it('strips a configured prefix before comparing (sha256=…)', () => {
    const ok = hmacPlugin.verify({
      rawBody: body,
      headers: { 'x-signature': `sha256=${hexSig()}` },
      secret,
      config: { prefix: 'sha256=' },
    });
    expect(ok).toBe(true);
  });

  it('supports base64 encoding', () => {
    const b64 = createHmac('sha256', secret).update(body).digest('base64');
    const ok = hmacPlugin.verify({
      rawBody: body,
      headers: { 'x-signature': b64 },
      secret,
      config: { encoding: 'base64' },
    });
    expect(ok).toBe(true);
  });

  it('is case-insensitive on header lookup', () => {
    const ok = hmacPlugin.verify({
      rawBody: body,
      headers: { 'X-Signature': hexSig() },
      secret,
    });
    expect(ok).toBe(true);
  });
});
