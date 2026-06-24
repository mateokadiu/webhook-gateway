import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier, type VerifyInput } from '@webhook-gateway/plugin-sdk';

export const githubPlugin: SignatureVerifier = {
  id: 'github',

  verify(input: VerifyInput): boolean {
    const header = pickHeader(input.headers, 'x-hub-signature-256');
    if (!header || !header.startsWith('sha256=')) return false;
    const provided = header.slice('sha256='.length);
    const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('hex');
    if (provided.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  extractIdempotencyKey({ headers }): string | null {
    const id = pickHeader(headers, 'x-github-delivery');
    return id ?? null;
  },

  extractTopic({ headers }): string | null {
    const event = pickHeader(headers, 'x-github-event');
    return event ?? null;
  },
};

export default githubPlugin;
