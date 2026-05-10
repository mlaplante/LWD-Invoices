import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { generateInvoicePDF, type FullInvoice } from "./invoice-pdf";

const BUCKET = "invoice-pdfs";

/**
 * Cache rendered invoice PDFs in Supabase Storage, keyed by invoice id +
 * updatedAt. Cache hits skip the React-PDF render (which is CPU-heavy and
 * the slowest part of any /pdf request). On miss, render once and upload
 * the buffer for future hits.
 *
 * Invalidation is implicit: the cache key includes invoice.updatedAt, so
 * any mutation that bumps updatedAt produces a new key. Stale entries can
 * be culled via Supabase Storage lifecycle rules.
 */

function getClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("PDF cache requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = getClient();
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.includes("already exists")) throw error;
  bucketEnsured = true;
}

function cacheKey(invoice: { id: string; updatedAt: Date }): string {
  return `${invoice.id}/${invoice.updatedAt.getTime()}.pdf`;
}

export async function getOrRenderInvoicePDF(invoice: FullInvoice): Promise<Buffer> {
  // Storage misconfigured: fall back to live render so /pdf still works.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return generateInvoicePDF(invoice);
  }

  await ensureBucket();
  const supabase = getClient();
  const path = cacheKey(invoice);

  const { data: existing } = await supabase.storage.from(BUCKET).download(path);
  if (existing) {
    const arr = await existing.arrayBuffer();
    return Buffer.from(arr);
  }

  const buffer = await generateInvoicePDF(invoice);
  // Best-effort upload — never fail a download because the cache write failed.
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error) {
    console.error("[invoice-pdf-cache] upload failed:", error.message);
  }

  return buffer;
}
