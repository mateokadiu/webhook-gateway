import { Module } from '@nestjs/common';
import { ProcessorModule } from '../processor/processor.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({
  imports: [ProcessorModule],
  providers: [DeliveriesService],
  controllers: [DeliveriesController],
})
export class DeliveriesModule {}
