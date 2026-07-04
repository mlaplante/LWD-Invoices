import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { PrismaClient } from "@/generated/prisma";
import {
  getProfitAndLoss,
  getExpenseLedger,
  getPaymentLedger,
  getTaxLiability,
  getArAgingSnapshot,
} from "./year-end-reports";
import {
  plToCsv,
  expensesToCsv,
  paymentsToCsv,
  taxToCsv,
  agingToCsv,
} from "./year-end-csv";
import {
  renderPLPdf,
  renderExpensePdf,
  renderPaymentPdf,
  renderTaxPdf,
  renderAgingPdf,
} from "./year-end-pdf";

/**
 * Year-end ZIP export as a background job. Rendering 5 PDFs + zipping is the
 * most CPU-heavy request in the app and can outlive a serverless timeout on a
 * large org, so the Inngest job builds the archive and drops it in a private
 * bucket; the browser polls a status route and downloads via signed URL.
 *
 * Job state lives in storage itself (no schema change): `<jobId>.zip` present
 * means ready, `<jobId>.error.json` means failed, neither means pending.
 */

const BUCKET = "year-end-exports";
const SIGNED_URL_TTL_SECONDS = 60 * 5;

function getStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Year-end exports require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = getStorageClient();
  // Financial exports: private bucket, served through short-lived signed URLs.
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.includes("already exists")) throw error;
  bucketEnsured = true;
}

// Paths are org-scoped so the status route can only ever sign URLs inside the
// caller's own org prefix. jobId is validated as a UUID at the API edge.
const zipPath = (orgId: string, jobId: string) => `${orgId}/${jobId}.zip`;
const errorPath = (orgId: string, jobId: string) => `${orgId}/${jobId}.error.json`;

/** Build the full year-end archive (5 CSVs + 5 PDFs). Shared by the job and the synchronous route. */
export async function buildYearEndZip(db: PrismaClient, orgId: string, year: number): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;

  const [plData, expensesData, paymentsData, taxData, agingData] = await Promise.all([
    getProfitAndLoss(db, orgId, year),
    getExpenseLedger(db, orgId, year),
    getPaymentLedger(db, orgId, year),
    getTaxLiability(db, orgId, year),
    getArAgingSnapshot(db, orgId, year),
  ]);

  const [plPdf, expensesPdf, paymentsPdf, taxPdf, agingPdf] = await Promise.all([
    renderPLPdf(plData as never, year),
    renderExpensePdf(expensesData as never, year),
    renderPaymentPdf(paymentsData as never, year),
    renderTaxPdf(taxData as never, year),
    renderAgingPdf(agingData as never, year),
  ]);

  const zip = new JSZip();
  zip.file(`pl-${year}.csv`, plToCsv(plData as never));
  zip.file(`pl-${year}.pdf`, plPdf);
  zip.file(`expenses-${year}.csv`, expensesToCsv(expensesData as never));
  zip.file(`expenses-${year}.pdf`, expensesPdf);
  zip.file(`payments-${year}.csv`, paymentsToCsv(paymentsData as never));
  zip.file(`payments-${year}.pdf`, paymentsPdf);
  zip.file(`tax-liability-${year}.csv`, taxToCsv(taxData as never));
  zip.file(`tax-liability-${year}.pdf`, taxPdf);
  zip.file(`ar-aging-${year}.csv`, agingToCsv(agingData as never));
  zip.file(`ar-aging-${year}.pdf`, agingPdf);

  return zip.generateAsync({ type: "uint8array" });
}

export async function uploadYearEndZip(orgId: string, jobId: string, zip: Uint8Array): Promise<void> {
  await ensureBucket();
  const supabase = getStorageClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(zipPath(orgId, jobId), zip, { contentType: "application/zip", upsert: true });
  if (error) throw new Error(`year-end zip upload failed: ${error.message}`);
}

export async function markYearEndJobFailed(orgId: string, jobId: string, message: string): Promise<void> {
  await ensureBucket();
  const supabase = getStorageClient();
  await supabase.storage
    .from(BUCKET)
    .upload(errorPath(orgId, jobId), JSON.stringify({ message }), {
      contentType: "application/json",
      upsert: true,
    });
}

export type YearEndJobStatus =
  | { status: "ready"; url: string }
  | { status: "failed" }
  | { status: "pending" };

export async function getYearEndJobStatus(orgId: string, jobId: string): Promise<YearEndJobStatus> {
  await ensureBucket();
  const supabase = getStorageClient();

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(zipPath(orgId, jobId), SIGNED_URL_TTL_SECONDS, {
      download: true,
    });
  if (signed?.signedUrl) return { status: "ready", url: signed.signedUrl };

  const { data: errorFile } = await supabase.storage.from(BUCKET).download(errorPath(orgId, jobId));
  if (errorFile) return { status: "failed" };

  return { status: "pending" };
}
