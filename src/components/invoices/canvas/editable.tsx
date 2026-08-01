"use client";

import React, { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Shared display wrapper: looks like document text, behaves like a button. */
function DisplayButton({
  onActivate,
  className,
  ariaLabel,
  children,
}: {
  onActivate: () => void;
  className?: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onActivate}
      onFocus={onActivate}
      className={`rounded-sm text-left hover:bg-[color-mix(in_oklch,var(--canvas-accent)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--canvas-accent)] ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function EditableText({
  value,
  onCommit,
  placeholder,
  multiline = false,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const revertedRef = useRef(false);

  function start() {
    setDraft(value);
    revertedRef.current = false;
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (!revertedRef.current && draft !== value) onCommit(draft);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      revertedRef.current = true;
      setEditing(false);
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
  }

  if (!editing) {
    return (
      <DisplayButton onActivate={start} className={className} ariaLabel={ariaLabel}>
        {value !== "" ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? "—"}</span>
        )}
      </DisplayButton>
    );
  }
  const shared = {
    autoFocus: true,
    value: draft,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    placeholder,
    "aria-label": ariaLabel,
    className: `h-auto px-1 py-0.5 text-[length:inherit] font-[inherit] ${className ?? ""}`,
  };
  return multiline ? <Textarea rows={2} {...shared} /> : <Input {...shared} />;
}

export function EditableNumber({
  value,
  onCommit,
  format,
  className,
  ariaLabel,
  disabled = false,
}: {
  value: number;
  onCommit: (next: number) => void;
  format: (n: number) => string;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const revertedRef = useRef(false);

  if (disabled) {
    return <span className={className}>{format(value)}</span>;
  }
  if (!editing) {
    return (
      <DisplayButton
        onActivate={() => {
          setDraft(String(value));
          revertedRef.current = false;
          setEditing(true);
        }}
        className={`tabular-nums ${className ?? ""}`}
        ariaLabel={ariaLabel}
      >
        {format(value)}
      </DisplayButton>
    );
  }
  function commit() {
    setEditing(false);
    if (revertedRef.current) return;
    const parsed = Number(draft);
    if (!Number.isNaN(parsed) && parsed !== value) onCommit(parsed);
  }
  return (
    <Input
      autoFocus
      type="number"
      step="any"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          revertedRef.current = true;
          setEditing(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      aria-label={ariaLabel}
      className={`h-auto w-24 px-1 py-0.5 text-right text-[length:inherit] ${className ?? ""}`}
    />
  );
}

export function EditableDate({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string; // YYYY-MM-DD or ""
  onCommit: (next: string) => void;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <DisplayButton onActivate={() => setEditing(true)} ariaLabel={ariaLabel}>
        {value !== "" ? value : <span className="text-muted-foreground">Set date</span>}
      </DisplayButton>
    );
  }
  return (
    <Input
      autoFocus
      type="date"
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") setEditing(false);
      }}
      aria-label={ariaLabel}
      className="h-auto w-40 px-1 py-0.5"
    />
  );
}
