import { router } from "../trpc";
import { clientsRouter } from "./clients";
import { currenciesRouter } from "./currencies";
import { taxesRouter } from "./taxes";
import { itemsRouter } from "./items";

export const appRouter = router({
  clients: clientsRouter,
  currencies: currenciesRouter,
  taxes: taxesRouter,
  items: itemsRouter,
});

export type AppRouter = typeof appRouter;
