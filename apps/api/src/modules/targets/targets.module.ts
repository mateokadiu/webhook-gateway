import { Module } from '@nestjs/common';
import { TargetsController } from './targets.controller.js';
import { TargetsService } from './targets.service.js';

@Module({ providers: [TargetsService], controllers: [TargetsController] })
export class TargetsModule {}
