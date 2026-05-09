const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

export function renderMarkdown(content: string): string {
  // Escape all HTML first so user-supplied tags/attributes cannot inject markup.
  // The markdown transforms below introduce only known-safe tags with literal class names.
  const safe = escapeHtml(content);
  return safe
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
