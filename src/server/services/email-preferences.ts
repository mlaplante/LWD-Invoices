import { db } from "@/server/db";
import type { EmailPreferenceKind } from "@/generated/prisma";

/**
 * Email-preference kinds govern non-transactional email only. Transactional
 * mail (invoice sends, payment receipts, dunning for a failed charge the
 * client initiated) is always delivered and never appears here.
 *
 * Absence of a ClientEmailPreference row means the kind is enabled.
 */
export const EMAIL_PREFERENCE_KINDS: {
  kind: EmailPreferenceKind;
  label: string;
  description: string;
}[] = [
  {
    kind: "PAYMENT_REMINDERS",
    label: "Payment reminders",
    description: "Automated reminders before and after an invoice's due date.",
  },
  {
    kind: "PROPOSAL_NUDGES",
    label: "Proposal follow-ups",
    description: "Follow-up emails about proposals you've viewed but not signed.",
  },
  {
    kind: "AUTOMATIONS",
    label: "Automated updates",
    description: "Workflow emails triggered by invoice activity (sent, viewed, paid, overdue).",
  },
];

export const ALL_EMAIL_PREFERENCE_KINDS = EMAIL_PREFERENCE_KINDS.map((k) => k.kind);

export type EmailPreferenceState = Record<EmailPreferenceKind, boolean>;

/** Folds preference rows into a complete kind→enabled map (absent row = enabled). */
export function resolvePreferenceState(
  rows: { kind: EmailPreferenceKind; enabled: boolean }[],
): EmailPreferenceState {
  const state = Object.fromEntries(
    ALL_EMAIL_PREFERENCE_KINDS.map((kind) => [kind, true]),
  ) as EmailPreferenceState;
  for (const row of rows) state[row.kind] = row.enabled;
  return state;
}

export function buildEmailPreferencesUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/unsubscribe/${token}`;
}

/**
 * Appends the manage-preferences footer to an outgoing HTML email. Injected
 * before </body> when present so the footer stays inside the document; plain
 * fragments get it appended at the end.
 */
export function appendEmailPreferencesFooter(html: string, url: string): string {
  const footer =
    `<p style="margin-top:24px;font-size:12px;line-height:18px;color:#8898aa;text-align:center;">` +
    `Don't want these emails? <a href="${url}" style="color:#8898aa;text-decoration:underline;">Manage email preferences</a>` +
    `</p>`;
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose === -1) return html + footer;
  return html.slice(0, bodyClose) + footer + html.slice(bodyClose);
}

/**
 * True when the client has not opted out of this kind. Reads the single
 * (clientId, kind) row; absence means enabled.
 */
export async function isEmailKindEnabled(
  clientId: string,
  kind: EmailPreferenceKind,
): Promise<boolean> {
  const row = await db.clientEmailPreference.findUnique({
    where: { clientId_kind: { clientId, kind } },
    select: { enabled: true },
  });
  return row?.enabled ?? true;
}

/** Upserts one preference row. Used by both the public page and the admin UI. */
export async function setEmailPreference(opts: {
  clientId: string;
  organizationId: string;
  kind: EmailPreferenceKind;
  enabled: boolean;
}): Promise<void> {
  await db.clientEmailPreference.upsert({
    where: { clientId_kind: { clientId: opts.clientId, kind: opts.kind } },
    update: { enabled: opts.enabled },
    create: {
      clientId: opts.clientId,
      organizationId: opts.organizationId,
      kind: opts.kind,
      enabled: opts.enabled,
    },
  });
}
