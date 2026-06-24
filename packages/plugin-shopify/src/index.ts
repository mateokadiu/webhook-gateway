import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier, type VerifyInput } from '@webhook-gateway/plugin-sdk';

export const shopifyPlugin: SignatureVerifier = {
  id: 'shopify',

  verify(input: VerifyInput): boolean {
    const provided = pickHeader(input.headers, 'x-shopify-hmac-sha256');
    if (!provided) return false;
    const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('base64');
    if (provided.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  extractTopic({ headers }): string | null {
    return pickHeader(headers, 'x-shopify-topic');
  },

  extractIdempotencyKey({ headers }): string | null {
    return pickHeader(headers, 'x-shopify-webhook-id');
  },
};

export default shopifyPlugin;
