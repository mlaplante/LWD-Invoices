import { router } from "../trpc";
import { clientsRouter } from "./clients";
import { currenciesRouter } from "./currencies";
import { taxesRouter } from "./taxes";
import { itemsRouter } from "./items";
import { invoicesRouter } from "./invoices";
import { partialPaymentsRouter } from "./partialPayments";

export const appRouter = router({
  clients: clientsRouter,
  currencies: currenciesRouter,
  taxes: taxesRouter,
  items: itemsRouter,
  invoices: invoicesRouter,
  partialPayments: partialPaymentsRouter,
});

export type AppRouter = typeof appRouter;
