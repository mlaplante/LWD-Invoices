import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processRecurringInvoices } from "@/inngest/functions/recurring-invoices";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processRecurringInvoices],
});
