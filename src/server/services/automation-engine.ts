/**
 * No-code automation engine — pure rule evaluation.
 *
 * Generalizes the fixed EmailAutomation / ReminderSequence features into
 * composable trigger → conditions → actions rules. This module is the
 * deterministic, side-effect-free core: given a fired trigger and a snapshot of
 * the invoice, decide whether a rule should run. The Inngest functions own the
 * side effects (sending email, notifying admins, writing run logs); keeping the
 * decision logic here makes it exhaustively unit-testable.
 */

import type {
  AutomationConditionField,
  AutomationConditionLogic,
  AutomationOperator,
  AutomationTrigger,
} from "@/generated/prisma";

/** A single condition as stored on a rule. */
export interface RuleCondition {
  field: AutomationConditionField;
  operator: AutomationOperator;
  value: string;
}

/** The minimal rule shape the engine needs to make a decision. */
export interface EvaluableRule {
  trigger: AutomationTrigger;
  conditionLogic: AutomationConditionLogic;
  conditions: RuleCondition[];
}

/**
 * Snapshot of the invoice a rule is evaluated against. The Inngest runner builds
 * this from the live invoice + payments; the engine never touches the database.
 */
export interface AutomationEntity {
  total: number;
  /** Remaining balance: total minus payments applied. */
  amountDue: number;
  /** Whole days past the due date (0 when not yet due / no due date). */
  daysOverdue: number;
  status: string;
  clientName: string;
  currencyCode: string;
}

const NUMERIC_FIELDS: ReadonlySet<AutomationConditionField> = new Set([
  "TOTAL",
  "AMOUNT_DUE",
  "DAYS_OVERDUE",
]);

const NUMERIC_OPERATORS: ReadonlySet<AutomationOperator> = new Set([
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
]);

const STRING_OPERATORS: ReadonlySet<AutomationOperator> = new Set([
  "EQ",
  "NEQ",
  "CONTAINS",
  "NOT_CONTAINS",
]);

export function isNumericField(field: AutomationConditionField): boolean {
  return NUMERIC_FIELDS.has(field);
}

/** Operators that are valid for the given field's type. */
export function operatorsForField(field: AutomationConditionField): AutomationOperator[] {
  return [...(isNumericField(field) ? NUMERIC_OPERATORS : STRING_OPERATORS)];
}

function numericFieldValue(field: AutomationConditionField, entity: AutomationEntity): number {
  switch (field) {
    case "TOTAL":
      return entity.total;
    case "AMOUNT_DUE":
      return entity.amountDue;
    case "DAYS_OVERDUE":
      return entity.daysOverdue;
    default:
      return Number.NaN;
  }
}

function stringFieldValue(field: AutomationConditionField, entity: AutomationEntity): string {
  switch (field) {
    case "STATUS":
      return entity.status;
    case "CLIENT_NAME":
      return entity.clientName;
    case "CURRENCY_CODE":
      return entity.currencyCode;
    default:
      return "";
  }
}

function compareNumeric(actual: number, operator: AutomationOperator, expected: number): boolean {
  switch (operator) {
    case "EQ":
      return actual === expected;
    case "NEQ":
      return actual !== expected;
    case "GT":
      return actual > expected;
    case "GTE":
      return actual >= expected;
    case "LT":
      return actual < expected;
    case "LTE":
      return actual <= expected;
    default:
      // CONTAINS / NOT_CONTAINS are meaningless for numbers — never matches.
      return false;
  }
}

function compareString(actual: string, operator: AutomationOperator, expected: string): boolean {
  // Case-insensitive throughout: statuses and currency codes vary in casing and
  // a no-code user shouldn't have to match exact case.
  const a = actual.toLowerCase().trim();
  const b = expected.toLowerCase().trim();
  switch (operator) {
    case "EQ":
      return a === b;
    case "NEQ":
      return a !== b;
    case "CONTAINS":
      return a.includes(b);
    case "NOT_CONTAINS":
      return !a.includes(b);
    default:
      // Ordering operators are meaningless for free text — never matches.
      return false;
  }
}

/**
 * Evaluate one condition against the entity. A numeric condition whose value
 * isn't a finite number never matches (a malformed rule fails closed rather than
 * firing unexpectedly).
 */
export function evaluateCondition(condition: RuleCondition, entity: AutomationEntity): boolean {
  if (isNumericField(condition.field)) {
    const expected = Number(condition.value);
    if (!Number.isFinite(expected)) return false;
    return compareNumeric(numericFieldValue(condition.field, entity), condition.operator, expected);
  }
  return compareString(stringFieldValue(condition.field, entity), condition.operator, condition.value);
}

/**
 * Combine all conditions under the rule's logic. An empty condition set is
 * treated as "always" — a rule with no conditions fires on every event of its
 * trigger type (matching the old fixed-automation behavior).
 */
export function evaluateConditions(
  conditions: RuleCondition[],
  logic: AutomationConditionLogic,
  entity: AutomationEntity,
): boolean {
  if (conditions.length === 0) return true;
  return logic === "AND"
    ? conditions.every((c) => evaluateCondition(c, entity))
    : conditions.some((c) => evaluateCondition(c, entity));
}

/**
 * The top-level decision: does this rule run for this fired trigger + entity?
 * Trigger must match exactly, then conditions must pass.
 */
export function ruleShouldRun(
  rule: EvaluableRule,
  firedTrigger: AutomationTrigger,
  entity: AutomationEntity,
): boolean {
  if (rule.trigger !== firedTrigger) return false;
  return evaluateConditions(rule.conditions, rule.conditionLogic, entity);
}

/** Days an invoice is past its due date, floored at 0. Exposed for the runner. */
export function daysOverdue(dueDate: Date | null | undefined, now: Date): number {
  if (!dueDate) return 0;
  const diffMs = now.getTime() - dueDate.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}
