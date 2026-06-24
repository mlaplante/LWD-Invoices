const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export const SAFE_IMAGE_MIME_TYPES = [...IMAGE_TYPES] as const;
export const SAFE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const SAFE_TEXT_MIME_TYPES = ["text/plain"] as const;

export type SafeUploadMimeType =
  | (typeof SAFE_IMAGE_MIME_TYPES)[number]
  | (typeof SAFE_DOCUMENT_MIME_TYPES)[number]
  | (typeof SAFE_TEXT_MIME_TYPES)[number];

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "text/plain":
      return "txt";
    default:
      return "bin";
  }
}

export function matchesDeclaredMimeType(bytes: Uint8Array, declaredType: string): boolean {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);

  switch (declaredType) {
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith([0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
    case "application/msword":
      return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
    case "text/plain":
      return isSafePlainText(bytes);
    default:
      return false;
  }
}

export async function readValidatedFile(
  file: Pick<File, "arrayBuffer" | "type">,
  allowedTypes: readonly string[],
): Promise<{ ok: true; arrayBuffer: ArrayBuffer } | { ok: false; error: string }> {
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, error: "Invalid file type" };
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!matchesDeclaredMimeType(new Uint8Array(arrayBuffer), file.type)) {
    return { ok: false, error: "File content does not match its declared type" };
  }

  return { ok: true, arrayBuffer };
}

function isSafePlainText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }

  return !/^\s*<(?:!doctype\s+html|html\b|script\b|svg\b)/i.test(text);
}
