import { put, del } from "@vercel/blob";

export async function uploadFile(
  filename: string,
  file: Blob,
  pathname: string,
): Promise<{ url: string }> {
  const blob = await put(`${pathname}/${filename}`, file, { access: "public" });
  return { url: blob.url };
}

export async function deleteFile(storageUrl: string): Promise<void> {
  await del(storageUrl);
}
