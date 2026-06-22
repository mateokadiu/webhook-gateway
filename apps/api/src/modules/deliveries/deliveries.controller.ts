import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { DeliveriesService } from './deliveries.service.js';

@Controller('deliveries')
@UseGuards(BearerGuard)
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Get()
  list(
    @Query('event_id') eventId?: string,
    @Query('target_id') targetId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      eventId,
      targetId,
      status,
      limit: Math.min(500, Number(limit) || 100),
    });
  }

  @Get(':id')
  async getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const row = await this.service.findById(id);
    if (!row) throw new NotFoundException();
    return row;
  }
}
