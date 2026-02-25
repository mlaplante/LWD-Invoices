import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

const BUCKET = "logos";
const RECEIPTS_BUCKET = "receipts";

function getClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadLogo(orgId: string, file: File): Promise<string> {
  const supabase = getClient();

  // Create the bucket if it doesn't exist yet (idempotent)
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
  });
  // Ignore "already exists" error
  if (bucketError && !bucketError.message.includes("already exists")) {
    throw bucketError;
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `${orgId}/logo.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const ALLOWED_RECEIPT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadReceipt(
  orgId: string,
  file: File
): Promise<{ url: string; error?: never } | { url?: never; error: string }> {
  if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
    return { error: "Invalid file type. Allowed: PNG, JPEG, WebP, GIF, PDF" };
  }
  if (file.size > MAX_RECEIPT_SIZE) {
    return { error: "File too large (max 10 MB)" };
  }

  const supabase = getClient();

  const { error: bucketError } = await supabase.storage.createBucket(RECEIPTS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_RECEIPT_SIZE,
    allowedMimeTypes: ALLOWED_RECEIPT_TYPES,
  });
  if (bucketError && !bucketError.message.includes("already exists")) {
    throw bucketError;
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
