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

async function ensureBucket() {
  const supabase = getClient();
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  // Ignore "already exists" error
  if (error && !error.message.includes("already exists")) throw error;
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
): Promise<{ url: string }> {
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

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function deleteFile(storageUrl: string): Promise<void> {
  const supabase = getClient();

  // Extract path from Supabase public URL:
  // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = storageUrl.indexOf(marker);
  if (idx === -1) return; // URL doesn't match expected format; skip

  const path = storageUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
