import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier, type VerifyInput } from '@webhook-gateway/plugin-sdk';

export const slackPlugin: SignatureVerifier = {
  id: 'slack',

  verify(input: VerifyInput): boolean {
    const sigHeader = pickHeader(input.headers, 'x-slack-signature');
    const tsHeader = pickHeader(input.headers, 'x-slack-request-timestamp');
    if (!sigHeader || !tsHeader || !sigHeader.startsWith('v0=')) return false;

    const tolerance = input.tolerance ?? 300;
    const ts = Number(tsHeader);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;

    const baseString = Buffer.concat([
      Buffer.from(`v0:${tsHeader}:`, 'utf-8'),
      input.rawBody,
    ]);
    const expected = `v0=${createHmac('sha256', input.secret).update(baseString).digest('hex')}`;
    if (sigHeader.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  },
};

export default slackPlugin;
