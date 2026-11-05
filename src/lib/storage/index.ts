import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * Object storage for website media.
 *
 * - Production: S3-compatible storage (Railway Buckets, Cloudflare R2, AWS S3, ...)
 *   configured with S3_* environment variables. Railway's application filesystem is
 *   temporary, so production never falls back to local disk.
 * - Development: a local folder (MEDIA_LOCAL_DIR, default ./.data/media) when S3 is
 *   not configured, so the media library can be tried without a bucket.
 * - Tests: an in-memory store via setTestStorage().
 */
export interface ObjectStore {
  name: "s3" | "local" | "memory";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Image storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for Railway or R2) to enable uploads.");
    this.name = "StorageNotConfiguredError";
  }
}

function safeKey(key: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

class S3Store implements ObjectStore {
  name = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client>;
  constructor(private cfg: NonNullable<typeof env.s3>) {
    this.clientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        }),
    );
  }
  private prefixed(key: string) {
    const p = (process.env.S3_KEY_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
    return p ? `${p}/${safeKey(key)}` : safeKey(key);
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: this.prefixed(key), Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.prefixed(key) }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.prefixed(key) }));
  }
  async deletePrefix(prefix: string) {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    let token: string | undefined;
    do {
      const list = await client.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: this.prefixed(prefix), ContinuationToken: token }));
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: this.cfg.bucket, Delete: { Objects: keys, Quiet: true } }));
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
}

class LocalStore implements ObjectStore {
  name = "local" as const;
  constructor(private root: string) {}
  private file(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
  async deletePrefix(prefix: string) {
    await fs.rm(path.join(this.root, safeKey(prefix.replace(/\/$/, ""))), { recursive: true, force: true });
  }
}

export class MemoryStore implements ObjectStore {
  name = "memory" as const;
  objects = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(safeKey(key), { body, contentType });
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async deletePrefix(prefix: string) {
    for (const k of [...this.objects.keys()]) if (k.startsWith(prefix)) this.objects.delete(k);
  }
}

let testStore: ObjectStore | null = null;
export function setTestStorage(store: ObjectStore | null) {
  testStore = store;
}

let cached: ObjectStore | null | undefined;

/** Returns the configured store, or null when uploads are not possible (production without S3). */
export function getStorage(): ObjectStore | null {
  if (testStore) return testStore;
  if (cached !== undefined) return cached;
  if (env.s3) cached = new S3Store(env.s3);
  else if (!env.isProduction) cached = new LocalStore(path.resolve(process.env.MEDIA_LOCAL_DIR ?? ".data/media"));
  else cached = null;
  return cached;
}

export function requireStorage(): ObjectStore {
  const s = getStorage();
  if (!s) throw new StorageNotConfiguredError();
  return s;
}

export function storageStatus(): { configured: boolean; driver: string } {
  const s = getStorage();
  return { configured: Boolean(s), driver: s?.name ?? "none" };
}
