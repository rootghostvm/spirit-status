import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim(),
  );
}

export function getR2ObjectKey() {
  return (process.env.R2_OBJECT_KEY?.trim() || "store.json").replace(
    /^\//,
    "",
  );
}

let client: S3Client | null = null;

function getClient() {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }
  if (!client) {
    const accountId = process.env.R2_ACCOUNT_ID!.trim();
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
      },
    });
  }
  return client;
}

async function streamToString(body: {
  transformToString?: () => Promise<string>;
} | AsyncIterable<Uint8Array> | undefined) {
  if (!body) return "";
  if ("transformToString" in body && typeof body.transformToString === "function") {
    return body.transformToString();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readR2Object(): Promise<string | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET!.trim(),
        Key: getR2ObjectKey(),
      }),
    );
    const text = await streamToString(res.Body);
    return text || null;
  } catch (error) {
    const err = error as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

export async function writeR2Object(body: string) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!.trim(),
      Key: getR2ObjectKey(),
      Body: body,
      ContentType: "application/json",
    }),
  );
}
