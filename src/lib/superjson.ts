import superjson from "superjson";
import { Decimal } from "@prisma/client-runtime-utils";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registered = true;
  superjson.registerCustom<Decimal, string>(
    {
      isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
      serialize: (v) => v.toJSON(),
      deserialize: (v) => new Decimal(v),
    },
    "prisma.decimal",
  );
}

ensureRegistered();

export { superjson };
export default superjson;
