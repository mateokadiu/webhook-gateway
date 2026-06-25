import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { deliveries } from '../../drizzle/schema.js';
import { ProcessorService } from '../processor/processor.service.js';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly processor: ProcessorService,
  ) {}

  async retry(id: string): Promise<{ ok: true }> {
    const rows = await this.drizzle.db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`delivery ${id} not found`);
    await this.drizzle.db
      .update(deliveries)
      .set({ status: 'retrying', nextAttemptAt: new Date() })
      .where(eq(deliveries.id, id));
    await this.processor
      .getDeliveriesQueue()
      .add('deliver', { deliveryId: id }, { jobId: `retry:${id}:${Date.now()}` });
    return { ok: true };
  }

  list(opts: {
    eventId?: string | undefined;
    targetId?: string | undefined;
    status?: string | undefined;
    limit: number;
  }) {
    const filters = [];
    if (opts.eventId) filters.push(eq(deliveries.eventId, opts.eventId));
    if (opts.targetId) filters.push(eq(deliveries.targetId, opts.targetId));
    if (opts.status) filters.push(eq(deliveries.status, opts.status));
    return this.drizzle.db
      .select()
      .from(deliveries)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(deliveries.createdAt))
      .limit(opts.limit);
  }

  async findById(id: string) {
    const rows = await this.drizzle.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
}
