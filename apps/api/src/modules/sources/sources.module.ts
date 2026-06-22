import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller.js';
import { SourcesService } from './sources.service.js';

@Module({ providers: [SourcesService], controllers: [SourcesController] })
export class SourcesModule {}
