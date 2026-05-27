import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { deliveries, events, routes, sources, targets } from '../../drizzle/schema.js';
import { EVENTS_QUEUE, REDIS_OPTIONS } from '../../common/queue/queue.module.js';
import { DeliveryClient } from './delivery.client.js';
import { dispatch } from '../routes/select.js';

export const DELIVERIES_QUEUE_NAME = 'deliveries';

interface DeliverJob {
  deliveryId: string;
}

@Injectable()
export class ProcessorService {
  private readonly log = new Logger(ProcessorService.name);
  private readonly deliveriesQueue: Queue<DeliverJob>;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly client: DeliveryClient,
    @Inject(EVENTS_QUEUE) private readonly eventsQueue: Queue,
    @Inject(REDIS_OPTIONS) connection: ConnectionOptions,
  ) {
    this.deliveriesQueue = new Queue(DELIVERIES_QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }

  getDeliveriesQueue(): Queue<DeliverJob> {
    return this.deliveriesQueue;
  }

  // ── Event-level: create deliveries for every enabled target on the source ─
  async processEvent(eventId: string): Promise<void> {
    const eventRows = await this.drizzle.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const event = eventRows[0];
    if (!event) {
      this.log.warn({ eventId }, 'processEvent: event missing');
      return;
    }
    if (event.status !== 'queued') {
      this.log.debug({ eventId, status: event.status }, 'processEvent: skip non-queued');
      return;
    }

    const sourceRows = await this.drizzle.db
      .select()
      .from(sources)
      .where(eq(sources.id, event.sourceId))
      .limit(1);
    const source = sourceRows[0];
    if (!source) {
      await this.drizzle.db
        .update(events)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(events.id, eventId));
      return;
    }

    const targetIds = source.targetIds;
    if (targetIds.length === 0) {
      await this.drizzle.db
        .update(events)
        .set({ status: 'ok', fanOut: 0, completedAt: new Date() })
        .where(eq(events.id, eventId));
      return;
    }

    // Filter to enabled targets — disabled targets get no delivery row, just like Hookdeck.
    const targetRows = await this.drizzle.db
      .select()
      .from(targets)
      .where(sql`${targets.id} = ANY(${targetIds}::uuid[]) AND ${targets.enabled} = true`);

    // Look up per-pair routes. Missing route ⇒ default (no filter, no transform).
    const routeRows = await this.drizzle.db
      .select()
      .from(routes)
      .where(
        sql`${routes.sourceId} = ${event.sourceId} AND ${routes.targetId} = ANY(${targetIds}::uuid[])`,
      );

    // Apply per-route filter rules.
    const decisions = dispatch(
      targetRows.map((t) => ({ id: t.id })),
      routeRows.map((r) => ({ targetId: r.targetId, enabled: r.enabled, rules: r.rules })),
      {
        topic: event.topic,
        headers: event.headers as Record<string, unknown>,
        body: event.body,
      },
    );
    const passingIds = new Set(decisions.filter((d) => d.forward).map((d) => d.target.id));
    for (const d of decisions) {
      if (!d.forward) {
        this.log.debug(
          { eventId, targetId: d.target.id, reason: d.reason, detail: d.detail },
          'processEvent: filter-skip',
        );
      }
    }
    const passing = targetRows.filter((t) => passingIds.has(t.id));

    if (passing.length === 0) {
      await this.drizzle.db
        .update(events)
        .set({ status: 'ok', fanOut: 0, completedAt: new Date() })
        .where(eq(events.id, eventId));
      return;
    }

    await this.drizzle.db
      .update(events)
      .set({ status: 'processing', fanOut: passing.length })
      .where(eq(events.id, eventId));

    const created = await this.drizzle.db
      .insert(deliveries)
      .values(
        passing.map((t) => ({
          eventId: event.id,
          targetId: t.id,
          status: 'pending' as const,
        })),
      )
      .returning({ id: deliveries.id });

    for (const d of created) {
      await this.deliveriesQueue.add('deliver', { deliveryId: d.id }, { jobId: d.id });
    }
  }

  // ── Delivery-level: POST to target.url, decide retry vs terminal ──────────
  async processDelivery(deliveryId: string): Promise<{ requeueDelayMs: number | null }> {
    const rows = await this.drizzle.db
      .select({
        delivery: deliveries,
        target: targets,
        body: events.body,
        contentType: sql<string>`${events.headers}->>'content-type'`,
      })
      .from(deliveries)
      .innerJoin(events, eq(events.id, deliveries.eventId))
      .innerJoin(targets, eq(targets.id, deliveries.targetId))
      .where(eq(deliveries.id, deliveryId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      this.log.warn({ deliveryId }, 'processDelivery: delivery missing');
      return { requeueDelayMs: null };
    }
    const { delivery, target, body, contentType } = row;
    if (delivery.status !== 'pending' && delivery.status !== 'retrying') {
      this.log.debug({ deliveryId, status: delivery.status }, 'processDelivery: skip terminal');
      return { requeueDelayMs: null };
    }

    const result = await this.client.post({
      url: target.url,
      body,
      headers: {
        'content-type': contentType ?? 'application/json',
        ...(target.headers as Record<string, string>),
      },
      timeoutMs: target.timeoutMs,
      signingSecret: target.signingSecret,
    });

    const attempt = delivery.attempt + 1;
    const now = new Date();

    if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
      await this.drizzle.db
        .update(deliveries)
        .set({
          status: 'ok',
          attempt,
          lastStatusCode: result.statusCode,
          lastResponseExcerpt: result.excerpt,
          lastAttemptAt: now,
          totalDurationMs: (delivery.totalDurationMs ?? 0) + result.durationMs,
          completedAt: now,
        })
        .where(eq(deliveries.id, deliveryId));
      await this.rollupEvent(delivery.eventId);
      return { requeueDelayMs: null };
    }

    if (!result.retryable || attempt >= target.maxAttempts) {
      await this.drizzle.db
        .update(deliveries)
        .set({
          status: attempt >= target.maxAttempts ? 'dead' : 'failed',
          attempt,
          lastStatusCode: result.statusCode,
          lastResponseExcerpt: result.excerpt || (result.err ?? ''),
          lastAttemptAt: now,
          totalDurationMs: (delivery.totalDurationMs ?? 0) + result.durationMs,
          completedAt: now,
        })
        .where(eq(deliveries.id, deliveryId));
      await this.rollupEvent(delivery.eventId);
      return { requeueDelayMs: null };
    }

    const idx = Math.min(attempt - 1, target.backoffSchedule.length - 1);
    const backoffSec = target.backoffSchedule[idx]!;
    const next = new Date(now.getTime() + backoffSec * 1000);
    await this.drizzle.db
      .update(deliveries)
      .set({
        status: 'retrying',
        attempt,
        nextAttemptAt: next,
        lastStatusCode: result.statusCode,
        lastResponseExcerpt: result.excerpt || (result.err ?? ''),
        lastAttemptAt: now,
        totalDurationMs: (delivery.totalDurationMs ?? 0) + result.durationMs,
      })
      .where(eq(deliveries.id, deliveryId));
    return { requeueDelayMs: backoffSec * 1000 };
  }

  private async rollupEvent(eventId: string): Promise<void> {
    const rows = await this.drizzle.db
      .select({ status: deliveries.status })
      .from(deliveries)
      .where(eq(deliveries.eventId, eventId));

    const total = rows.length;
    const ok = rows.filter((r) => r.status === 'ok').length;
    const dead = rows.filter((r) => r.status === 'dead').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const inflight = total - ok - dead - failed;
    if (inflight > 0) return;

    let status: 'ok' | 'partial' | 'failed';
    if (ok === total) status = 'ok';
    else if (ok > 0) status = 'partial';
    else status = 'failed';

    await this.drizzle.db
      .update(events)
      .set({
        status,
        fanOutOk: ok,
        fanOutFailed: dead + failed,
        completedAt: new Date(),
      })
      .where(and(eq(events.id, eventId), eq(events.status, 'processing')));
  }
}
