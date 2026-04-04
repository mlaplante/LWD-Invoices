import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { uploadReceipt } from "@/lib/supabase-storage";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedOrg();
    if (isAuthError(auth)) return auth;
    const { orgId } = auth;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const result = await uploadReceipt(orgId, file);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[receipt upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
