import { router } from "../trpc";
import { organizationRouter } from "./organization";
import { clientsRouter } from "./clients";
import { currenciesRouter } from "./currencies";
import { taxesRouter } from "./taxes";
import { itemsRouter } from "./items";
import { invoicesRouter } from "./invoices";
import { partialPaymentsRouter } from "./partialPayments";
import { gatewaySettingsRouter } from "./gatewaySettings";
import { commentsRouter } from "./comments";
import { portalRouter } from "./portal";
import { projectsRouter } from "./projects";
import { milestonesRouter } from "./milestones";
import { tasksRouter } from "./tasks";
import { taskStatusesRouter } from "./taskStatuses";
import { projectTemplatesRouter } from "./projectTemplates";
import { timeEntriesRouter } from "./timeEntries";
import { timersRouter } from "./timers";
import { expensesRouter } from "./expenses";
import { expenseCategoriesRouter } from "./expenseCategories";
import { expenseSuppliersRouter } from "./expenseSuppliers";
import { expenseBudgetsRouter } from "./expenseBudgets";
import { mileageRouter } from "./mileage";
import { timesheetsRouter } from "./timesheets";
import { recurringInvoicesRouter } from "./recurringInvoices";
import { reportsRouter } from "./reports";
import { creditNotesRouter } from "./creditNotes";
import { attachmentsRouter } from "./attachments";
import { notificationsRouter } from "./notifications";
import { auditLogRouter } from "./auditLog";
import { ticketsRouter } from "./tickets";
import { discussionsRouter } from "./discussions";
import { proposalTemplatesRouter } from "./proposal-templates";
import { proposalsRouter } from "./proposals";
import { recurringExpensesRouter } from "./recurringExpenses";
import { contractorsRouter } from "./contractors";
import { teamRouter } from "./team";
import { emailAutomationsRouter } from "./emailAutomations";
import { automationRulesRouter } from "./automationRules";
import { lateFeesRouter } from "./lateFees";
import { hoursRetainersRouter } from "./hoursRetainers";
import { retainersRouter } from "./retainers";
import { scheduledReportsRouter } from "./scheduledReports";
import { reminderSequencesRouter } from "./reminderSequences";
import { dashboardRouter } from "./dashboard";
import { searchRouter } from "./search";
import { exportsRouter } from "./exports";
import { fxRouter } from "./fx";
import { clientCheckInsRouter } from "./clientCheckIns";
import { checkInTemplatesRouter } from "./checkInTemplates";
import { analyticsRouter } from "./analytics";
import { assistantRouter } from "./assistant";
import { contractorPortalRouter } from "./contractor-portal";
import { collectionsRouter } from "./collections";
import { invoiceReviewRouter } from "./invoiceReview";
import { disputesRouter } from "./disputes";
import { refundsRouter } from "./refunds";
import { monthEndCloseRouter } from "./monthEndClose";
import { dashboardLayoutRouter } from "./dashboardLayout";
import { paymentReconciliationRouter } from "./paymentReconciliation";
import { replyTriageRouter } from "./replyTriage";

export const appRouter = router({
  dashboard: dashboardRouter,
  dashboardLayout: dashboardLayoutRouter,
  paymentReconciliation: paymentReconciliationRouter,
  replyTriage: replyTriageRouter,
  analytics: analyticsRouter,
  assistant: assistantRouter,
  contractorPortal: contractorPortalRouter,
  collections: collectionsRouter,
  invoiceReview: invoiceReviewRouter,
  disputes: disputesRouter,
  refunds: refundsRouter,
  monthEndClose: monthEndCloseRouter,
  search: searchRouter,
  organization: organizationRouter,
  clients: clientsRouter,
  currencies: currenciesRouter,
  taxes: taxesRouter,
  items: itemsRouter,
  invoices: invoicesRouter,
  partialPayments: partialPaymentsRouter,
  gatewaySettings: gatewaySettingsRouter,
  comments: commentsRouter,
  portal: portalRouter,
  projects: projectsRouter,
  milestones: milestonesRouter,
  tasks: tasksRouter,
  taskStatuses: taskStatusesRouter,
  projectTemplates: projectTemplatesRouter,
  timeEntries: timeEntriesRouter,
  timers: timersRouter,
  expenses: expensesRouter,
  expenseCategories: expenseCategoriesRouter,
  expenseSuppliers: expenseSuppliersRouter,
  expenseBudgets: expenseBudgetsRouter,
  mileage: mileageRouter,
  timesheets: timesheetsRouter,
  recurringInvoices: recurringInvoicesRouter,
  reports: reportsRouter,
  creditNotes: creditNotesRouter,
  attachments: attachmentsRouter,
  notifications: notificationsRouter,
  auditLog: auditLogRouter,
  tickets: ticketsRouter,
  discussions: discussionsRouter,
  proposalTemplates: proposalTemplatesRouter,
  proposals: proposalsRouter,
  recurringExpenses: recurringExpensesRouter,
  contractors: contractorsRouter,
  team: teamRouter,
  emailAutomations: emailAutomationsRouter,
  automationRules: automationRulesRouter,
  lateFees: lateFeesRouter,
  hoursRetainers: hoursRetainersRouter,
  retainers: retainersRouter,
  scheduledReports: scheduledReportsRouter,
  reminderSequences: reminderSequencesRouter,
  exports: exportsRouter,
  fx: fxRouter,
  clientCheckIns: clientCheckInsRouter,
  checkInTemplates: checkInTemplatesRouter,
});

export type AppRouter = typeof appRouter;
