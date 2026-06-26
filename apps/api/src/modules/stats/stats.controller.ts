import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { StatsService } from './stats.service.js';

@Controller('stats')
@UseGuards(BearerGuard)
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get()
  overview(@Query('hours') hours?: string) {
    return this.service.overview({ hours: Math.min(168, Number(hours) || 24) });
  }
}
