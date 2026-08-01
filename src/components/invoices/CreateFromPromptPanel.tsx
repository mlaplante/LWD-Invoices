"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  mode: "create" | "edit";
  aiEnabled: boolean | undefined;
  naturalPrompt: string;
  setNaturalPrompt: (value: string) => void;
  onDraft: () => void;
  isDrafting: boolean;
  review: {
    ambiguities: { field: string; message: string }[];
    lineWarnings: string[];
  } | null;
  info: string | null;
};

// Extracted from InvoiceForm verbatim so it can be rendered both in the form
// view (top of the editor) and in the canvas view's side rail without
// duplicating markup.
export function CreateFromPromptPanel({
  mode,
  aiEnabled,
  naturalPrompt,
  setNaturalPrompt,
  onDraft,
  isDrafting,
  review,
  info,
}: Props) {
  if (mode !== "create") return null;

  if (aiEnabled === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Create-from-prompt is unavailable until an AI provider key is
        configured. Enter invoice details manually.
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Create from a prompt</h2>
        <p className="text-sm text-muted-foreground">
          Describe the invoice in plain English. We’ll draft it only — review
          all matches before saving or sending.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="sr-only" htmlFor="natural-invoice-prompt">
          Natural-language invoice prompt
        </label>
        <Textarea
          id="natural-invoice-prompt"
          value={naturalPrompt}
          onChange={(event) => setNaturalPrompt(event.target.value)}
          placeholder="Bill Acme 8 hrs design at $120 plus the Figma license"
          className="min-h-20 flex-1 bg-background"
        />
        <Button
          type="button"
          onClick={onDraft}
          disabled={isDrafting || naturalPrompt.trim().length < 5}
          className="sm:mt-0"
        >
          {isDrafting ? "Drafting…" : "Draft invoice"}
        </Button>
      </div>
      {review && (
        <div
          className="rounded-lg border bg-background p-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <p className="font-medium">Review required before saving or sending</p>
          {review.ambiguities.length === 0 && review.lineWarnings.length === 0 ? (
            <p className="mt-1 text-muted-foreground">
              Draft fields were filled from your prompt. Confirm the client,
              line items, taxes, and due date.
            </p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {review.ambiguities.map((ambiguity, index) => (
                <li key={`ambiguity-${index}`}>{ambiguity.message}</li>
              ))}
              {review.lineWarnings.map((warning, index) => (
                <li key={`warning-${index}`}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {info && (
        <p className="text-sm text-muted-foreground" role="status">
          {info}
        </p>
      )}
    </section>
  );
}
