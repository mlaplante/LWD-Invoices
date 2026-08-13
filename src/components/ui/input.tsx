import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Material-style field: bottom rule only, no box. Resting rule is
 * `--input` (#ddd), and focus turns it indigo. Paired with `<Label>`,
 * which switches to indigo when the field inside it has focus.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/70 selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-none border-0 border-b bg-transparent px-0 pb-1.5 text-sm transition-colors duration-200 ease-[ease] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:outline-none",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
