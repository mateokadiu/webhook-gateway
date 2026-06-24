import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier, type VerifyInput } from '@webhook-gateway/plugin-sdk';

interface ParsedHeader {
  t: string | null;
  v1: string[];
}

function parseStripeHeader(header: string): ParsedHeader {
  const out: ParsedHeader = { t: null, v1: [] };
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2);
    if (!k || !v) continue;
    if (k.trim() === 't') out.t = v.trim();
    else if (k.trim() === 'v1') out.v1.push(v.trim());
  }
  return out;
}

export const stripePlugin: SignatureVerifier = {
  id: 'stripe',

  verify(input: VerifyInput): boolean {
    const header = pickHeader(input.headers, 'stripe-signature');
    if (!header) return false;
    const parsed = parseStripeHeader(header);
    if (!parsed.t || parsed.v1.length === 0) return false;

    const tolerance = input.tolerance ?? 300;
    const nowSec = Math.floor(Date.now() / 1000);
    const ts = Number(parsed.t);
    if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > tolerance) return false;

    const expected = createHmac('sha256', input.secret)
      .update(`${parsed.t}.`)
      .update(input.rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected);
    return parsed.v1.some((sig) => {
      if (sig.length !== expected.length) return false;
      try {
        return timingSafeEqual(Buffer.from(sig), expectedBuf);
      } catch {
        return false;
      }
    });
  },

  extractIdempotencyKey({ rawBody }): string | null {
    try {
      const obj = JSON.parse(rawBody.toString('utf-8')) as { id?: unknown };
      return typeof obj.id === 'string' ? obj.id : null;
    } catch {
      return null;
    }
  },

  extractTopic({ rawBody }): string | null {
    try {
      const obj = JSON.parse(rawBody.toString('utf-8')) as { type?: unknown };
      return typeof obj.type === 'string' ? obj.type : null;
    } catch {
      return null;
    }
  },
};

export default stripePlugin;
