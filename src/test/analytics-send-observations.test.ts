import { describe, expect, it, vi } from "vitest";
import { buildSendObservations } from "@/server/services/analytics-data";

describe("buildSendObservations", () => {
  it("buckets send weekday and hour in the organization time zone", async () => {
    const db = {
      emailEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            invoiceId: "inv-1",
            type: "email.sent",
            occurredAt: new Date("2026-06-08T04:30:00.000Z"),
          },
          {
            invoiceId: "inv-1",
            type: "email.opened",
            occurredAt: new Date("2026-06-08T06:30:00.000Z"),
          },
        ]),
      },
    };

    const observations = await buildSendObservations(
      db as any,
      "org-1",
      "client-1",
      "America/Los_Angeles",
    );

    expect(observations).toEqual([
      {
        weekday: 0,
        hour: 21,
        hoursToOpen: 2,
      },
    ]);
    expect(db.emailEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          invoice: { clientId: "client-1" },
        }),
      }),
    );
  });
});
