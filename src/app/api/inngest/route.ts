import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processRecurringInvoices } from "@/inngest/functions/recurring-invoices";
import { processOverdueInvoices } from "@/inngest/functions/overdue-invoices";
import { processPaymentReminders } from "@/inngest/functions/payment-reminders";
import { cleanupPendingUsers } from "@/inngest/functions/cleanup-pending-users";
import { processRecurringExpenses } from "@/inngest/functions/recurring-expenses";
import { processEmailAutomations } from "@/inngest/functions/email-automations";
import { handleAutomationEvent } from "@/inngest/functions/email-automation-events";
import { processLateFees } from "@/inngest/functions/late-fees";
import { processScheduledReports } from "@/inngest/functions/scheduled-reports";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processRecurringInvoices, processOverdueInvoices, processPaymentReminders, cleanupPendingUsers, processRecurringExpenses, processEmailAutomations, handleAutomationEvent, processLateFees, processScheduledReports],
});
