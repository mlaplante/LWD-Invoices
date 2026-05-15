import { describe, it, expect } from "vitest";
import { deriveClientStatus } from "../server/services/client-status";

const DAY = 86_400_000;
const NOW = new Date("2026-05-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("deriveClientStatus", () => {
  it("is active when an active project exists, regardless of age", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(5000),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: true,
        },
        NOW,
      ),
    ).toBe("active");
  });

  it("is cold when there's no activity at all", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: null,
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("cold");
  });

  it("is active for activity within 30 days", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(10),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("active");
  });

  it("is recent for 31-89 days", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: null,
          lastPaymentAt: daysAgo(60),
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("recent");
  });

  it("is warm for 90-364 days", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: null,
          lastPaymentAt: null,
          lastCompletedProjectAt: daysAgo(200),
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("warm");
  });

  it("is cold past one year", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(400),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("cold");
  });

  it("picks the most recent of the available signals", () => {
    // Old invoice, but a recent payment — should be active.
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(400),
          lastPaymentAt: daysAgo(15),
          lastCompletedProjectAt: daysAgo(800),
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("active");
  });

  it("boundary: exactly 30 days is active, 31 is recent", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(30),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("active");

    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(31),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("recent");
  });

  it("boundary: 365 days is cold (>=365)", () => {
    expect(
      deriveClientStatus(
        {
          lastInvoiceAt: daysAgo(365),
          lastPaymentAt: null,
          lastCompletedProjectAt: null,
          hasActiveProject: false,
        },
        NOW,
      ),
    ).toBe("cold");
  });
});
