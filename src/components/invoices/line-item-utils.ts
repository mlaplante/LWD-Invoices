import { LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  type TaxInput,
} from "@/server/services/tax-calculator";
import type { LineItemValue } from "./LineItemEditor";

export type TaxOption = {
  id: string;
  name: string;
  rate: number;
  isCompound: boolean;
};

export function computeLineResult(line: LineItemValue, taxes: TaxOption[]) {
  const taxInputs: TaxInput[] = taxes
    .filter((t) => line.taxIds.includes(t.id))
    .map((t) => ({ id: t.id, rate: t.rate, isCompound: t.isCompound }));
  return calculateLineTotals(
    {
      qty: line.qty,
      rate: line.rate,
      period: line.period,
      lineType: line.lineType,
      discount: line.discount,
      discountIsPercentage: line.discountIsPercentage,
      taxIds: line.taxIds,
    },
    taxInputs,
  );
}

export function newLine(sort: number): LineItemValue {
  return {
    sort,
    lineType: LineType.STANDARD,
    name: "",
    qty: 1,
    rate: 0,
    discount: 0,
    discountIsPercentage: false,
    taxIds: [],
  };
}
