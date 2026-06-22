import { Controller, HttpCode, Param, Post, Req, Res, type RawBodyRequest } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IngressService } from './ingress.service.js';

// Bare path — NOT under /api. main.ts excludes /in/(.*) from the global prefix.
@Controller('in')
export class IngressController {
  constructor(private readonly ingress: IngressService) {}

  @Post(':source')
  @HttpCode(200)
  async ingestRoot(
    @Param('source') source: string,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.handle(source, null, req, reply);
  }

  @Post(':source/:topic')
  @HttpCode(200)
  async ingestWithTopic(
    @Param('source') source: string,
    @Param('topic') topic: string,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.handle(source, topic, req, reply);
  }

  private async handle(
    source: string,
    topic: string | null,
    req: RawBodyRequest<FastifyRequest>,
    reply: FastifyReply,
  ) {
    const raw = req.rawBody ?? Buffer.alloc(0);
    const body = typeof raw === 'string' ? Buffer.from(raw, 'utf-8') : raw;

    const result = await this.ingress.accept(source, topic, body, req.headers);
    switch (result.kind) {
      case 'ok':
        return { eventId: result.eventId };
      case 'unknown_source':
        reply.status(404);
        return { error: 'unknown_source' };
      case 'disabled':
        reply.status(503);
        return { error: 'source_disabled' };
      case 'plugin_missing':
        reply.status(503);
        return { error: 'plugin_not_loaded', pluginId: result.pluginId };
      case 'invalid_signature':
        reply.status(401);
        return { error: 'invalid_signature' };
      case 'duplicate':
        reply.status(409);
        return { error: 'duplicate', eventId: result.eventId };
      case 'too_large':
        reply.status(413);
        return { error: 'body_too_large', sizeBytes: result.sizeBytes };
    }
  }
}
