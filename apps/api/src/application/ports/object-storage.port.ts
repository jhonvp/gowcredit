/** Where uploaded documents live (S3 in AWS, Floci locally). ADR 0006. */
export interface ObjectStoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

export const OBJECT_STORAGE_PORT = Symbol('ObjectStoragePort');
