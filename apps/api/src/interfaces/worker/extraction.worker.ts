import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { JOB_QUEUE_PORT, type JobQueuePort } from '../../application/ports/job-queue.port';
import { LOGGER_PORT, type LoggerPort } from '../../application/ports/logger.port';
import { ProcessDocumentUseCase } from '../../application/use-cases/process-document.use-case';

const WAIT_SECONDS = 10;

/**
 * SQS consumer loop (one message at a time; scale out with more worker tasks). A job is acked only
 * after it was processed; on error it is left for redelivery and, after maxReceiveCount, the DLQ.
 */
@Injectable()
export class ExtractionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
    private readonly process: ProcessDocumentUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
    this.logger.info('extraction worker started', {});
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  /** Processes whatever is available once; returns how many jobs were handled. Used by tests. */
  async drain(max = 10): Promise<number> {
    const jobs = await this.queue.receive(max, 0);
    for (const j of jobs) await this.handle(j.job, j.receipt, j.attempts);
    return jobs.length;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const jobs = await this.queue.receive(1, WAIT_SECONDS);
        for (const j of jobs) await this.handle(j.job, j.receipt, j.attempts);
      } catch (e) {
        this.logger.error('queue receive failed', { error: (e as Error).name });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private async handle(
    job: Parameters<ProcessDocumentUseCase['execute']>[0],
    receipt: string,
    attempts: number,
  ): Promise<void> {
    try {
      const result = await this.process.execute(job);
      await this.queue.ack(receipt);
      this.logger.info('job done', { caseId: job.caseId, result, attempts });
    } catch (e) {
      this.logger.error('job failed; left for redelivery', {
        caseId: job.caseId,
        attempts,
        error: (e as Error).name,
      });
    }
  }
}
