import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { SourcesService } from './sources.service.js';

@Controller('sources')
@UseGuards(BearerGuard)
export class SourcesController {
  constructor(private readonly service: SourcesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':slug')
  async getOne(@Param('slug') slug: string) {
    const row = await this.service.findBySlug(slug);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    return this.service.update(slug, body);
  }

  @Delete(':slug')
  remove(@Param('slug') slug: string) {
    return this.service.remove(slug);
  }
}
