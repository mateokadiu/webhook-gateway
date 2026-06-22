import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier, type VerifyInput } from '@webhook-gateway/plugin-sdk';

/**
 * Generic HMAC SHA-256 verifier. Reads the signature from a configurable
 * header (default: `X-Signature`), expects a hex digest (default) or base64
 * if `config.encoding === 'base64'`. Constant-time compare.
 *
 * Source plugin_config keys:
 *   - header   header name (default 'X-Signature')
 *   - prefix   optional prefix to strip from header value, e.g. 'sha256='
 *   - encoding 'hex' (default) or 'base64'
 */
export const hmacPlugin: SignatureVerifier = {
  id: 'hmac',

  verify(input: VerifyInput): boolean {
    const cfg = input.config ?? {};
    const headerName = cfg['header'] ?? 'X-Signature';
    const encoding: 'hex' | 'base64' = cfg['encoding'] === 'base64' ? 'base64' : 'hex';
    const prefix = cfg['prefix'] ?? '';

    const raw = pickHeader(input.headers, headerName);
    if (!raw) return false;
    const provided = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;

    const expected = createHmac('sha256', input.secret).update(input.rawBody).digest(encoding);
    if (provided.length !== expected.length) return false;

    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  },
};

export default hmacPlugin;
