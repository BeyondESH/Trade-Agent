import * as React from "react";
import { cn } from "../../lib/utils";

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" | "success" | "danger" }
>(({ className, variant = "default", ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
      {
        "border-transparent bg-primary text-primary-foreground": variant === "default",
        "border-border text-muted-foreground": variant === "outline",
        "border-transparent bg-[#089981]/15 text-[#089981]": variant === "success",
        "border-transparent bg-[#f23645]/15 text-[#f23645]": variant === "danger",
      },
      className,
    )}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
