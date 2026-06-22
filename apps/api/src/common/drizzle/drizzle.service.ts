import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../../config/env.schema.js';
import * as schema from '../../drizzle/schema.js';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private client!: ReturnType<typeof postgres>;
  public db!: PostgresJsDatabase<typeof schema>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    this.client = postgres(this.config.get('DATABASE_URL', { infer: true }), { max: 10 });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end({ timeout: 5 });
  }
}
