import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Status pills: 100px radius, Poppins 500 at 10px with 0.5px tracking,
 * 3px/11px padding. Every variant is a tint — the fill carries the
 * status colour at ~10% and the text carries it at full strength, so a
 * row of pills reads as one family rather than a row of solid chips.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-transparent px-[11px] py-[3px] text-[10px] font-medium tracking-[0.5px] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Sent · in-flight · informational
        default: "bg-primary/8 text-primary dark:bg-primary/25 dark:text-accent-foreground",
        // Draft · inactive · not connected
        secondary: "bg-black/5 text-[#777] dark:bg-white/8 dark:text-muted-foreground",
        // Overdue · high risk · failed
        destructive: "bg-danger/10 text-danger-foreground",
        // Paid · connected · healthy
        success: "bg-success/10 text-success-foreground",
        // Needs review · due soon · open
        warning: "bg-warning/12 text-warning-foreground",
        outline: "border-border text-foreground",
        ghost: "text-muted-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
