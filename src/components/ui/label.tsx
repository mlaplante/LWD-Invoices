"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Field label: uppercase Roboto Mono 9.5px with 1.5px tracking, sitting
 * above the rule. Goes indigo while the field it labels has focus —
 * `:has()` on the shared form-field wrapper drives that, so the label
 * and the rule light up together.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 font-mono text-[9.5px] uppercase leading-none tracking-[1.5px] text-muted-foreground select-none transition-colors duration-200 ease-[ease] group-focus-within/field:text-primary group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Wrapper that pairs a Label with a field so focus can drive both.
 * Form-field gap in the design is 20–26px; the grid gap supplies that.
 */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("group/field flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

export { Label, Field }
