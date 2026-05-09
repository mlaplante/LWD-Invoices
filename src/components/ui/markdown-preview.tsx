"use client";

import { cn } from "@/lib/utils";
import { renderMarkdown } from "./markdown-preview-render";

export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn("prose prose-sm max-w-none rounded-lg border bg-muted/20 p-4", className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
