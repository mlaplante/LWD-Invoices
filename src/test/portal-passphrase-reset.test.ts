import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    client: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    clientPortalSession: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

vi.mock("@/server/services/email-sender", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/server/services/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn().mockResolvedValue("http://localhost:3000"),
}));

import { POST as requestReset } from "@/app/api/portal/request-passphrase-reset/route";
import { POST as completeReset } from "@/app/api/portal/reset-passphrase/route";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";
import { generateSecureToken, hashToken } from "@/lib/secure-token";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";

const CLIENT = {
  id: "client1",
  name: "Acme Co",
  email: "billing@acme.test",
  organizationId: "org1",
  portalPassphraseHash: "$2a$12$existinghash",
};

let tokenCounter = 0;
function uniqueToken() {
  return `portal-token-${++tokenCounter}`;
}

function requestReq(token: unknown) {
  return new Request("http://localhost/api/portal/request-passphrase-reset", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

let ipCounter = 0;
function resetReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/portal/reset-passphrase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${++ipCounter}`,
    },
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.client.update).mockResolvedValue({} as never);
  vi.mocked(db.clientPortalSession.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.organization.findUnique).mockResolvedValue({
    name: "LWD",
    logoUrl: null,
  } as never);
  vi.mocked(db.$transaction).mockImplementation(
    (async (ops: Promise<unknown>[]) => Promise.all(ops)) as never,
  );
  vi.mocked(sendEmail).mockResolvedValue({ resendId: "re_1" } as never);
});

describe("POST /api/portal/request-passphrase-reset", () => {
  it("rejects requests without a token", async () => {
    const res = await requestReset(requestReq(""));
    expect(res.status).toBe(400);
  });

  it("returns the generic body for an unknown token without sending email", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(null);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(null);

    const res = await requestReset(requestReq(uniqueToken()));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns the generic body when the client has no passphrase configured", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      ...CLIENT,
      portalPassphraseHash: null,
    } as never);

    const res = await requestReset(requestReq(uniqueToken()));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("returns the generic body when the client has no email on file", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      ...CLIENT,
      email: null,
    } as never);

    const res = await requestReset(requestReq(uniqueToken()));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stores a hashed token and emails a reset link for a client portal token", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never);

    const res = await requestReset(requestReq(uniqueToken()));
    expect(res.status).toBe(200);

    const update = vi.mocked(db.client.update).mock.calls[0][0] as {
      data: { portalPassphraseResetTokenHash: string; portalPassphraseResetExpiresAt: Date };
    };
    expect(update.data.portalPassphraseResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.data.portalPassphraseResetExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const email = vi.mocked(sendEmail).mock.calls[0][0];
    expect(email.to).toBe("billing@acme.test");
    expect(email.html).toContain("/portal/reset-passphrase/");
    // The emailed token must hash to what was stored — and the stored value
    // must not be the plaintext token itself.
    const emailedToken = /\/portal\/reset-passphrase\/([0-9a-f]+)/.exec(email.html)?.[1];
    expect(emailedToken).toBeTruthy();
    expect(hashToken(emailedToken!)).toBe(update.data.portalPassphraseResetTokenHash);
    expect(emailedToken).not.toBe(update.data.portalPassphraseResetTokenHash);
  });

  it("resolves the client through an invoice portal token", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(null);
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ client: CLIENT } as never);

    const res = await requestReset(requestReq(uniqueToken()));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("rate limits repeated requests for the same token", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(CLIENT as never);
    const token = uniqueToken();

    for (let i = 0; i < 3; i++) {
      expect((await requestReset(requestReq(token))).status).toBe(200);
    }
    expect((await requestReset(requestReq(token))).status).toBe(429);
  });
});

describe("POST /api/portal/reset-passphrase", () => {
  it("rejects passphrases shorter than 8 characters", async () => {
    const res = await completeReset(resetReq({ token: generateSecureToken(), passphrase: "short" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown reset token", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue(null);
    const res = await completeReset(
      resetReq({ token: generateSecureToken(), passphrase: "new-passphrase" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("invalid or has expired");
  });

  it("rejects an expired reset token", async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: "client1",
      name: "Acme Co",
      organizationId: "org1",
      portalToken: "ptok",
      portalPassphraseResetExpiresAt: new Date(Date.now() - 1000),
    } as never);

    const res = await completeReset(
      resetReq({ token: generateSecureToken(), passphrase: "new-passphrase" }),
    );
    expect(res.status).toBe(400);
  });

  it("sets the new bcrypt hash, burns the token, and revokes sessions", async () => {
    const resetToken = generateSecureToken();
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: "client1",
      name: "Acme Co",
      organizationId: "org1",
      portalToken: "ptok",
      portalPassphraseResetExpiresAt: new Date(Date.now() + 60_000),
    } as never);

    const res = await completeReset(resetReq({ token: resetToken, passphrase: "brand-new-pass" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; loginUrl: string };
    expect(body.loginUrl).toBe("/portal/dashboard-login/ptok");

    // Looked up by the SHA-256 of the presented token, never the plaintext.
    expect(db.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { portalPassphraseResetTokenHash: hashToken(resetToken) },
      }),
    );

    const update = vi.mocked(db.client.update).mock.calls[0][0] as {
      data: {
        portalPassphraseHash: string;
        portalPassphraseResetTokenHash: null;
        portalPassphraseResetExpiresAt: null;
      };
    };
    expect(update.data.portalPassphraseResetTokenHash).toBeNull();
    expect(update.data.portalPassphraseResetExpiresAt).toBeNull();
    expect(await bcrypt.compare("brand-new-pass", update.data.portalPassphraseHash)).toBe(true);

    expect(db.clientPortalSession.deleteMany).toHaveBeenCalledWith({
      where: { clientId: "client1" },
    });
  });
});
