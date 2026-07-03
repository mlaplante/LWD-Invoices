import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  extensionForMimeType,
  readValidatedFile,
  SAFE_DOCUMENT_MIME_TYPES,
  SAFE_IMAGE_MIME_TYPES,
  SAFE_TEXT_MIME_TYPES,
} from "@/lib/file-validation";

const BUCKET = "attachments";

function getClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// Attachments contain financial PII (invoices, client docs), so the bucket is
// PRIVATE and files are served through short-lived signed URLs. A bucket
// created public by an earlier deploy is flipped private here.
async function ensureBucket() {
  const supabase = getClient();
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error) {
    if (!error.message.includes("already exists")) throw error;
    const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
      public: false,
    });
    if (updateError) throw updateError;
  }
}

// Strip path separators and traversal sequences so a caller-supplied filename
// can never escape the intended pathname prefix in the storage bucket.
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const withoutExtension = base.replace(/\.[^.]*$/, "");
  const cleaned = withoutExtension.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "file";
}

function sanitizePathname(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => segment.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, ""))
    .filter(Boolean)
    .join("/");
}

export async function uploadFile(
  filename: string,
  file: Pick<File, "arrayBuffer" | "type">,
  pathname: string,
  allowedTypes: readonly string[] = [
    ...SAFE_IMAGE_MIME_TYPES,
    ...SAFE_DOCUMENT_MIME_TYPES,
    ...SAFE_TEXT_MIME_TYPES,
  ],
): Promise<{ path: string }> {
  await ensureBucket();
  const supabase = getClient();

  const validated = await readValidatedFile(file, allowedTypes);
  if (!validated.ok) throw new Error(validated.error);

  const safeName = sanitizeFilename(filename);
  const safePathname = sanitizePathname(pathname);
  const ext = extensionForMimeType(file.type);
  const path = `${safePathname}/${crypto.randomUUID()}-${safeName}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, validated.arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  return { path };
}

// Attachment rows created before the private-bucket change store a full
// Supabase public URL; newer rows store the bare storage path. Normalize both
// to a path, or null for values that don't belong to our bucket.
export function storagePathFromUrl(storageUrlOrPath: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = storageUrlOrPath.indexOf(marker);
  if (idx !== -1) return storageUrlOrPath.slice(idx + marker.length);
  if (/^https?:\/\//.test(storageUrlOrPath)) return null;
  return storageUrlOrPath;
}

/**
 * Mint a short-lived signed URL for a stored attachment. Returns null if the
 * stored value can't be resolved to a path or Supabase declines.
 */
export async function createAttachmentSignedUrl(
  storageUrlOrPath: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const path = storagePathFromUrl(storageUrlOrPath);
  if (!path) return null;

  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteFile(storageUrlOrPath: string): Promise<void> {
  const path = storagePathFromUrl(storageUrlOrPath);
  if (!path) return; // Value doesn't match our bucket; skip

  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
