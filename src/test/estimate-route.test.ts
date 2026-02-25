import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/server/services/notifications", () => ({
  notifyOrgAdmins: vi.fn(),
}));

import { POST } from "@/app/api/portal/[token]/estimate/route";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";

const PARAMS = { params: Promise.resolve({ token: "tok1" }) };

const BASE_INVOICE = {
  id: "inv1",
  number: "INV-0001",
  type: "ESTIMATE",
  status: "SENT",
  organizationId: "org1",
};

function makeReq(action: "accept" | "decline") {
  return new Request("http://localhost/api/portal/tok1/estimate", {
    method: "POST",
    body: JSON.stringify({ action }),
    headers: { "content-type": "application/json" },
  });
}

describe("Portal estimate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.invoice.update).mockResolvedValue({} as any);
    vi.mocked(notifyOrgAdmins).mockResolvedValue(undefined);
  });

  it("returns 404 when portalToken is not found", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue(null);
    const res = await POST(makeReq("accept") as any, PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 404 when invoice type is not ESTIMATE", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...BASE_INVOICE, type: "SIMPLE" } as any);
    const res = await POST(makeReq("accept") as any, PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 409 when estimate is already decided", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...BASE_INVOICE, status: "ACCEPTED" } as any);
    const res = await POST(makeReq("accept") as any, PARAMS);
    expect(res.status).toBe(409);
  });

  it("sets status ACCEPTED and notifies org admins when accepted", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue(BASE_INVOICE as any);
    const res = await POST(makeReq("accept") as any, PARAMS);
    const body = await res.json() as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ACCEPTED");
    expect(vi.mocked(notifyOrgAdmins)).toHaveBeenCalledWith("org1", {
      type: "ESTIMATE_ACCEPTED",
      title: "Estimate accepted",
      body: expect.stringContaining("INV-0001"),
      link: "/invoices/inv1",
    });
  });

  it("sets status REJECTED and notifies org admins when declined", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue(BASE_INVOICE as any);
    const res = await POST(makeReq("decline") as any, PARAMS);
    const body = await res.json() as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("REJECTED");
    expect(vi.mocked(notifyOrgAdmins)).toHaveBeenCalledWith("org1", {
      type: "ESTIMATE_REJECTED",
      title: "Estimate rejected",
      body: expect.stringContaining("INV-0001"),
      link: "/invoices/inv1",
    });
  });
});
