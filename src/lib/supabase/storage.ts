import { createAdminClient } from "./admin";
import { readValidatedFile } from "@/lib/file-validation";

const BUCKET = "proposals";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function uploadProposalFile(
  orgId: string,
  invoiceId: string,
  file: File
): Promise<{ path: string; fileName: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only PDF and DOCX files are allowed");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File must be under 10MB");
  }

  const validated = await readValidatedFile(file, ALLOWED_TYPES);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const supabase = createAdminClient();
  // Whitelist the extension instead of trusting the client-supplied filename,
  // since `file.name` flows directly into the storage path below.
  const ext = file.type === "application/pdf" ? "pdf" : "docx";
  const storagePath = `${orgId}/${invoiceId}/proposal.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, validated.arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { path: storagePath, fileName: file.name };
}

export async function deleteProposalFile(path: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("Failed to delete proposal file:", error.message);
}

export async function getProposalFileSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}
