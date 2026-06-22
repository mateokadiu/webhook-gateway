import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DrizzleService } from '../../common/drizzle/drizzle.service.js';
import { PluginRegistryService } from '../../common/plugins/plugin-registry.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly plugins: PluginRegistryService,
  ) {}

  @Get()
  async check(): Promise<{
    status: 'ok';
    db: 'ok' | 'error';
    plugins: { id: string }[];
    uptimeSec: number;
  }> {
    let db: 'ok' | 'error' = 'ok';
    try {
      await this.drizzle.db.execute(sql`select 1`);
    } catch {
      db = 'error';
    }
    return {
      status: 'ok',
      db,
      plugins: this.plugins.list(),
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
