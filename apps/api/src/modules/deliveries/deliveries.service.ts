import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { deliveries } from '../../drizzle/schema.js';

@Injectable()
export class DeliveriesService {
  constructor(private readonly drizzle: DrizzleService) {}

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
