import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import R2_CONFIG from "@/lib/r2-config.local";

let cachedClient = null;

function getRequiredValue(name, value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`missing_env_${name}`);
  }
  return normalized;
}

function getRequiredConfig(name) {
  const value = R2_CONFIG?.[name];
  if (!value) {
    throw new Error(`missing_env_${name}`);
  }
  return getRequiredValue(name, value);
}

function getR2Config() {
  return {
    bucket: getRequiredConfig("bucket"),
    publicBase: getRequiredConfig("publicBase").replace(/\/+$/, ""),
    endpoint: getRequiredConfig("endpoint"),
    accessKeyId: getRequiredConfig("accessKeyId"),
    secretAccessKey: getRequiredConfig("secretAccessKey"),
    token: String(R2_CONFIG?.token || "").trim() || undefined,
  };
}

export function getR2ConfigStatus() {
  const values = {
    R2_BUCKET: String(R2_CONFIG?.bucket || "").trim(),
    R2_PUBLIC_BASE: String(R2_CONFIG?.publicBase || "").trim(),
    R2_ENDPOINT: String(R2_CONFIG?.endpoint || "").trim(),
    R2_ACCESS_KEY_ID: String(R2_CONFIG?.accessKeyId || "").trim(),
    R2_SECRET_ACCESS_KEY: String(R2_CONFIG?.secretAccessKey || "").trim(),
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    ok: missing.length === 0,
    missing,
    configured: {
      bucket: values.R2_BUCKET || null,
      endpoint: values.R2_ENDPOINT || null,
      publicBase: values.R2_PUBLIC_BASE || null,
      hasAccessKeyId: Boolean(values.R2_ACCESS_KEY_ID),
      hasSecretAccessKey: Boolean(values.R2_SECRET_ACCESS_KEY),
      hasToken: Boolean(String(R2_CONFIG?.token || "").trim()),
    },
  };
}

function getR2Client() {
  if (cachedClient) {
    return cachedClient;
  }

  const cfg = getR2Config();
  cachedClient = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      sessionToken: cfg.token,
    },
  });

  return cachedClient;
}

function buildPublicUrl(publicBase, key) {
  const encodedKey = encodeURI(String(key || "")).replace(/%2F/g, "/");
  return `${publicBase}/${encodedKey}`;
}

export async function uploadFileToR2({ key, file, contentType, cacheControl }) {
  if (!key || !file || typeof file.arrayBuffer !== "function") {
    throw new Error("invalid_upload_payload");
  }

  const cfg = getR2Config();
  const client = getR2Client();
  const body = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      CacheControl: cacheControl || undefined,
    })
  );

  return {
    key,
    url: buildPublicUrl(cfg.publicBase, key),
  };
}

export async function deleteFileFromR2(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    throw new Error("invalid_delete_key");
  }

  const cfg = getR2Config();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: normalizedKey,
    })
  );

  return {
    key: normalizedKey,
    url: buildPublicUrl(cfg.publicBase, normalizedKey),
  };
}

export async function checkR2Connection() {
  const cfg = getR2Config();
  const client = getR2Client();
  await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));

  return {
    bucket: cfg.bucket,
    endpoint: cfg.endpoint,
    publicBase: cfg.publicBase,
  };
}
