import { describe, it, expect } from "vitest";
import {
  extractInvoiceIdFromRecipients,
  stripQuotedReply,
  parseInboundPayload,
} from "@/server/services/inbound-email";

describe("extractInvoiceIdFromRecipients", () => {
  it("recovers the invoice id from a reply+<id> plus address", () => {
    expect(
      extractInvoiceIdFromRecipients(["reply+clx123abc@inbound.example.com"]),
    ).toBe("clx123abc");
  });

  it("accepts reply-<id> when a provider rewrites the plus", () => {
    expect(extractInvoiceIdFromRecipients(["reply-clx123abc@inbound.example.com"])).toBe("clx123abc");
  });

  it("returns the first matching recipient and ignores others", () => {
    expect(
      extractInvoiceIdFromRecipients(["someone@else.com", "reply+inv_9@inbound.example.com"]),
    ).toBe("inv_9");
  });

  it("returns null when no reply address is present", () => {
    expect(extractInvoiceIdFromRecipients(["hello@example.com"])).toBeNull();
  });
});

describe("stripQuotedReply", () => {
  it("cuts an 'On ... wrote:' quote chain", () => {
    const body = "Thanks, paid now!\n\nOn Mon, Jun 1 2026 at 9:00 AM Acme <a@acme.com> wrote:\n> Your invoice is attached.";
    expect(stripQuotedReply(body)).toBe("Thanks, paid now!");
  });

  it("drops a trailing quoted block", () => {
    const body = "Got it.\n> previous line\n> another";
    expect(stripQuotedReply(body)).toBe("Got it.");
  });

  it("returns the text unchanged when there is no quote", () => {
    expect(stripQuotedReply("Just a plain reply.")).toBe("Just a plain reply.");
  });
});

describe("parseInboundPayload", () => {
  it("parses a Resend-style nested payload", () => {
    const parsed = parseInboundPayload({
      type: "email.received",
      data: {
        from: "client@acme.com",
        to: ["reply+inv1@inbound.example.com"],
        subject: "Re: Invoice INV-001",
        text: "Sorry for the delay — paying today.\n\nOn ... wrote:\n> reminder",
        message_id: "<abc@mail.acme.com>",
        headers: { "in-reply-to": "<orig@inbound.example.com>" },
      },
    });
    expect(parsed.fromEmail).toBe("client@acme.com");
    expect(parsed.toAddresses).toEqual(["reply+inv1@inbound.example.com"]);
    expect(parsed.subject).toBe("Re: Invoice INV-001");
    expect(parsed.bodyText).toBe("Sorry for the delay — paying today.");
    expect(parsed.messageId).toBe("<abc@mail.acme.com>");
    expect(parsed.inReplyTo).toBe("<orig@inbound.example.com>");
  });

  it("parses a flat payload and object-shaped from address", () => {
    const parsed = parseInboundPayload({
      from: { address: "client@acme.com" },
      to: "reply+inv2@inbound.example.com",
      subject: "",
      text: "hello",
    });
    expect(parsed.fromEmail).toBe("client@acme.com");
    expect(parsed.toAddresses).toEqual(["reply+inv2@inbound.example.com"]);
    expect(parsed.subject).toBeNull();
    expect(parsed.bodyText).toBe("hello");
  });
});
