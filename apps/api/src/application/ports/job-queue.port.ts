/** Work queue between the API and the extraction worker (SQS in AWS, Floci locally). ADR 0006. */
export interface ExtractDocumentJob {
  type: 'extract-document';
  caseId: string;
  documentId: string;
}

export interface ReceivedJob {
  job: ExtractDocumentJob;
  /** Opaque handle used to acknowledge (delete) the message. */
  receipt: string;
  /** How many times this message was delivered (redrive to the DLQ is the queue's job). */
  attempts: number;
}

export interface JobQueuePort {
  send(job: ExtractDocumentJob): Promise<void>;
  /** Long-polls for up to `max` jobs. */
  receive(max: number, waitSeconds: number): Promise<ReceivedJob[]>;
  ack(receipt: string): Promise<void>;
}

export const JOB_QUEUE_PORT = Symbol('JobQueuePort');
