import { Module } from '@nestjs/common';
import { IngressController } from './ingress.controller.js';
import { IngressService } from './ingress.service.js';

@Module({
  providers: [IngressService],
  controllers: [IngressController],
})
export class IngressModule {}
