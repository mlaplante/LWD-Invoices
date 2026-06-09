"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { Button } from "@/components/ui/button";
import { Eye, Pencil } from "lucide-react";

export type ProposalSection = { key: string; title: string; content: string | null };

export function ProposalSectionsEditor({
  sections,
  onChange,
}: {
  sections: ProposalSection[];
  onChange: (next: ProposalSection[]) => void;
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);

  function updateSection(index: number, content: string) {
    onChange(sections.map((s, i) => (i === index ? { ...s, content } : s)));
  }

  return (
    <>
      {sections.map((section, i) => (
        <div key={section.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{section.title}</Label>
            {section.key !== "budget" && section.content && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewing(previewing === section.key ? null : section.key)}
              >
                {previewing === section.key ? (
                  <><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</>
                ) : (
                  <><Eye className="h-3.5 w-3.5 mr-1.5" />Preview</>
                )}
              </Button>
            )}
          </div>
          {section.key === "budget" ? (
            <p className="text-sm text-muted-foreground">Auto-generated from estimate line items.</p>
          ) : previewing === section.key ? (
            <MarkdownPreview content={section.content ?? ""} />
          ) : (
            <Textarea
              rows={6}
              value={section.content ?? ""}
              onChange={(e) => updateSection(i, e.target.value)}
              placeholder="Supports **bold**, ## headings, - bullets, and | tables |"
            />
          )}
        </div>
      ))}
    </>
  );
}
