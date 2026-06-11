import { describe, it, expect, vi, beforeEach } from "vitest";

const { clientEmailPreference, client } = vi.hoisted(() => ({
  clientEmailPreference: { findUnique: vi.fn(), upsert: vi.fn() },
  client: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/server/db", () => ({ db: { clientEmailPreference, client } }));

import {
  ALL_EMAIL_PREFERENCE_KINDS,
  EMAIL_PREFERENCE_KINDS,
  appendEmailPreferencesFooter,
  buildEmailPreferencesUrl,
  isEmailKindEnabled,
  resolvePreferenceState,
} from "@/server/services/email-preferences";
import { sendEmail } from "@/server/services/email-sender";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePreferenceState", () => {
  it("defaults every kind to enabled when no rows exist", () => {
    const state = resolvePreferenceState([]);
    for (const kind of ALL_EMAIL_PREFERENCE_KINDS) {
      expect(state[kind]).toBe(true);
    }
  });

  it("applies stored rows over the defaults", () => {
    const state = resolvePreferenceState([
      { kind: "PAYMENT_REMINDERS", enabled: false },
      { kind: "AUTOMATIONS", enabled: true },
    ]);
    expect(state.PAYMENT_REMINDERS).toBe(false);
    expect(state.AUTOMATIONS).toBe(true);
    expect(state.PROPOSAL_NUDGES).toBe(true);
  });

  it("covers every kind exposed to the UI", () => {
    const state = resolvePreferenceState([]);
    for (const meta of EMAIL_PREFERENCE_KINDS) {
      expect(state[meta.kind]).toBeDefined();
    }
  });
});

describe("appendEmailPreferencesFooter", () => {
  it("injects the footer before </body> when present", () => {
    const html = "<html><body><p>Hi</p></body></html>";
    const out = appendEmailPreferencesFooter(html, "https://x.test/unsubscribe/t");
    expect(out).toContain("Manage email preferences");
    expect(out.indexOf("Manage email preferences")).toBeLessThan(out.indexOf("</body>"));
  });

  it("appends to fragments without a body tag", () => {
    const out = appendEmailPreferencesFooter("<p>Hi</p>", "https://x.test/u/t");
    expect(out.startsWith("<p>Hi</p>")).toBe(true);
    expect(out).toContain('href="https://x.test/u/t"');
  });
});

describe("buildEmailPreferencesUrl", () => {
  it("builds the public unsubscribe URL from the app URL", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(buildEmailPreferencesUrl("tok123")).toBe("https://app.example.com/unsubscribe/tok123");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});

describe("isEmailKindEnabled", () => {
  it("returns true when no preference row exists", async () => {
    clientEmailPreference.findUnique.mockResolvedValue(null);
    await expect(isEmailKindEnabled("c1", "PAYMENT_REMINDERS")).resolves.toBe(true);
  });

  it("returns the stored flag when a row exists", async () => {
    clientEmailPreference.findUnique.mockResolvedValue({ enabled: false });
    await expect(isEmailKindEnabled("c1", "AUTOMATIONS")).resolves.toBe(false);
  });
});

describe("sendEmail opt-out suppression", () => {
  it("suppresses non-transactional sends when the client opted out", async () => {
    clientEmailPreference.findUnique.mockResolvedValue({ enabled: false });
    const result = await sendEmail({
      organizationId: "org1",
      clientId: "c1",
      emailKind: "PAYMENT_REMINDERS",
      to: "client@example.com",
      subject: "Reminder",
      html: "<p>Pay up</p>",
    });
    expect(result).toEqual({ resendId: null, suppressed: true, reason: "unsubscribed" });
    // Never reached the bounce check or Resend when suppressed up front.
    expect(client.findFirst).not.toHaveBeenCalled();
  });

  it("does not consult preferences for transactional sends", async () => {
    client.findFirst.mockResolvedValue({
      emailBouncedAt: new Date(),
      emailComplainedAt: null,
    });
    const result = await sendEmail({
      organizationId: "org1",
      to: "client@example.com",
      subject: "Your invoice",
      html: "<p>Invoice</p>",
    });
    // Bounce suppression still applies, proving we got past the opt-out gate.
    expect(result).toEqual({ resendId: null, suppressed: true, reason: "bounced" });
    expect(clientEmailPreference.findUnique).not.toHaveBeenCalled();
  });
});
