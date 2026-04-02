import { describe, it, expect } from "vitest";
import { parseMarkdownSections, extractHeadings } from "../server/services/proposal-pdf-helpers";

describe("parseMarkdownSections", () => {
  it("splits content by h2 headings", () => {
    const md = "## Overview\nSome text\n## Goals\nMore text";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Overview");
    expect(sections[0].body).toContain("Some text");
    expect(sections[1].heading).toBe("Goals");
  });

  it("handles content before first heading", () => {
    const md = "Intro text\n## Section One\nBody";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBeNull();
    expect(sections[0].body).toContain("Intro text");
  });

  it("handles h3 headings within sections", () => {
    const md = "## Main\nText\n### Sub\nMore text";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toContain("### Sub");
  });
});

describe("extractHeadings", () => {
  it("extracts all headings from markdown content", () => {
    const md = "## First\ntext\n## Second\nmore\n### Third\ndeep";
    const headings = extractHeadings(md);
    expect(headings).toEqual([
      { level: 2, text: "First" },
      { level: 2, text: "Second" },
      { level: 3, text: "Third" },
    ]);
  });
});
