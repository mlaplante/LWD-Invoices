"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useTransition,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InvoiceType } from "@/generated/prisma";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HelpCircle } from "lucide-react";
import { LineItemEditor, type LineItemValue } from "./LineItemEditor";
import { InvoiceMetadata } from "./InvoiceMetadata";
import { PaymentScheduleSection } from "./PaymentScheduleSection";
import {
  calculateInvoiceTotalsWithDiscount,
  type TaxInput,
} from "@/server/services/tax-calculator";
import { trpc } from "@/trpc/client";
import { type PartialPaymentEntry } from "./PaymentScheduleDialog";
import { InvoiceDraftQA } from "./InvoiceDraftQA";
import { CreateFromPromptPanel } from "./CreateFromPromptPanel";
import { ReminderOverrideBlock } from "./ReminderOverrideBlock";
import { InvoiceCanvasView } from "./canvas/InvoiceCanvasView";
import { useInvoiceAutosave } from "./canvas/useInvoiceAutosave";
import { buildCanvasTheme } from "./canvas/canvas-theme";
import { resolveSaveTarget } from "./canvas/autosave-core";
import type { InvoiceTemplateConfig } from "@/server/services/invoice-template-config";

export type InvoiceFormData = {
  id?: string;
  type: InvoiceType;
  date: string;
  dueDate?: string;
  currencyId: string;
  number?: string;
  notes?: string;
  clientId: string;
  lines: LineItemValue[];
  reminderDaysOverride: number[];
  partialPayments?: PartialPaymentEntry[];
  installmentAutoChargeEnabled?: boolean;
  discountType?: "percentage" | "fixed" | null;
  discountAmount?: number;
  discountDescription?: string;
};

type Props = {
  mode: "create" | "edit";
  initialData?: Partial<InvoiceFormData>;
  orgPaymentTermsDays: number;
  orgDefaultDepositPercent: number | null;
  clients: {
    id: string;
    name: string;
    defaultPaymentTermsDays: number | null;
  }[];
  currencies: {
    id: string;
    code: string;
    symbol: string;
    symbolPosition: string;
  }[];
  taxes: { id: string; name: string; rate: number; isCompound: boolean }[];
  invoiceStatus: "DRAFT" | "SENT";
  templateConfig: InvoiceTemplateConfig;
  orgDisplay: { name: string; logoUrl: string | null };
};

export function InvoiceForm({
  mode,
  initialData,
  orgPaymentTermsDays,
  orgDefaultDepositPercent,
  clients,
  currencies,
  taxes,
  invoiceStatus,
  templateConfig,
  orgDisplay,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const savingRef = useRef(false);

  const [view, setView] = useState<"form" | "canvas">("form");
  useEffect(() => {
    const stored = window.localStorage.getItem("invoice-editor-view");
    if (stored === "canvas") setView("canvas");
  }, []);
  function switchView(v: "form" | "canvas") {
    setView(v);
    window.localStorage.setItem("invoice-editor-view", v);
  }

  const defaultCurrency = currencies[0];

  const [form, setForm] = useState<InvoiceFormData>({
    type: InvoiceType.DETAILED,
    date: initialData?.date ?? "",
    dueDate: "",
    currencyId: defaultCurrency?.id ?? "",
    clientId: "",
    notes: "",
    lines: [],
    reminderDaysOverride: initialData?.reminderDaysOverride ?? [],
    ...initialData,
  });

  const [useCustomReminders, setUseCustomReminders] = useState(
    (initialData?.reminderDaysOverride?.length ?? 0) > 0,
  );

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<PartialPaymentEntry[]>(
    initialData?.partialPayments ?? [],
  );

  const [depositEnabled, setDepositEnabled] = useState(() => {
    if (mode === "edit") return false;
    return orgDefaultDepositPercent !== null;
  });
  const [depositPercent, setDepositPercent] = useState(
    orgDefaultDepositPercent ?? 50,
  );

  const activeCurrency =
    currencies.find((c) => c.id === form.currencyId) ?? defaultCurrency;

  // Stable across renders so memoized line-item rows don't re-render every keystroke.
  const taxOptions = useMemo(
    () =>
      taxes.map((t) => ({
        id: t.id,
        name: t.name,
        rate: Number(t.rate),
        isCompound: t.isCompound,
      })),
    [taxes],
  );

  const taxInputs: TaxInput[] = taxOptions;

  const invoiceTotals = calculateInvoiceTotalsWithDiscount(
    form.lines.map((l) => ({
      qty: l.qty,
      rate: l.rate,
      period: l.period,
      lineType: l.lineType,
      discount: l.discount,
      discountIsPercentage: l.discountIsPercentage,
      taxIds: l.taxIds,
    })),
    taxInputs,
    form.discountType ?? null,
    form.discountAmount ?? 0,
  );

  const sym = activeCurrency?.symbol ?? "$";
  const symPos = activeCurrency?.symbolPosition ?? "before";
  const fmt = (n: number) =>
    symPos === "before" ? `${sym}${n.toFixed(2)}` : `${n.toFixed(2)}${sym}`;

  const createMutation = trpc.invoices.create.useMutation();
  const updateMutation = trpc.invoices.update.useMutation();
  const draftFromPromptMutation = trpc.invoices.draftFromPrompt.useMutation();
  const { data: aiCapabilities } = trpc.organization.aiCapabilities.useQuery();
  const utils = trpc.useUtils();
  const [naturalPrompt, setNaturalPrompt] = useState("");
  const [naturalDraftReview, setNaturalDraftReview] = useState<{
    ambiguities: { field: string; message: string }[];
    lineWarnings: string[];
  } | null>(null);
  const [naturalDraftInfo, setNaturalDraftInfo] = useState<string | null>(null);
  const { data: stripeTaxPreflight } =
    trpc.organization.stripeTaxPreflight.useQuery(
      { clientId: form.clientId || undefined },
      { staleTime: 30_000 },
    );

  // Non-blocking duplicate guard: once a client + a non-zero total are present,
  // check for a recent same-client invoice with a near-identical amount so a
  // double-bill is caught before sending. Never gates submission.
  const duplicateTotal = Math.round(invoiceTotals.total * 100) / 100;
  const { data: duplicateCheck } = trpc.invoices.checkDuplicate.useQuery(
    {
      clientId: form.clientId,
      amount: duplicateTotal,
      excludeInvoiceId: form.id,
    },
    {
      enabled: Boolean(form.clientId) && duplicateTotal > 0,
      staleTime: 15_000,
    },
  );
  const duplicateMatch = duplicateCheck?.matches[0];

  function calcDueDate(invoiceDate: string, termsDays: number): string {
    if (termsDays === 0) return invoiceDate;
    const due = new Date(invoiceDate);
    due.setDate(due.getDate() + termsDays);
    return due.toISOString().slice(0, 10);
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    const termsDays = client?.defaultPaymentTermsDays ?? orgPaymentTermsDays;
    setForm((p) => ({
      ...p,
      clientId,
      dueDate: calcDueDate(p.date, termsDays),
    }));
  }

  function handleDateChange(newDate: string) {
    setForm((p) => {
      if (!p.clientId) return { ...p, date: newDate };
      const client = clients.find((c) => c.id === p.clientId);
      const termsDays = client?.defaultPaymentTermsDays ?? orgPaymentTermsDays;
      return { ...p, date: newDate, dueDate: calcDueDate(newDate, termsDays) };
    });
  }

  async function handleNaturalDraft() {
    const prompt = naturalPrompt.trim();
    if (!prompt) return;

    try {
      const draft = await draftFromPromptMutation.mutateAsync({ prompt });
      if (draft.unavailable) {
        setNaturalDraftReview(null);
        setNaturalDraftInfo(draft.message);
        return;
      }
      setNaturalDraftInfo(null);
      setForm((current) => ({
        ...current,
        type: InvoiceType.DETAILED,
        currencyId: draft.currencyId || current.currencyId,
        clientId: draft.clientId ?? current.clientId,
        dueDate: draft.dueDate ?? current.dueDate,
        notes: draft.notes ?? current.notes,
        lines: draft.lines.map((line) => ({
          sort: line.sort,
          lineType: line.lineType,
          name: line.name,
          description: line.description ?? undefined,
          qty: Number(line.qty),
          rate: Number(line.rate),
          period:
            line.period === null || line.period === undefined
              ? undefined
              : Number(line.period),
          discount: Number(line.discount),
          discountIsPercentage: line.discountIsPercentage,
          taxIds: line.taxIds,
          sourceTable: line.sourceTable ?? undefined,
          sourceId: line.sourceId ?? undefined,
        })),
      }));
      setNaturalDraftReview({
        ambiguities: draft.ambiguities,
        lineWarnings: draft.lines.flatMap((line) => line.warnings ?? []),
      });
      toast.success(
        "Draft invoice created. Review and edit before saving or sending.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create draft from prompt",
      );
    }
  }

  function applyDepositSchedule(percent: number, dueDate: string | undefined) {
    setSchedule([
      {
        sortOrder: 0,
        amount: percent,
        isPercentage: true,
        dueDate: "",
        notes: "Deposit — due on receipt",
      },
      {
        sortOrder: 1,
        amount: 100 - percent,
        isPercentage: true,
        dueDate: dueDate || "",
        notes: "Balance",
      },
    ]);
  }

  function handleDepositToggle(enabled: boolean) {
    setDepositEnabled(enabled);
    if (enabled) {
      applyDepositSchedule(depositPercent, form.dueDate);
    } else {
      setSchedule([]);
    }
  }

  function handleDepositPercentChange(percent: number) {
    setDepositPercent(percent);
    if (depositEnabled) {
      applyDepositSchedule(percent, form.dueDate);
    }
  }

  // Default the date to "today" on the client only, so SSR and first client
  // render agree (avoids a hydration mismatch around the UTC date boundary).
  useEffect(() => {
    if (mode === "create" && !form.date) {
      setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didInitDeposit = useRef(false);
  useEffect(() => {
    if (
      mode === "create" &&
      depositEnabled &&
      schedule.length === 0 &&
      !didInitDeposit.current
    ) {
      didInitDeposit.current = true;
      applyDepositSchedule(depositPercent, form.dueDate);
    }
  }, [depositEnabled, depositPercent, form.dueDate, mode, schedule.length]);

  function buildInput() {
    return {
      type: form.type,
      date: new Date(form.date),
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      currencyId: form.currencyId,
      clientId: form.clientId,
      notes: form.notes || undefined,
      reminderDaysOverride: form.reminderDaysOverride,
      discountType: form.discountType ?? null,
      discountAmount: form.discountAmount ?? 0,
      discountDescription: form.discountDescription || undefined,
      installmentAutoChargeEnabled:
        schedule.length > 0
          ? (form.installmentAutoChargeEnabled ?? false)
          : false,
      partialPayments:
        schedule.length > 0
          ? schedule.map((s) => ({
              sortOrder: s.sortOrder,
              amount: s.amount,
              isPercentage: s.isPercentage,
              dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
              notes: s.notes || undefined,
            }))
          : undefined,
      lines: form.lines.map((l, idx) => ({
        sort: idx,
        lineType: l.lineType,
        name: l.name,
        description: l.description || undefined,
        qty: l.qty,
        rate: l.rate,
        period: l.period,
        discount: l.discount,
        discountIsPercentage: l.discountIsPercentage,
        taxIds: l.taxIds,
        sourceTable: l.sourceTable,
        sourceId: l.sourceId,
      })),
    };
  }

  async function copyPrevious() {
    if (!form.clientId) return;
    const prev = await utils.invoices.lastForClient.fetch({
      clientId: form.clientId,
    });
    if (!prev) {
      toast.error("No previous invoice for this client");
      return;
    }
    setForm((f) => ({
      ...f,
      type: prev.type,
      currencyId: prev.currencyId,
      notes: prev.notes ?? f.notes,
      lines: prev.lines,
    }));
    toast.success("Copied from previous invoice");
  }

  function handleSave(andSend = false) {
    if (savingRef.current) return;
    savingRef.current = true;
    startTransition(async () => {
      try {
        // mode is a static page prop that never changes, but autosave can
        // have already created the DRAFT out from under it (it sets
        // invoiceIdRef.current / form.id via window.history.replaceState
        // without remounting). Resolve the target via the ref-first id
        // source so an explicit Save after an autosave-create updates the
        // existing draft instead of creating a duplicate invoice.
        const target = resolveSaveTarget({
          mode,
          refId: invoiceIdRef.current,
          formId: form.id,
        });
        if (target.action === "create") {
          const inv = await createMutation.mutateAsync(buildInput());
          // Set synchronously so a subsequent explicit Save click (or a
          // queued autosave re-run) sees "has an id" before the setForm
          // below has committed — same race autosave's onCreated guards
          // against.
          invoiceIdRef.current = inv.id;
          router.push(
            andSend ? `/invoices/${inv.id}?send=1` : `/invoices/${inv.id}`,
          );
        } else if (target.action === "update") {
          const inv = await updateMutation.mutateAsync({
            id: target.id,
            ...buildInput(),
          });
          router.push(
            andSend ? `/invoices/${inv.id}?send=1` : `/invoices/${inv.id}`,
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save invoice",
        );
      } finally {
        savingRef.current = false;
      }
    });
  }

  // The autosave hook can invoke doUpdate immediately after a create resolves
  // (a queued re-run), before React has committed the setForm from onCreated
  // — so doUpdate must not rely on form.id alone. invoiceIdRef is set
  // synchronously in onCreated (before setForm) and kept in sync whenever
  // form.id changes, so doUpdate always has the freshest id available.
  // handleSave (above) shares this ref for the same reason: it's also the
  // ref-first id source for the duplicate-create fix (Critical 1).
  const invoiceIdRef = useRef(form.id);
  useEffect(() => {
    invoiceIdRef.current = form.id;
  }, [form.id]);

  const autosave = useInvoiceAutosave({
    invoiceStatus,
    clientId: form.clientId,
    currencyId: form.currencyId,
    preflightBlocked: stripeTaxPreflight?.ok === false,
    invoiceId: form.id,
    // form.id is excluded: it's not part of the write payload (buildInput()
    // never includes it — doUpdate passes it separately), and including it
    // here would make the id assigned by onCreated itself look like a new
    // edit, firing a spurious update right after every autosave create.
    snapshot: JSON.stringify({ form: { ...form, id: undefined }, schedule }),
    doCreate: async () => {
      // handleSave and autosave share the create/update mutations. Without
      // this guard, an explicit Save click in flight and a debounced
      // autosave firing in the same window can both see "no id yet" and
      // both call create, producing a duplicate invoice.
      if (savingRef.current) throw new Error("explicit save in progress");
      const inv = await createMutation.mutateAsync(buildInput());
      return { id: inv.id };
    },
    doUpdate: async () => {
      if (savingRef.current) throw new Error("explicit save in progress");
      const id = invoiceIdRef.current ?? form.id;
      if (!id) throw new Error("no invoice id");
      const inv = await updateMutation.mutateAsync({ id, ...buildInput() });
      return { id: inv.id };
    },
    onCreated: (id) => {
      invoiceIdRef.current = id;
      setForm((f) => ({ ...f, id }));
      window.history.replaceState(null, "", `/invoices/${id}/edit`);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDraftingFromPrompt = draftFromPromptMutation.isPending;
  const activeClient = clients.find((client) => client.id === form.clientId);
  const qaDraft = useMemo(
    () => ({
      type: form.type,
      date: form.date,
      dueDate: form.dueDate || null,
      currencyId: form.currencyId,
      number: form.number ?? null,
      notes: form.notes ?? null,
      clientId: form.clientId || null,
      lines: form.lines.map((line, index) => ({
        clientLineId: line.id ?? `draft-line-${index}`,
        persistedLineId: line.id ?? null,
        sort: index,
        lineType: line.lineType,
        name: line.name,
        description: line.description ?? null,
        qty: line.qty,
        rate: line.rate,
        period: line.period ?? null,
        discount: line.discount,
        discountIsPercentage: line.discountIsPercentage,
        taxIds: line.taxIds,
        sourceTable: line.sourceTable ?? null,
        sourceId: line.sourceId ?? null,
      })),
      discountType: form.discountType ?? null,
      discountAmount: form.discountAmount ?? 0,
      discountDescription: form.discountDescription ?? null,
      partialPayments: schedule.map((entry) => ({
        sortOrder: entry.sortOrder,
        amount: entry.amount,
        isPercentage: entry.isPercentage,
        dueDate: entry.dueDate || null,
        label: entry.notes ?? null,
      })),
    }),
    [form, schedule],
  );

  // Extracted so the identical JSX can be reused verbatim in both the form
  // branch (unchanged position) and the canvas view's side rail — no
  // behavior or markup difference, just avoiding duplication.
  const createFromPromptSection = (
    <CreateFromPromptPanel
      mode={mode}
      aiEnabled={aiCapabilities?.aiEnabled}
      naturalPrompt={naturalPrompt}
      setNaturalPrompt={setNaturalPrompt}
      onDraft={handleNaturalDraft}
      isDrafting={isDraftingFromPrompt}
      review={naturalDraftReview}
      info={naturalDraftInfo}
    />
  );

  const paymentScheduleSection = (
    <PaymentScheduleSection
      schedule={schedule}
      setSchedule={setSchedule}
      depositEnabled={depositEnabled}
      setDepositEnabled={setDepositEnabled}
      depositPercent={depositPercent}
      onDepositToggle={handleDepositToggle}
      onDepositPercentChange={handleDepositPercentChange}
      scheduleOpen={scheduleOpen}
      setScheduleOpen={setScheduleOpen}
      invoiceTotal={invoiceTotals.total}
      dueDate={form.dueDate}
      currencySymbol={sym}
      currencySymbolPosition={symPos}
      installmentAutoChargeEnabled={form.installmentAutoChargeEnabled ?? false}
      setInstallmentAutoChargeEnabled={(installmentAutoChargeEnabled) =>
        setForm((current) => ({ ...current, installmentAutoChargeEnabled }))
      }
    />
  );

  const draftQASection = (
    <InvoiceDraftQA
      mode={mode}
      draft={qaDraft}
      calculatedTotals={invoiceTotals}
      invoiceId={form.id}
      clientId={form.clientId}
      currencyId={form.currencyId}
      clientName={activeClient?.name}
      currencyCode={activeCurrency?.code}
    />
  );

  const reminderOverrideSection = (
    <ReminderOverrideBlock
      useCustomReminders={useCustomReminders}
      setUseCustomReminders={setUseCustomReminders}
      reminderDaysOverride={form.reminderDaysOverride}
      setReminderDaysOverride={(reminderDaysOverride) =>
        setForm((p) => ({ ...p, reminderDaysOverride }))
      }
    />
  );

  const duplicateWarningSection = duplicateMatch && (
    <div
      className={`rounded-md border p-3 text-sm ${
        duplicateMatch.severity === "danger"
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">Possible duplicate invoice</p>
      <p className="mt-1">{duplicateMatch.message}</p>
      <Link
        href={`/invoices/${duplicateMatch.invoiceId}`}
        target="_blank"
        className="mt-1 inline-block font-medium underline underline-offset-2"
      >
        View {duplicateMatch.invoiceNumber}
      </Link>
    </div>
  );

  const stripeTaxWarningSection = stripeTaxPreflight && !stripeTaxPreflight.ok && (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Stripe Tax can&apos;t calculate yet</p>
      <p className="mt-1">Saving will fail until the following are filled in:</p>
      <ul className="mt-1 list-disc pl-5">
        {stripeTaxPreflight.missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* View toggle + autosave status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={view === "form" ? "default" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => switchView("form")}
          >
            Form
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "canvas" ? "default" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => switchView("canvas")}
          >
            Preview edit
          </Button>
        </div>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {autosave.status === "saving" && "Saving…"}
          {autosave.status === "pending" && "Unsaved changes"}
          {autosave.status === "saved" && "Saved"}
          {autosave.status === "error" && (
            <button
              type="button"
              onClick={autosave.retry}
              className="text-destructive underline"
            >
              Save failed — retry
            </button>
          )}
        </span>
      </div>

      {view === "form" ? (
        <>
          {createFromPromptSection}

          {/* Header fields */}
          <InvoiceMetadata
            form={form}
            setForm={setForm}
            clients={clients}
            currencies={currencies}
            onClientChange={handleClientChange}
            onDateChange={handleDateChange}
          />

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Line Items</h3>
              {mode === "create" && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={copyPrevious}
                  disabled={!form.clientId}
                  className="h-7 text-xs"
                >
                  Copy from previous
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Keyboard shortcuts"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Keyboard shortcuts</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>
                        <kbd className="rounded border px-1 text-xs font-mono">
                          Enter
                        </kbd>{" "}
                        — new row
                      </li>
                      <li>
                        <kbd className="rounded border px-1 text-xs font-mono">
                          ⌘/Ctrl+D
                        </kbd>{" "}
                        — duplicate row
                      </li>
                      <li>Drag handle or arrow keys — reorder</li>
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <LineItemEditor
              lines={form.lines}
              taxes={taxOptions}
              currencySymbol={sym}
              onChange={(lines) => setForm((f) => ({ ...f, lines }))}
            />
          </div>

          {/* Invoice-Level Discount */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Invoice Discount</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="invoice-discount-type"
                  className="text-xs text-muted-foreground"
                >
                  Discount Type
                </label>
                <Select
                  value={form.discountType ?? "none"}
                  onValueChange={(v: string) =>
                    setForm((f) => ({
                      ...f,
                      discountType:
                        v === "none" ? null : (v as "percentage" | "fixed"),
                      discountAmount: v === "none" ? 0 : (f.discountAmount ?? 0),
                    }))
                  }
                >
                  <SelectTrigger id="invoice-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Discount</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.discountType && (
                <>
                  <div className="space-y-1">
                    <label
                      htmlFor="invoice-discount-amount"
                      className="text-xs text-muted-foreground"
                    >
                      {form.discountType === "percentage"
                        ? "Percentage"
                        : "Amount"}
                    </label>
                    <Input
                      id="invoice-discount-amount"
                      type="number"
                      min={0}
                      max={form.discountType === "percentage" ? 100 : undefined}
                      step="0.01"
                      value={form.discountAmount ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          discountAmount: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder={
                        form.discountType === "percentage" ? "0-100" : "0.00"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="invoice-discount-description"
                      className="text-xs text-muted-foreground"
                    >
                      Description (optional)
                    </label>
                    <Input
                      id="invoice-discount-description"
                      value={form.discountDescription ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          discountDescription: e.target.value,
                        }))
                      }
                      placeholder="e.g. Early payment discount"
                      maxLength={200}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Schedule */}
          {paymentScheduleSection}

          {/* Invoice Draft QA */}
          {draftQASection}

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="invoice-notes" className="text-sm font-medium">
              Notes
            </label>
            <Textarea
              id="invoice-notes"
              value={form.notes ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Payment terms, bank details, thank you message…"
              rows={3}
            />
          </div>

          {reminderOverrideSection}

          {/* Totals panel */}
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 rounded-lg border p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(invoiceTotals.subtotal)}</span>
              </div>
              {invoiceTotals.discountTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-emerald-600">
                    -{fmt(invoiceTotals.discountTotal)}
                  </span>
                </div>
              )}
              {invoiceTotals.taxTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{fmt(invoiceTotals.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-base font-bold">
                <span>Total</span>
                <span>{fmt(invoiceTotals.total)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <InvoiceCanvasView
          value={form}
          onChange={setForm}
          onClientChange={handleClientChange}
          onDateChange={handleDateChange}
          clients={clients}
          currencies={currencies}
          taxes={taxOptions}
          totals={invoiceTotals}
          fmt={fmt}
          org={
            templateConfig.showLogo
              ? orgDisplay
              : { ...orgDisplay, logoUrl: null }
          }
          theme={buildCanvasTheme(templateConfig)}
          footerText={templateConfig.footerText}
          sideRail={
            <>
              {createFromPromptSection}
              {paymentScheduleSection}
              {draftQASection}
              {reminderOverrideSection}
              {duplicateWarningSection}
              {stripeTaxWarningSection}
            </>
          }
        />
      )}

      {/* Actions */}
      {currencies.length === 0 && (
        <p className="text-sm text-destructive">
          You need to{" "}
          <a href="/settings" className="underline">
            add a currency in Settings
          </a>{" "}
          before creating invoices.
        </p>
      )}
      {view === "form" && duplicateWarningSection}
      {view === "form" && stripeTaxWarningSection}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSaving}
        >
          Cancel
        </Button>
        {!(view === "canvas" && invoiceStatus === "DRAFT") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={
              isSaving ||
              !form.clientId ||
              !form.currencyId ||
              stripeTaxPreflight?.ok === false
            }
          >
            {isSaving ? "Saving…" : "Save as Draft"}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => handleSave(true)}
          disabled={
            isSaving ||
            !form.clientId ||
            !form.currencyId ||
            stripeTaxPreflight?.ok === false
          }
        >
          {isSaving ? "Saving…" : "Save & Send"}
        </Button>
      </div>
    </div>
  );
}
