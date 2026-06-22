import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = header.slice('Bearer '.length);
    const expected = this.config.get('ADMIN_BEARER', { infer: true });
    if (!timingSafeEqual(token, expected)) throw new UnauthorizedException();
    return true;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
