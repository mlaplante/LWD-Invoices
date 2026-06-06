/**
 * "Ask your books" assistant — an Anthropic tool-calling agent over the org's
 * data.
 *
 * Composes the existing data-access patterns + analytics cores into a chat
 * surface: "which clients owe me money?", "what was my revenue last quarter?",
 * "which invoices should I chase?", "what's my projected cash position?". The
 * agent runs a manual tool-use loop (Claude API, official SDK) where every
 * tool is READ-ONLY and org-scoped — the assistant can analyze and propose, but
 * cannot mutate data, so there's no destructive action to gate. Drafting/sending
 * still goes through the existing reviewed flows.
 *
 * The loop is intentionally bounded (MAX_ITERATIONS) and returns the final text
 * plus a trace of which tools ran, so the UI can show its work.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { db as Db } from "../db";
import {
  OPEN_STATUSES,
  toNum,
  buildClientHealthInputs,
  buildCashFlowForecastInput,
  buildCollectionRiskInputs,
} from "./analytics-data";
import { calculateClientHealthScores } from "./client-health-score";
import { projectCashFlow } from "./cash-flow-forecast";
import { prioritizeCollections } from "./collection-risk";

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1500;
const DAY_MS = 86_400_000;

export interface BooksAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BooksAssistantToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface BooksAssistantResult {
  reply: string;
  toolCalls: BooksAssistantToolCall[];
  /** True when ANTHROPIC_API_KEY is unset — caller should surface a config hint. */
  unavailable: boolean;
}

export interface BooksAssistantContext {
  db: typeof Db;
  orgId: string;
}

const SYSTEM_PROMPT = [
  "You are the books assistant for an invoicing and business-management app.",
  "You help the owner understand their accounts receivable, revenue, cash flow, client health, and collections.",
  "Answer using ONLY the data returned by the provided tools. Never invent figures, client names, or invoice numbers.",
  "When a question needs data, call the relevant tool(s) first, then answer concisely in plain language.",
  "Format money with a $ and thousands separators. Prefer short, scannable answers (a sentence plus a short list).",
  "You are read-only: you can analyze and recommend, but you cannot create, send, or change invoices.",
  "If asked to draft or send something, explain what you'd include and point the user to the relevant screen — do not claim you did it.",
  "If the data is empty or insufficient, say so plainly rather than guessing.",
].join(" ");

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_accounts_receivable",
    description:
      "List clients who currently owe money (outstanding balance on open/overdue invoices), highest balance first. Use for 'who owes me money' / 'accounts receivable' questions.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max clients to return (default 10)." } },
    },
  },
  {
    name: "get_overdue_invoices",
    description:
      "List individual overdue invoices with client, balance, and days overdue, most overdue first.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max invoices to return (default 15)." } },
    },
  },
  {
    name: "get_revenue_summary",
    description:
      "Collected revenue (actual payments received) for a period, plus the top clients by revenue in that period. Use for 'how much did I make' / 'revenue last quarter' questions.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_30_days", "last_90_days"],
          description: "Time window for collected revenue.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "get_unbilled_time",
    description:
      "Time entries that have been logged but not yet billed on an invoice (excluding retainer-covered time), grouped by project, with estimated value. Use for 'unbilled time' / 'what can I invoice' questions.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max projects to return (default 15)." } },
    },
  },
  {
    name: "get_client_health",
    description:
      "Composite client health scores (payment behavior, engagement, revenue trend, overdue pressure) with churn risk and signals. Omit clientName for the most at-risk clients; pass clientName for one client.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Optional: a specific client to score." },
        limit: { type: "integer", description: "Max clients when listing at-risk (default 8)." },
      },
    },
  },
  {
    name: "get_cash_flow_forecast",
    description:
      "Projected 30/60/90-day cash position from open AR (weighted by aging), recurring invoices, autopay, and recurring expenses.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_collections_recommendations",
    description:
      "Predictive dunning queue: open invoices ranked by late-payment risk with a recommended escalation action and tone for each. Use for 'which invoices should I chase' questions.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max invoices to return (default 10)." } },
    },
  },
];

// ─── Tool implementations ──────────────────────────────────────────────────────

function periodRange(period: string, now: Date): { start: Date; end: Date; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const q = Math.floor(m / 3);
  switch (period) {
    case "this_month":
      return { start: new Date(Date.UTC(y, m, 1)), end: now, label: "this month" };
    case "last_month":
      return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)), label: "last month" };
    case "this_quarter":
      return { start: new Date(Date.UTC(y, q * 3, 1)), end: now, label: "this quarter" };
    case "last_quarter":
      return {
        start: new Date(Date.UTC(y, q * 3 - 3, 1)),
        end: new Date(Date.UTC(y, q * 3, 1)),
        label: "last quarter",
      };
    case "this_year":
      return { start: new Date(Date.UTC(y, 0, 1)), end: now, label: "this year" };
    case "last_30_days":
      return { start: new Date(now.getTime() - 30 * DAY_MS), end: now, label: "the last 30 days" };
    case "last_90_days":
    default:
      return { start: new Date(now.getTime() - 90 * DAY_MS), end: now, label: "the last 90 days" };
  }
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

async function getAccountsReceivable(ctx: BooksAssistantContext, limit: number) {
  const invoices = await ctx.db.invoice.findMany({
    where: { organizationId: ctx.orgId, isArchived: false, status: { in: OPEN_STATUSES } },
    select: {
      total: true,
      dueDate: true,
      client: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  });
  const byClient = new Map<string, { outstanding: number; count: number; oldestDue: Date | null }>();
  for (const inv of invoices) {
    const balance = toNum(inv.total) - inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
    if (balance <= 0) continue;
    const entry = byClient.get(inv.client.name) ?? { outstanding: 0, count: 0, oldestDue: null };
    entry.outstanding += balance;
    entry.count++;
    if (inv.dueDate && (!entry.oldestDue || inv.dueDate < entry.oldestDue)) entry.oldestDue = inv.dueDate;
    byClient.set(inv.client.name, entry);
  }
  const rows = Array.from(byClient.entries())
    .map(([clientName, v]) => ({
      clientName,
      outstanding: money(v.outstanding),
      openInvoices: v.count,
      oldestDueDate: v.oldestDue?.toISOString().slice(0, 10) ?? null,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, limit);
  return {
    totalOutstanding: money(rows.reduce((s, r) => s + r.outstanding, 0)),
    clientCount: byClient.size,
    clients: rows,
  };
}

async function getOverdueInvoices(ctx: BooksAssistantContext, limit: number, now: Date) {
  const invoices = await ctx.db.invoice.findMany({
    where: {
      organizationId: ctx.orgId,
      isArchived: false,
      status: { in: OPEN_STATUSES },
      dueDate: { lt: now },
    },
    select: {
      number: true,
      total: true,
      dueDate: true,
      client: { select: { name: true } },
      payments: { select: { amount: true } },
    },
  });
  const rows = invoices
    .map((inv) => {
      const balance = toNum(inv.total) - inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
      const daysOverdue = inv.dueDate ? Math.round((now.getTime() - inv.dueDate.getTime()) / DAY_MS) : 0;
      return {
        number: inv.number,
        clientName: inv.client.name,
        balance: money(balance),
        daysOverdue,
        dueDate: inv.dueDate?.toISOString().slice(0, 10) ?? null,
      };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, limit);
  return { count: rows.length, totalOverdue: money(rows.reduce((s, r) => s + r.balance, 0)), invoices: rows };
}

async function getRevenueSummary(ctx: BooksAssistantContext, period: string, now: Date) {
  const { start, end, label } = periodRange(period, now);
  const payments = await ctx.db.payment.findMany({
    where: { organizationId: ctx.orgId, paidAt: { gte: start, lt: end } },
    select: { amount: true, invoice: { select: { client: { select: { name: true } } } } },
  });
  let collected = 0;
  const byClient = new Map<string, number>();
  for (const p of payments) {
    const amt = toNum(p.amount);
    collected += amt;
    const name = p.invoice?.client?.name ?? "Unknown client";
    byClient.set(name, (byClient.get(name) ?? 0) + amt);
  }
  const topClients = Array.from(byClient.entries())
    .map(([clientName, amt]) => ({ clientName, collected: money(amt) }))
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 5);
  return { period: label, collected: money(collected), paymentCount: payments.length, topClients };
}

async function getUnbilledTime(ctx: BooksAssistantContext, limit: number) {
  const entries = await ctx.db.timeEntry.findMany({
    where: {
      organizationId: ctx.orgId,
      invoiceLineId: null,
      retainerId: null,
      projectId: { not: null },
    },
    select: {
      minutes: true,
      project: { select: { name: true, rate: true, client: { select: { name: true } } } },
    },
  });
  const byProject = new Map<string, { clientName: string; hours: number; value: number }>();
  for (const e of entries) {
    if (!e.project) continue;
    const hours = toNum(e.minutes) / 60;
    const key = e.project.name;
    const entry = byProject.get(key) ?? { clientName: e.project.client.name, hours: 0, value: 0 };
    entry.hours += hours;
    entry.value += hours * toNum(e.project.rate);
    byProject.set(key, entry);
  }
  const rows = Array.from(byProject.entries())
    .map(([projectName, v]) => ({
      projectName,
      clientName: v.clientName,
      hours: Math.round(v.hours * 100) / 100,
      estimatedValue: money(v.value),
    }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, limit);
  return {
    totalUnbilledHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
    totalEstimatedValue: money(rows.reduce((s, r) => s + r.estimatedValue, 0)),
    projects: rows,
  };
}

async function getClientHealth(ctx: BooksAssistantContext, now: Date, clientName?: string, limit = 8) {
  const inputs = await buildClientHealthInputs(ctx.db, ctx.orgId, now);
  const scores = calculateClientHealthScores(inputs);
  if (clientName) {
    const match = scores.find((s) => s.clientName.toLowerCase() === clientName.toLowerCase())
      ?? scores.find((s) => s.clientName.toLowerCase().includes(clientName.toLowerCase()));
    if (!match) return { found: false, clientName };
    return { found: true, client: compactHealth(match) };
  }
  return { atRisk: scores.slice(0, limit).map(compactHealth) };
}

function compactHealth(s: ReturnType<typeof calculateClientHealthScores>[number]) {
  return {
    clientName: s.clientName,
    score: s.score,
    band: s.band,
    churnRiskPercent: s.churnRiskPercent,
    signals: s.signals,
  };
}

async function getCashFlowForecast(ctx: BooksAssistantContext, now: Date) {
  const input = await buildCashFlowForecastInput(ctx.db, ctx.orgId);
  const forecast = projectCashFlow(input, { now });
  return {
    startingCash: forecast.startingCash,
    horizons: forecast.horizons,
    note: "Inflows are probability-weighted by invoice aging and payment method. See assumptions.",
    assumptions: forecast.assumptions,
  };
}

async function getCollectionsRecommendations(ctx: BooksAssistantContext, now: Date, limit: number) {
  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { smartRemindersThreshold: true },
  });
  const threshold = org?.smartRemindersThreshold ?? 80;
  const inputs = await buildCollectionRiskInputs(ctx.db, ctx.orgId, now, threshold);
  const ranked = prioritizeCollections(inputs)
    .filter((r) => r.actionDue)
    .slice(0, limit)
    .map((r) => ({
      invoiceNumber: r.invoiceNumber,
      clientName: r.clientName,
      balance: r.balance,
      daysOverdue: r.daysOverdue,
      lateRiskPercent: r.lateRiskPercent,
      recommendedAction: r.recommendedAction,
      recommendedTone: r.recommendedTone,
    }));
  return { actionDueCount: ranked.length, invoices: ranked };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: BooksAssistantContext,
  now: Date,
): Promise<unknown> {
  const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 50) : undefined;
  switch (name) {
    case "get_accounts_receivable":
      return getAccountsReceivable(ctx, limit ?? 10);
    case "get_overdue_invoices":
      return getOverdueInvoices(ctx, limit ?? 15, now);
    case "get_revenue_summary":
      return getRevenueSummary(ctx, String(input.period ?? "last_90_days"), now);
    case "get_unbilled_time":
      return getUnbilledTime(ctx, limit ?? 15);
    case "get_client_health":
      return getClientHealth(
        ctx,
        now,
        typeof input.clientName === "string" ? input.clientName : undefined,
        limit ?? 8,
      );
    case "get_cash_flow_forecast":
      return getCashFlowForecast(ctx, now);
    case "get_collections_recommendations":
      return getCollectionsRecommendations(ctx, now, limit ?? 10);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Agentic loop ──────────────────────────────────────────────────────────────

export async function runBooksAssistant(
  ctx: BooksAssistantContext,
  history: BooksAssistantMessage[],
): Promise<BooksAssistantResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      reply:
        "The books assistant needs an Anthropic API key. Set ANTHROPIC_API_KEY to enable it.",
      toolCalls: [],
      unavailable: true,
    };
  }

  const client = new Anthropic({ apiKey });
  const model = env.ANTHROPIC_AGENT_MODEL ?? DEFAULT_MODEL;
  const now = new Date();

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: BooksAssistantToolCall[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || "I wasn't able to find an answer to that.", toolCalls, unavailable: false };
    }

    // Append the assistant turn (preserving tool_use blocks), then run each tool.
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const inputObj = (block.input ?? {}) as Record<string, unknown>;
      toolCalls.push({ tool: block.name, input: inputObj });
      let result: unknown;
      try {
        result = await executeTool(block.name, inputObj, ctx, now);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool execution failed." };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Ran out of iterations — make one final, tool-free request for a summary.
  const final = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      ...messages,
      {
        role: "user",
        content: "Please summarize what you found so far and answer as best you can without further tools.",
      },
    ],
  });
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { reply: text || "I gathered some data but couldn't finish the analysis.", toolCalls, unavailable: false };
}
