import type { ObjectStoragePort } from '../../application/ports/object-storage.port';

/** Test double and `STORAGE_DRIVER=memory` adapter. */
export class InMemoryObjectStorage implements ObjectStoragePort {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body: new Uint8Array(body), contentType });
  }

  async get(key: string): Promise<Uint8Array> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`No object at ${key}`);
    return o.body;
  }
}
