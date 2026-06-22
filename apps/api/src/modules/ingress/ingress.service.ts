import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import { Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { PluginRegistryService } from '../../common/plugins/plugin-registry.service.js';
import { EVENTS_QUEUE } from '../../common/queue/queue.module.js';
import { events, sources } from '../../drizzle/schema.js';
import type { Env } from '../../config/env.schema.js';

export type IngressOutcome =
  | { kind: 'ok'; eventId: string }
  | { kind: 'unknown_source' }
  | { kind: 'disabled' }
  | { kind: 'plugin_missing'; pluginId: string }
  | { kind: 'invalid_signature' }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'too_large'; sizeBytes: number };

@Injectable()
export class IngressService {
  private readonly log = new Logger(IngressService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly plugins: PluginRegistryService,
    config: ConfigService<Env, true>,
    @Inject(EVENTS_QUEUE) private readonly queue: Queue,
  ) {
    this.maxBytes = config.get('INGRESS_MAX_BODY_BYTES', { infer: true });
  }

  async accept(
    slug: string,
    topicPath: string | null,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<IngressOutcome> {
    if (rawBody.length > this.maxBytes) {
      return { kind: 'too_large', sizeBytes: rawBody.length };
    }

    const sourceRows = await this.drizzle.db
      .select()
      .from(sources)
      .where(eq(sources.slug, slug))
      .limit(1);
    const source = sourceRows[0];
    if (!source) return { kind: 'unknown_source' };
    if (!source.enabled) return { kind: 'disabled' };

    const verifier = this.plugins.get(source.pluginId);
    if (!verifier) return { kind: 'plugin_missing', pluginId: source.pluginId };

    let verified: boolean;
    try {
      verified = await verifier.verify({
        rawBody,
        headers,
        secret: source.signingSecret,
        tolerance: source.signatureToleranceSec,
        config: source.pluginConfig as Record<string, string>,
      });
    } catch (err) {
      this.log.warn({ slug, err: errMsg(err) }, 'verifier threw — treating as invalid');
      verified = false;
    }
    if (!verified) return { kind: 'invalid_signature' };

    const idempotencyHeader =
      typeof headers['idempotency-key'] === 'string' ? (headers['idempotency-key'] as string) : null;
    const pluginKey = verifier.extractIdempotencyKey?.({ rawBody, headers }) ?? null;
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const dedupKey = idempotencyHeader ?? pluginKey ?? bodyHash;
    const topic = topicPath ?? verifier.extractTopic?.({ rawBody, headers }) ?? null;

    const inserted = await this.drizzle.db
      .insert(events)
      .values({
        sourceId: source.id,
        topic,
        dedupKey,
        body: rawBody,
        bodyHash,
        headers: stringifyHeaders(headers),
        sizeBytes: rawBody.length,
        status: 'queued',
      })
      .onConflictDoNothing({ target: [events.sourceId, events.dedupKey] })
      .returning({ id: events.id });

    if (inserted.length === 0) {
      // dedup hit — fetch existing id for response transparency
      const existing = await this.drizzle.db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.sourceId, source.id), eq(events.dedupKey, dedupKey)))
        .limit(1);
      return { kind: 'duplicate', eventId: existing[0]?.id ?? '' };
    }

    const eventId = inserted[0]!.id;
    await this.queue.add('process', { eventId }, { jobId: eventId });
    return { kind: 'ok', eventId };
  }
}

function stringifyHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
