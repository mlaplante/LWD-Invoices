import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processRecurringInvoices } from "@/inngest/functions/recurring-invoices";
import { processOverdueInvoices } from "@/inngest/functions/overdue-invoices";
import { processPaymentReminders } from "@/inngest/functions/payment-reminders";
import { cleanupPendingUsers } from "@/inngest/functions/cleanup-pending-users";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processRecurringInvoices, processOverdueInvoices, processPaymentReminders, cleanupPendingUsers],
});
