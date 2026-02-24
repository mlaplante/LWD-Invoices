import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

const BUCKET = "logos";

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
