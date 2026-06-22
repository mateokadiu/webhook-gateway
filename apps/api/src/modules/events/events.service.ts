import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { events } from '../../drizzle/schema.js';

@Injectable()
export class EventsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async list(opts: { sourceId?: string | undefined; status?: string | undefined; limit: number }) {
    const filters = [];
    if (opts.sourceId) filters.push(eq(events.sourceId, opts.sourceId));
    if (opts.status) filters.push(eq(events.status, opts.status));

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
