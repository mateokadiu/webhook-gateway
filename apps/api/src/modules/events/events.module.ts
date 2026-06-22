import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({ providers: [EventsService], controllers: [EventsController] })
export class EventsModule {}
