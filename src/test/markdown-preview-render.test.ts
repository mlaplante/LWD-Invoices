import { describe, it, expect } from "vitest";
import { escapeHtml, renderMarkdown } from "@/components/ui/markdown-preview-render";

describe("escapeHtml", () => {
  it("escapes the five core HTML metacharacters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("leaves benign characters untouched", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

describe("renderMarkdown XSS hardening", () => {
  it("escapes script tags so they cannot execute", () => {
    const html = renderMarkdown("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes event-handler attributes embedded in user input", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).toContain("&lt;img");
  });

  it("escapes javascript: URLs in raw anchors", () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toMatch(/<a\s+href="javascript:/i);
  });

  it("still renders bold markdown around safe text", () => {
    const html = renderMarkdown("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("escapes HTML inside a markdown bold span", () => {
    const html = renderMarkdown("**<script>x</script>**");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<strong>&lt;script&gt;x&lt;/script&gt;</strong>");
  });
});
