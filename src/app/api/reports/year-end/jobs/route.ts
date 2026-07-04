import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { inngest } from "@/inngest/client";

/**
 * Enqueue a year-end ZIP export as a background job. Returns a jobId the
 * client polls via GET /api/reports/year-end/jobs/[jobId]?year=... — see
 * src/inngest/functions/year-end-export.ts.
 */
export async function POST(request: Request) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  let year: number | undefined;
  try {
    const body = await request.json();
    year = typeof body?.year === "number" ? body.year : parseInt(body?.year, 10);
  } catch {
    // handled below
  }
  if (year === undefined || isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "year must be an integer between 2000 and 2100" },
      { status: 400 },
    );
  }

  const jobId = randomUUID();
  await inngest.send({
    name: "org/year-end-export.requested",
    data: { orgId, year, jobId },
  });

  return NextResponse.json({ jobId });
}
