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

// ── Contractor W-9 documents ──────────────────────────────────────────────────
// W-9 forms contain SSNs/EINs, so they live in a PRIVATE bucket. Callers store
// the returned storage path (not a public URL) and serve the file through an
// authenticated route that mints a short-lived signed URL on demand.
const W9_BUCKET = "contractor-w9";
const ALLOWED_W9_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_W9_SIZE = 10 * 1024 * 1024; // 10 MB

async function ensureW9Bucket(supabase: ReturnType<typeof getClient>) {
  const { error } = await supabase.storage.createBucket(W9_BUCKET, {
    public: false,
    fileSizeLimit: MAX_W9_SIZE,
    allowedMimeTypes: ALLOWED_W9_TYPES,
  });
  if (error && !error.message.includes("already exists")) {
    throw error;
  }
}

export async function uploadW9(
  orgId: string,
  contractorId: string,
  file: File,
): Promise<{ path: string; error?: never } | { path?: never; error: string }> {
  if (!ALLOWED_W9_TYPES.includes(file.type)) {
    return { error: "Invalid file type. Allowed: PDF, PNG, JPEG, WebP" };
  }
  if (file.size > MAX_W9_SIZE) {
    return { error: "File too large (max 10 MB)" };
  }

  const supabase = getClient();
  await ensureW9Bucket(supabase);

  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${orgId}/${contractorId}/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(W9_BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) return { error: uploadError.message };

  return { path };
}

/**
 * Mint a short-lived signed URL for a stored W-9 document. Returns null if the
 * path is missing or Supabase declines (e.g. the object no longer exists).
 */
export async function createW9SignedUrl(
  path: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(W9_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
