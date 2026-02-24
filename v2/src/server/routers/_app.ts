import { router } from "../trpc";
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

export const appRouter = router({
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
});

export type AppRouter = typeof appRouter;
