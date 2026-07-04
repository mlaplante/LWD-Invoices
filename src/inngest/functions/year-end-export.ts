import { inngest } from "../client";
import { db } from "@/server/db";
import {
  buildYearEndZip,
  uploadYearEndZip,
  markYearEndJobFailed,
} from "@/server/services/year-end-export-job";

/**
 * Build a year-end ZIP export (5 CSVs + 5 PDFs) off the request path.
 *
 * Triggered by `org/year-end-export.requested` { orgId, year, jobId } from
 * POST /api/reports/year-end/jobs. The browser polls the job route until the
 * archive lands in storage, then downloads via signed URL — so the heaviest
 * CPU work in the app never races a serverless request timeout.
 */
export const processYearEndExport = inngest.createFunction(
  {
    id: "year-end-export",
    name: "Year-End Export",
    retries: 1,
    triggers: [{ event: "org/year-end-export.requested" }],
  },
  async ({ event, step }) => {
    const { orgId, year, jobId } = event.data as { orgId: string; year: number; jobId: string };

    try {
      await step.run("build-and-upload", async () => {
        const zip = await buildYearEndZip(db, orgId, year);
        await uploadYearEndZip(orgId, jobId, zip);
      });
      return { jobId, status: "ready" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await markYearEndJobFailed(orgId, jobId, message).catch(() => {});
      throw error;
    }
  },
);
