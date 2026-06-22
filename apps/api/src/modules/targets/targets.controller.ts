import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard } from '../../common/auth/bearer.guard.js';
import { TargetsService } from './targets.service.js';

@Controller('targets')
@UseGuards(BearerGuard)
export class TargetsController {
  constructor(private readonly service: TargetsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  async getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const row = await this.service.findById(id);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
