import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  extractBodyText,
  fetchReceivedEmail,
  isFromDomainAuthenticated,
} from "@/server/services/resend-received-email";

describe("isFromDomainAuthenticated", () => {
  it.each([
    [{ spf: "pass", dkim: "pass", dmarc: "pass" }, true],
    [{ spf: "gray", dkim: "pass", dmarc: "gray" }, true],
    [{ spf: "fail", dkim: "gray", dmarc: "pass" }, true],
    [{ spf: "pass", dkim: "gray", dmarc: "gray" }, false],
    [{ spf: "pass", dkim: "fail", dmarc: "fail" }, false],
    [{ spf: null, dkim: "unknown", dmarc: "processing_failed" }, false],
    [null, false],
  ] as const)("%j -> %s", (auth, expected) => {
    expect(isFromDomainAuthenticated(auth)).toBe(expected);
  });
});

describe("extractBodyText", () => {
  it("prefers the text part and strips the quoted chain", () => {
    expect(extractBodyText("Thanks!\n\nOn Mon, X wrote:\n> old", "<p>ignored</p>")).toBe("Thanks!");
  });

  it("reduces HTML-only messages to plain text, dropping scripts and tags", () => {
    const out = extractBodyText(null, '<div>Pay <b>Friday</b> &amp; thanks<script>alert(1)</script></div>');
    expect(out).toBe("Pay Friday & thanks");
    expect(out).not.toContain("<");
  });

  it("returns null when there is no body", () => {
    expect(extractBodyText(null, null)).toBeNull();
  });
});

describe("fetchReceivedEmail", () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

  it("returns body and verdicts from the Received Emails API", async () => {
    const fetchImpl = ok({
      id: "em_1",
      from: "client@acme.com",
      text: "hi",
      html: null,
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    });
    const res = await fetchReceivedEmail("em_1", { apiKey: "re_test", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/em_1",
      expect.objectContaining({ headers: { Authorization: "Bearer re_test" } }),
    );
    expect(res).toEqual({
      id: "em_1",
      from: "client@acme.com",
      bodyText: "hi",
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    });
  });

  it("drops unrecognised verdict values", async () => {
    const res = await fetchReceivedEmail("em_1", {
      apiKey: "k",
      fetchImpl: ok({ id: "em_1", authentication: { spf: "PASS", dkim: true, dmarc: "pass" } }),
    });
    expect(res?.authentication).toEqual({ spf: null, dkim: null, dmarc: "pass" });
  });

  it("returns null when the response is for a different message", async () => {
    const res = await fetchReceivedEmail("em_1", { apiKey: "k", fetchImpl: ok({ id: "em_2" }) });
    expect(res).toBeNull();
  });

  it("returns null on HTTP errors, network errors, and a missing key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notFound = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    expect(await fetchReceivedEmail("em_1", { apiKey: "k", fetchImpl: notFound })).toBeNull();
    const boom = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await fetchReceivedEmail("em_1", { apiKey: "k", fetchImpl: boom })).toBeNull();
    expect(await fetchReceivedEmail("em_1", { apiKey: "", fetchImpl: boom })).toBeNull();
  });
});
