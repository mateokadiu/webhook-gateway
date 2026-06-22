import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({ providers: [DeliveriesService], controllers: [DeliveriesController] })
export class DeliveriesModule {}
