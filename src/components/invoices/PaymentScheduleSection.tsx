"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CalendarRange, X } from "lucide-react";
import { PaymentScheduleDialog, type PartialPaymentEntry } from "./PaymentScheduleDialog";

type Props = {
  schedule: PartialPaymentEntry[];
  setSchedule: React.Dispatch<React.SetStateAction<PartialPaymentEntry[]>>;
  depositEnabled: boolean;
  setDepositEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  depositPercent: number;
  onDepositToggle: (enabled: boolean) => void;
  onDepositPercentChange: (percent: number) => void;
  scheduleOpen: boolean;
  setScheduleOpen: React.Dispatch<React.SetStateAction<boolean>>;
  invoiceTotal: number;
  dueDate: string | null | undefined;
  currencySymbol: string;
  currencySymbolPosition: string;
  installmentAutoChargeEnabled: boolean;
  setInstallmentAutoChargeEnabled: (enabled: boolean) => void;
};

export function PaymentScheduleSection({
  schedule,
  setSchedule,
  depositEnabled,
  setDepositEnabled,
  depositPercent,
  onDepositToggle,
  onDepositPercentChange,
  scheduleOpen,
  setScheduleOpen,
  invoiceTotal,
  dueDate,
  currencySymbol,
  currencySymbolPosition,
  installmentAutoChargeEnabled,
  setInstallmentAutoChargeEnabled,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Payment Schedule</h3>
        {schedule.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {schedule.length} payment{schedule.length !== 1 ? "s" : ""} scheduled
            <button
              type="button"
              onClick={() => { setSchedule([]); setDepositEnabled(false); }}
              className="ml-0.5 hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
      </div>

      {/* Deposit toggle — visible when no custom schedule or deposit is active */}
      {(schedule.length === 0 || depositEnabled) && (
        <div className="flex items-center gap-3">
          <Switch
            checked={depositEnabled}
            onCheckedChange={onDepositToggle}
          />
          <span className="text-sm">Require deposit</span>
          {depositEnabled && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={99}
                value={depositPercent}
                onChange={(e) => onDepositPercentChange(Number(e.target.value) || 50)}
                className="w-16 h-8 text-sm"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setScheduleOpen(true)}
      >
        <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
        {schedule.length > 0 ? "Edit Schedule" : "Set Up Payment Schedule"}
      </Button>
      {schedule.length > 0 && (
        <label className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
          <Switch checked={installmentAutoChargeEnabled} onCheckedChange={setInstallmentAutoChargeEnabled} />
          <span className="text-sm">Auto-charge installments <span className="block text-xs text-muted-foreground">Each installment is charged to the client&apos;s saved card on its due date. Requires autopay and a saved payment method.</span></span>
        </label>
      )}
      <PaymentScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        invoiceTotal={invoiceTotal}
        invoiceDueDate={dueDate ?? null}
        currencySymbol={currencySymbol}
        currencySymbolPosition={currencySymbolPosition}
        existingSchedule={schedule}
        onSave={(s) => {
          setSchedule(s);
          setDepositEnabled(false);
          setScheduleOpen(false);
        }}
      />
    </div>
  );
}
