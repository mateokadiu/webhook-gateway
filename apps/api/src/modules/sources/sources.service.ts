import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SourceCreateSchema } from '@webhook-gateway/shared';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { sources } from '../../drizzle/schema.js';

@Injectable()
export class SourcesService {
  constructor(private readonly drizzle: DrizzleService) {}

  list() {
    return this.drizzle.db.select().from(sources);
  }

  async findBySlug(slug: string) {
    const rows = await this.drizzle.db
      .select()
      .from(sources)
      .where(eq(sources.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: Record<string, unknown>) {
    const parsed = SourceCreateSchema.parse({
      ...input,
      pluginConfig: (input['pluginConfig'] as Record<string, string> | undefined) ?? {},
      targetIds: (input['targetIds'] as string[] | undefined) ?? [],
      enabled: input['enabled'] ?? true,
      testMode: input['testMode'] ?? false,
      signatureToleranceSec: input['signatureToleranceSec'] ?? 300,
    });
    const inserted = await this.drizzle.db.insert(sources).values(parsed).returning();
    return inserted[0]!;
  }

  async update(slug: string, patch: Record<string, unknown>) {
    const updated = await this.drizzle.db
      .update(sources)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sources.slug, slug))
      .returning();
    if (!updated[0]) throw new NotFoundException();
    return updated[0];
  }

  async remove(slug: string) {
    const removed = await this.drizzle.db
      .delete(sources)
      .where(eq(sources.slug, slug))
      .returning({ id: sources.id });
    if (!removed[0]) throw new NotFoundException();
    return { ok: true };
  }
}
