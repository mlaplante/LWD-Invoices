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
import { teamRouter } from "./team";
import { emailAutomationsRouter } from "./emailAutomations";
import { lateFeesRouter } from "./lateFees";
import { retainersRouter } from "./retainers";
import { scheduledReportsRouter } from "./scheduledReports";
import { reminderSequencesRouter } from "./reminderSequences";
import { dashboardRouter } from "./dashboard";

export const appRouter = router({
  dashboard: dashboardRouter,
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
  team: teamRouter,
  emailAutomations: emailAutomationsRouter,
  lateFees: lateFeesRouter,
  retainers: retainersRouter,
  scheduledReports: scheduledReportsRouter,
  reminderSequences: reminderSequencesRouter,
});

export type AppRouter = typeof appRouter;
