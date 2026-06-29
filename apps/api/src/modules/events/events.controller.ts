import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { EventsService } from './events.service.js';

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
