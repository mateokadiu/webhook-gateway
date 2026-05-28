import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';

export type SigningFormat = 'wg' | 'stripe';

export interface DeliverRequest {
  url: string;
  body: Buffer;
  headers: Record<string, string>;
  timeoutMs: number;
  signingSecret: string | null;
  /** Outbound signature format. Defaults to `'wg'`. */
  signingFormat?: SigningFormat;
}

export interface DeliverResult {
  statusCode: number | null;
  durationMs: number;
  excerpt: string;
  retryable: boolean;
  err: string | null;
}

const RETRYABLE_STATUSES = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

@Injectable()
export class DeliveryClient {
  private readonly log = new Logger(DeliveryClient.name);

  async post(req: DeliverRequest): Promise<DeliverResult> {
    const started = Date.now();
    const headers: Record<string, string> = {
      'content-type': req.headers['content-type'] ?? 'application/json',
      ...req.headers,
    };

    if (req.signingSecret) {
      const ts = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', req.signingSecret)
        .update(`${ts}.`)
        .update(req.body)
        .digest('hex');
      if ((req.signingFormat ?? 'wg') === 'stripe') {
        // Stripe-compatible: `Stripe-Signature: t=<ts>,v1=<hex>` — downstream
        // services can verify with the standard Stripe SDK by passing this
        // header and the raw request body.
        headers['stripe-signature'] = `t=${ts},v1=${sig}`;
      } else {
        headers['x-wg-signature'] = `v1,t=${ts},s=${sig}`;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch(req.url, {
        method: 'POST',
        body: req.body,
        headers,
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      const durationMs = Date.now() - started;
      const retryable = !res.ok && RETRYABLE_STATUSES.has(res.status);
      return {
        statusCode: res.status,
        durationMs,
        excerpt: text.slice(0, 2048),
        retryable,
        err: res.ok ? null : `non-2xx: ${res.status}`,
      };
    } catch (err) {
      const aborted = controller.signal.aborted;
      const durationMs = Date.now() - started;
      return {
        statusCode: null,
        durationMs,
        excerpt: '',
        retryable: true, // transport / timeout — always retry
        err: aborted ? 'timeout' : err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
