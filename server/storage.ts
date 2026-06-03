// Cloudflare R2 storage (S3-compatible)
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getR2Client(): S3Client {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = ENV;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error("R2 storage not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

function getBucket(): string {
  const bucket = ENV.r2BucketName;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured");
  return bucket;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getR2Client();
  const bucket = getBucket();
  const key = appendHashSuffix(normalizeKey(relKey));

  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return { key, url: `/r2-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/r2-storage/${key}` };
}

export async function storageDelete(relKey: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const client = getR2Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  // Signed URL valid for 1 hour
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
