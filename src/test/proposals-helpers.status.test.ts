import { describe, it, expect } from "vitest";
import { deriveProposalStatus } from "@/server/routers/proposals-helpers";

describe("deriveProposalStatus", () => {
  const base = { hasContent: true, invoiceStatus: "DRAFT", lastSent: null, signedAt: null, hasOpenEvent: false };

  it("returns 'none' when there is no proposal content or file", () => {
    expect(deriveProposalStatus({ ...base, hasContent: false })).toBe("none");
  });

  it("returns 'draft' when content exists but it was never sent", () => {
    expect(deriveProposalStatus(base)).toBe("draft");
  });

  it("returns 'sent' when sent but not opened or signed", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "SENT", lastSent: new Date() })).toBe("sent");
  });

  it("returns 'viewed' when an open event exists and it is unsigned", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "SENT", lastSent: new Date(), hasOpenEvent: true })).toBe("viewed");
  });

  it("returns 'signed' when signedAt is set, regardless of open events", () => {
    expect(deriveProposalStatus({ ...base, signedAt: new Date(), hasOpenEvent: true })).toBe("signed");
  });

  it("returns 'signed' when the estimate status is ACCEPTED", () => {
    expect(deriveProposalStatus({ ...base, invoiceStatus: "ACCEPTED" })).toBe("signed");
  });
});
