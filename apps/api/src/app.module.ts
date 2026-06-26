import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { envSchema } from './config/env.schema.js';
import { DrizzleModule } from './common/drizzle/drizzle.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { PluginRegistryModule } from './common/plugins/plugin-registry.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IngressModule } from './modules/ingress/ingress.module.js';
import { SourcesModule } from './modules/sources/sources.module.js';
import { TargetsModule } from './modules/targets/targets.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { DeliveriesModule } from './modules/deliveries/deliveries.module.js';
import { ProcessorModule } from './modules/processor/processor.module.js';
import { StatsModule } from './modules/stats/stats.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => envSchema.parse(raw),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        redact: { paths: ['req.headers.authorization', '*.signing_secret'], remove: true },
      },
    }),
    DrizzleModule,
    QueueModule,
    PluginRegistryModule,
    HealthModule,
    IngressModule,
    SourcesModule,
    TargetsModule,
    EventsModule,
    DeliveriesModule,
    ProcessorModule,
    StatsModule,
  ],
})
export class AppModule {}
