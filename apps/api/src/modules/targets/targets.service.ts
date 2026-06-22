import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { TargetCreateSchema } from '@webhook-gateway/shared';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { targets } from '../../drizzle/schema.js';

@Injectable()
export class TargetsService {
  constructor(private readonly drizzle: DrizzleService) {}

  list() {
    return this.drizzle.db.select().from(targets);
  }

  async findById(id: string) {
    const rows = await this.drizzle.db
      .select()
      .from(targets)
      .where(eq(targets.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: Record<string, unknown>) {
    const parsed = TargetCreateSchema.parse({
      ...input,
      headers: (input['headers'] as Record<string, string> | undefined) ?? {},
      timeoutMs: input['timeoutMs'] ?? 10_000,
      maxAttempts: input['maxAttempts'] ?? 6,
      backoffSchedule: (input['backoffSchedule'] as number[] | undefined) ?? [
        30, 120, 600, 3600, 21600, 86400,
      ],
      enabled: input['enabled'] ?? true,
      signingSecret: input['signingSecret'] ?? null,
    });
    const inserted = await this.drizzle.db.insert(targets).values(parsed).returning();
    return inserted[0]!;
  }

  async update(id: string, patch: Record<string, unknown>) {
    const updated = await this.drizzle.db
      .update(targets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(targets.id, id))
      .returning();
    if (!updated[0]) throw new NotFoundException();
    return updated[0];
  }

  async remove(id: string) {
    const removed = await this.drizzle.db
      .delete(targets)
      .where(eq(targets.id, id))
      .returning({ id: targets.id });
    if (!removed[0]) throw new NotFoundException();
    return { ok: true };
  }
}
