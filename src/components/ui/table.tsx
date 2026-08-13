import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * List tables in the La Plante system.
 *
 * Header cells are Roboto Mono 10px / 1.5px tracking at 45% ink; body
 * cells are Poppins 13px on a #f0f0f0 rule. The last row drops its rule
 * so the table meets the card edge cleanly.
 *
 * Wrap in a `<Card className="overflow-hidden p-0">` — the card supplies
 * the 10px radius and the outer border.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-left", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child>td]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted border-t border-border", className)}
      {...props}
    />
  )
}

/** `attention` washes the row — overdue invoices, failed jobs, disputes. */
function TableRow({
  className,
  attention = false,
  ...props
}: React.ComponentProps<"tr"> & { attention?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors duration-200 ease-[ease] hover:bg-black/[0.015] dark:hover:bg-white/[0.02]",
        attention && "bg-danger/[0.03]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "border-b border-border px-3.5 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[1.5px] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "border-b border-divider px-3.5 py-3 text-[13px] text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 font-mono text-[10.5px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
