import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { Env } from '../../config/env.schema.js';

export const EVENTS_QUEUE = Symbol('EVENTS_QUEUE');
export const REDIS_OPTIONS = Symbol('REDIS_OPTIONS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ConnectionOptions => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          host: url.hostname,
          port: Number(url.port) || 6379,
          ...(url.password ? { password: url.password } : {}),
          ...(url.username ? { username: url.username } : {}),
          maxRetriesPerRequest: null,
        };
      },
    },
    {
      provide: EVENTS_QUEUE,
      inject: [REDIS_OPTIONS],
      useFactory: (connection: ConnectionOptions): Queue =>
        new Queue('events', {
          connection,
          defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
        }),
    },
  ],
  exports: [REDIS_OPTIONS, EVENTS_QUEUE],
})
export class QueueModule {}
