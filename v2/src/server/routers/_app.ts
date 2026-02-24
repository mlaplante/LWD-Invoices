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
});

export type AppRouter = typeof appRouter;
