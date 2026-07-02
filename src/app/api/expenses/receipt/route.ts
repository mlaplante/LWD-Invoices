import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { uploadReceipt } from "@/lib/supabase-storage";
import { getAppUrl } from "@/lib/app-url";
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
    if (result.path === undefined) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // The receipts bucket is private; hand back an app URL that resolves to a
    // short-lived signed URL after an org-membership check.
    const appUrl = await getAppUrl();
    const url = `${appUrl}/api/receipts/view?path=${encodeURIComponent(result.path)}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[receipt upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
