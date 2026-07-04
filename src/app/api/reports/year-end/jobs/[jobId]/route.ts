import { NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { getYearEndJobStatus } from "@/server/services/year-end-export-job";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Poll a year-end export job. Job state lives in the private storage bucket
 * (zip present = ready, error marker = failed); the lookup is scoped to the
 * caller's org prefix, so a jobId can never reach another tenant's archive.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "invalid jobId" }, { status: 400 });
  }

  const status = await getYearEndJobStatus(orgId, jobId);
  return NextResponse.json(status);
}
