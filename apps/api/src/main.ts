import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 10 * 1024 * 1024 }),
    { bufferLogs: true, rawBody: true },
  );
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: ['in/(.*)'] });

  await app.register(fastifyCors as never, { origin: true, credentials: false });

  const port = Number(process.env.API_PORT ?? 5001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
