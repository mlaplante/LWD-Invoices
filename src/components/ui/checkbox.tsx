"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => {
    const [checked, setChecked] = React.useState(!!props.checked || !!props.defaultChecked);

    React.useEffect(() => {
      if (props.checked !== undefined) setChecked(!!props.checked);
    }, [props.checked]);

    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          ref={ref}
          className="sr-only peer"
          onChange={(e) => {
            setChecked(e.target.checked);
            onCheckedChange?.(e.target.checked);
            onChange?.(e);
          }}
          {...props}
        />
        <div
          className={cn(
            "h-4 w-4 shrink-0 rounded border border-primary ring-offset-background",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            checked && "bg-primary text-primary-foreground",
            !checked && "bg-background",
            className
          )}
        >
          {checked && <Check className="h-3.5 w-3.5" />}
        </div>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
