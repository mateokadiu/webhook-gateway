import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { events } from '../../drizzle/schema.js';
import { EVENTS_QUEUE } from '../../common/queue/queue.module.js';
import { toTsQuery } from './fts.js';

@Injectable()
export class EventsService {
  constructor(
    private readonly drizzle: DrizzleService,
    @Inject(EVENTS_QUEUE) private readonly queue: Queue,
  ) {}

  async replay(id: string): Promise<{ ok: true; eventId: string }> {
    const rows = await this.drizzle.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`event ${id} not found`);

    await this.drizzle.db
      .update(events)
      .set({ status: 'queued', fanOut: 0, fanOutOk: 0, fanOutFailed: 0, completedAt: null })
      .where(eq(events.id, id));
    await this.queue.add('process', { eventId: id }, { jobId: `replay:${id}:${Date.now()}` });
    return { ok: true, eventId: id };
  }

  async list(opts: {
    sourceId?: string | undefined;
    status?: string | undefined;
    q?: string | undefined;
    limit: number;
  }) {
    const filters = [];
    if (opts.sourceId) filters.push(eq(events.sourceId, opts.sourceId));
    if (opts.status) filters.push(eq(events.status, opts.status));
    if (opts.q && opts.q.trim().length > 0) {
      const tsq = toTsQuery(opts.q);
      filters.push(sql`${events.tsv} @@ to_tsquery('simple', ${tsq})`);
    }

    return this.drizzle.db
      .select({
        id: events.id,
        sourceId: events.sourceId,
        topic: events.topic,
        dedupKey: events.dedupKey,
        bodyHash: events.bodyHash,
        sizeBytes: events.sizeBytes,
        status: events.status,
        fanOut: events.fanOut,
        fanOutOk: events.fanOutOk,
        fanOutFailed: events.fanOutFailed,
        receivedAt: events.receivedAt,
        completedAt: events.completedAt,
      })
      .from(events)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(events.receivedAt))
      .limit(opts.limit);
  }

  async findById(id: string) {
    const rows = await this.drizzle.db
      .select({
        id: events.id,
        sourceId: events.sourceId,
        topic: events.topic,
        dedupKey: events.dedupKey,
        bodyHash: events.bodyHash,
        sizeBytes: events.sizeBytes,
        status: events.status,
        fanOut: events.fanOut,
        fanOutOk: events.fanOutOk,
        fanOutFailed: events.fanOutFailed,
        receivedAt: events.receivedAt,
        completedAt: events.completedAt,
        headers: events.headers,
        bodyPreview: events.body,
      })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, bodyPreview: row.bodyPreview.subarray(0, 4096).toString('utf-8') };
  }
}
