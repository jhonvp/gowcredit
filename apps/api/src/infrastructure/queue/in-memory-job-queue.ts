import type {
  ExtractDocumentJob,
  JobQueuePort,
  ReceivedJob,
} from '../../application/ports/job-queue.port';

/** Test double and `QUEUE_DRIVER=memory` adapter: delivers each job until acked. */
export class InMemoryJobQueue implements JobQueuePort {
  private seq = 0;
  readonly pending = new Map<string, { job: ExtractDocumentJob; attempts: number }>();

  async send(job: ExtractDocumentJob): Promise<void> {
    this.pending.set(String(++this.seq), { job, attempts: 0 });
  }

  async receive(max: number): Promise<ReceivedJob[]> {
    return [...this.pending.entries()].slice(0, max).map(([receipt, p]) => {
      p.attempts++;
      return { job: p.job, receipt, attempts: p.attempts };
    });
  }

  async ack(receipt: string): Promise<void> {
    this.pending.delete(receipt);
  }
}
