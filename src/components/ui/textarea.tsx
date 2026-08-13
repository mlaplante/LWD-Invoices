import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground/70 focus-visible:border-primary aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-none border-0 border-b bg-transparent px-0 pb-1.5 text-sm transition-colors duration-200 ease-[ease] outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
