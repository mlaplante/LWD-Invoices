import { put } from "@vercel/blob";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "png";
  const blob = await put(`logos/${orgId}/logo.${ext}`, file, {
    access: "public",
    allowOverwrite: true,
  });

  await db.organization.update({
    where: { id: orgId },
    data: { logoUrl: blob.url },
  });

  return NextResponse.json({ url: blob.url });
}
