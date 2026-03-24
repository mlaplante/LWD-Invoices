"use client";

import { cn } from "@/lib/utils";

function renderMarkdown(content: string): string {
  return content
    // Tables
    .replace(/^(\|.+\|)\n(\|[\s:?-]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, header: string, _sep: string, body: string) => {
      const headerCells = header.split("|").slice(1, -1).map((c: string) => `<th class="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">${c.trim()}</th>`).join("");
      const rows = body.trim().split("\n").map((row: string) => {
        const cells = row.split("|").slice(1, -1).map((c: string) => `<td class="px-3 py-1.5 text-sm">${c.trim()}</td>`).join("");
        return `<tr class="border-b border-border/50">${cells}</tr>`;
      }).join("");
      return `<table class="w-full border-collapse my-2 rounded overflow-hidden"><thead class="bg-muted/50"><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-4 mb-1.5">$1</h2>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    // Paragraphs (non-empty lines that aren't already wrapped)
    .replace(/^(?!<[hltus]|$)(.+)$/gm, '<p class="text-sm mb-1.5">$1</p>')
    // Newlines
    .replace(/\n/g, "");
}

export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn("prose prose-sm max-w-none rounded-lg border bg-muted/20 p-4", className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
