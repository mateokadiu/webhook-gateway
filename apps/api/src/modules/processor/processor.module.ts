import { Module } from '@nestjs/common';
import { DeliveryClient } from './delivery.client.js';
import { ProcessorService } from './processor.service.js';
import { ProcessorWorker } from './processor.worker.js';

@Module({
  providers: [DeliveryClient, ProcessorService, ProcessorWorker],
  exports: [ProcessorService],
})
export class ProcessorModule {}
