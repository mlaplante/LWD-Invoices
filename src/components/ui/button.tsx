import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * La Plante buttons: uppercase Poppins 600, 2px tracking, 6px radius.
 *
 * Three emphasis levels map onto the design's three treatments —
 *  `default`   filled indigo, indigo glow, 2px lift on hover
 *  `outline`   1px indigo border, fills indigo on hover
 *  `secondary` 1px neutral border, border+text go indigo on hover
 *
 * Transitions are a flat `0.2s ease` throughout — never ease-in-out.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-semibold uppercase tracking-[2px] transition-all duration-200 ease-[ease] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_4px_15px_rgba(63,81,181,0.4)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(63,81,181,0.5)]",
        destructive:
          "bg-destructive text-white shadow-[0_4px_15px_rgba(192,57,43,0.35)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(192,57,43,0.45)]",
        outline:
          "border border-primary bg-card text-primary hover:bg-primary hover:text-primary-foreground",
        secondary:
          "border border-input bg-card text-muted-foreground hover:border-primary hover:text-primary",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        success:
          "border border-success text-success-foreground hover:bg-success hover:text-white",
        link: "text-primary normal-case tracking-normal underline-offset-4 hover:underline",
      },
      size: {
        // Heights follow the design's padding pairs (9px/16px, 5px/12px, …)
        default: "h-[34px] px-4 text-[11px] has-[>svg]:px-3",
        xs: "h-[22px] gap-1 px-2.5 text-[9.5px] tracking-[1.5px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[26px] gap-1.5 px-3 text-[10px] tracking-[1.5px]",
        lg: "h-[38px] px-5 text-[11px]",
        icon: "size-9 tracking-normal",
        "icon-xs": "size-6 rounded-[6px] tracking-normal [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 tracking-normal",
        "icon-lg": "size-10 tracking-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
