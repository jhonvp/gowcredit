import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { z } from 'zod';
import type {
  ExtractDocumentJob,
  JobQueuePort,
  ReceivedJob,
} from '../../application/ports/job-queue.port';

const jobSchema = z.object({
  type: z.literal('extract-document'),
  caseId: z.string().uuid(),
  documentId: z.string().uuid(),
});

/**
 * SQS adapter (ADR 0006). Messages carry ids only, never document data. A malformed message is
 * deleted (logged by the worker) instead of poisoning the queue; retries and the DLQ handle errors.
 */
export class SqsJobQueue implements JobQueuePort {
  private url: Promise<string> | null = null;

  constructor(
    private readonly queueName: string,
    private readonly client: SQSClient = new SQSClient({}),
  ) {}

  private queueUrl(): Promise<string> {
    this.url ??= this.client
      .send(new GetQueueUrlCommand({ QueueName: this.queueName }))
      .then((r) => r.QueueUrl as string);
    return this.url;
  }

  async send(job: ExtractDocumentJob): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: await this.queueUrl(), MessageBody: JSON.stringify(job) }),
    );
  }

  async receive(max: number, waitSeconds: number): Promise<ReceivedJob[]> {
    const out = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: await this.queueUrl(),
        MaxNumberOfMessages: Math.min(10, max),
        WaitTimeSeconds: waitSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    const jobs: ReceivedJob[] = [];
    for (const m of out.Messages ?? []) {
      const parsed = jobSchema.safeParse(safeJson(m.Body));
      if (!parsed.success) {
        await this.ack(m.ReceiptHandle as string);
        continue;
      }
      jobs.push({
        job: parsed.data,
        receipt: m.ReceiptHandle as string,
        attempts: Number(m.Attributes?.ApproximateReceiveCount ?? 1),
      });
    }
    return jobs;
  }

  async ack(receipt: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: await this.queueUrl(), ReceiptHandle: receipt }),
    );
  }

  /** Local only (AWS_BOOTSTRAP=true): create the queue if Floci does not have it yet. */
  async ensureQueue(visibilityTimeoutSeconds: number): Promise<void> {
    await this.client.send(
      new CreateQueueCommand({
        QueueName: this.queueName,
        Attributes: { VisibilityTimeout: String(visibilityTimeoutSeconds) },
      }),
    );
    this.url = null;
  }
}

function safeJson(s: string | undefined): unknown {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return undefined;
  }
}
