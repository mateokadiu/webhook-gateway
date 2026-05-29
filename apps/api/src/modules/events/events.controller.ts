import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { EventsService } from './events.service.js';

const MAX_BULK = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBulkIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') throw new BadRequestException('expected { ids: string[] }');
  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) throw new BadRequestException('ids must be an array');
  if (ids.length === 0) throw new BadRequestException('ids must be non-empty');
  if (ids.length > MAX_BULK) throw new BadRequestException(`max ${MAX_BULK} ids per request`);
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new BadRequestException(`invalid uuid: ${String(id).slice(0, 64)}`);
    }
    out.push(id);
  }
  return out;
}

@Controller('events')
@UseGuards(BearerGuard)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get()
  list(
    @Query('source_id') sourceId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      sourceId,
      status,
      q,
      limit: Math.min(500, Number(limit) || 100),
    });
  }

  // ── Bulk endpoints must come BEFORE `:id` so Nest routes them correctly ──

  @Post('bulk/replay')
  @HttpCode(200)
  async bulkReplay(@Body() body: unknown) {
    return this.service.bulkReplay(parseBulkIds(body));
  }

  @Post('bulk/tombstone')
  @HttpCode(200)
  async bulkTombstone(@Body() body: unknown) {
    return this.service.bulkTombstone(parseBulkIds(body));
  }

  @Get(':id')
  async getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const row = await this.service.findById(id);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Post(':id/replay')
  @HttpCode(200)
  async replay(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.replay(id);
  }
}
