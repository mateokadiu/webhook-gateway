import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions } from 'bullmq';
import { REDIS_OPTIONS } from '../../common/queue/queue.module.js';
import { DELIVERIES_QUEUE_NAME, ProcessorService } from './processor.service.js';

const EVENTS_QUEUE_NAME = 'events';

@Injectable()
export class ProcessorWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ProcessorWorker.name);
  private eventsWorker: Worker | null = null;
  private deliveriesWorker: Worker | null = null;

  constructor(
    private readonly processor: ProcessorService,
    @Inject(REDIS_OPTIONS) private readonly connection: ConnectionOptions,
  ) {}

  onModuleInit(): void {
    // The PLAN-locked decision: same process, worker-mode toggle. When the
    // env is set to api-only, skip starting workers so the api pod stays
    // ack-fast and a dedicated worker pod handles the queue.
    if (process.env['WORKER_MODE'] === 'off') {
      this.log.log('WORKER_MODE=off — skipping in-process workers');
      return;
    }

    this.eventsWorker = new Worker(
      EVENTS_QUEUE_NAME,
      async (job) => {
        const { eventId } = job.data as { eventId: string };
        await this.processor.processEvent(eventId);
      },
      { connection: this.connection, concurrency: 16 },
    );
    this.eventsWorker.on('failed', (job, err) =>
      this.log.error({ jobId: job?.id, err: err?.message }, 'events worker failed'),
    );

    this.deliveriesWorker = new Worker(
      DELIVERIES_QUEUE_NAME,
      async (job) => {
        const { deliveryId } = job.data as { deliveryId: string };
        const { requeueDelayMs } = await this.processor.processDelivery(deliveryId);
        if (requeueDelayMs !== null) {
          // Re-enqueue with delay — BullMQ's own retry semantics work too,
          // but we want explicit control over the schedule from target config.
          await this.processor.getDeliveriesQueue().add(
            'deliver',
            { deliveryId },
            { delay: requeueDelayMs, jobId: `${deliveryId}:${Date.now()}` },
          );
        }
      },
      { connection: this.connection, concurrency: 32 },
    );
    this.deliveriesWorker.on('failed', (job, err) =>
      this.log.error({ jobId: job?.id, err: err?.message }, 'deliveries worker failed'),
    );

    this.log.log('in-process workers started (events + deliveries)');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.eventsWorker?.close(), this.deliveriesWorker?.close()]);
  }
}
