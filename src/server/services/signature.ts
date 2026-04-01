import { createHash } from "crypto";
import { encryptJson, decryptJson } from "./encryption";

export const SIGNATURE_MAX_LENGTH = 500_000;

export function hashDocument(sections: Array<{ key: string; title: string; content: string }>): string {
  const canonical = JSON.stringify(sections.map((s) => ({ key: s.key, title: s.title, content: s.content })));
  return createHash("sha256").update(canonical).digest("hex");
}

export function hashSignature(signatureData: string): string {
  return createHash("sha256").update(signatureData).digest("hex");
}

export function validateSignatureData(data: string): boolean {
  if (!data || data.length === 0) return false;
  if (data.length > SIGNATURE_MAX_LENGTH) return false;
  const isDataUrl = /^data:image\/(png|jpeg|svg\+xml);base64,/.test(data);
  const isSvgPath = /^[MLCQSTAZHVmlcqstahvz0-9\s.,\-]+$/.test(data);
  return isDataUrl || isSvgPath;
}

export function encryptSignature(signatureData: string): string {
  return encryptJson({ data: signatureData });
}

export function decryptSignature(encrypted: string): string {
  const result = decryptJson<{ data: string }>(encrypted);
  return result.data;
}
