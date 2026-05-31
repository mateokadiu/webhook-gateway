import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { deliveries, events } from '../../drizzle/schema.js';

interface Overview {
  windowHours: number;
  events: {
    total: number;
    ok: number;
    failed: number;
    perMinute: number;
  };
  deliveries: {
    total: number;
    ok: number;
    failed: number;
    dead: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  bySource: Array<{
    sourceId: string;
    events: number;
    ok: number;
    failed: number;
  }>;
  byTarget: Array<{
    targetId: string;
    deliveries: number;
    ok: number;
    deadOrFailed: number;
    avgLatencyMs: number | null;
  }>;
}

@Injectable()
export class StatsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async overview({ hours }: { hours: number }): Promise<Overview> {
    // postgres-js bind expects a string, not a Date — coerce to ISO upfront.
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const evRow = await this.drizzle.db.execute<{
      total: string;
      ok: string;
      failed: string;
    }>(sql`
      SELECT
        coalesce(count(*), 0)::text AS total,
        coalesce(sum(case when status = 'ok' then 1 else 0 end), 0)::text AS ok,
        coalesce(sum(case when status in ('failed', 'partial') then 1 else 0 end), 0)::text AS failed
      FROM ${events}
      WHERE received_at >= ${since}
    `);
    const ev = evRow[0] ?? { total: '0', ok: '0', failed: '0' };

    const delRow = await this.drizzle.db.execute<{
      total: string;
      ok: string;
      failed: string;
      dead: string;
      avg_ms: string | null;
      p95_ms: string | null;
    }>(sql`
      SELECT
        coalesce(count(*), 0)::text AS total,
        coalesce(sum(case when status = 'ok' then 1 else 0 end), 0)::text AS ok,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::text AS failed,
        coalesce(sum(case when status = 'dead' then 1 else 0 end), 0)::text AS dead,
        avg(total_duration_ms)::text AS avg_ms,
        percentile_cont(0.95) within group (order by total_duration_ms)::text AS p95_ms
      FROM ${deliveries}
      WHERE created_at >= ${since}
    `);
    const del = delRow[0] ?? { total: '0', ok: '0', failed: '0', dead: '0', avg_ms: null, p95_ms: null };

    const sourceRows = await this.drizzle.db.execute<{
      source_id: string;
      events: string;
      ok: string;
      failed: string;
    }>(sql`
      SELECT
        source_id::text AS source_id,
        count(*)::text AS events,
        sum(case when status = 'ok' then 1 else 0 end)::text AS ok,
        sum(case when status in ('failed', 'partial') then 1 else 0 end)::text AS failed
      FROM ${events}
      WHERE received_at >= ${since}
      GROUP BY source_id
      ORDER BY count(*) DESC
      LIMIT 20
    `);

    const targetRows = await this.drizzle.db.execute<{
      target_id: string;
      total: string;
      ok: string;
      dead_or_failed: string;
      avg_ms: string | null;
    }>(sql`
      SELECT
        target_id::text AS target_id,
        count(*)::text AS total,
        sum(case when status = 'ok' then 1 else 0 end)::text AS ok,
        sum(case when status in ('failed', 'dead') then 1 else 0 end)::text AS dead_or_failed,
        avg(total_duration_ms)::text AS avg_ms
      FROM ${deliveries}
      WHERE created_at >= ${since}
      GROUP BY target_id
      ORDER BY count(*) DESC
      LIMIT 20
    `);

    const total = Number(ev.total);
    const minutes = hours * 60;
    return {
      windowHours: hours,
      events: {
        total,
        ok: Number(ev.ok),
        failed: Number(ev.failed),
        perMinute: minutes > 0 ? total / minutes : 0,
      },
      deliveries: {
        total: Number(del.total),
        ok: Number(del.ok),
        failed: Number(del.failed),
        dead: Number(del.dead),
        avgLatencyMs: del.avg_ms !== null ? Math.round(Number(del.avg_ms)) : null,
        p95LatencyMs: del.p95_ms !== null ? Math.round(Number(del.p95_ms)) : null,
      },
      bySource: sourceRows.map((r) => ({
        sourceId: r.source_id,
        events: Number(r.events),
        ok: Number(r.ok),
        failed: Number(r.failed),
      })),
      byTarget: targetRows.map((r) => ({
        targetId: r.target_id,
        deliveries: Number(r.total),
        ok: Number(r.ok),
        deadOrFailed: Number(r.dead_or_failed),
        avgLatencyMs: r.avg_ms !== null ? Math.round(Number(r.avg_ms)) : null,
      })),
    };
  }
}
