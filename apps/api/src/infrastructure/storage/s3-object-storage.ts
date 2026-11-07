import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStoragePort } from '../../application/ports/object-storage.port';

/**
 * S3 adapter (ADR 0006). Locally it talks to Floci: the SDK reads AWS_ENDPOINT_URL, and path-style
 * addressing avoids bucket DNS names. In AWS the bucket comes from Terraform (SSE-KMS, no public access).
 */
export class S3ObjectStorage implements ObjectStoragePort {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({ forcePathStyle: true }),
  ) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error(`Empty object at ${key}`);
    return out.Body.transformToByteArray();
  }

  /** Local only (AWS_BOOTSTRAP=true): create the bucket if Floci does not have it yet. */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}
