import * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = ({
  variant = "default",
  size = "default",
  className = "",
}: {
  variant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "default" | "sm" | "icon";
  className?: string;
} = {}) =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors",
    "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    {
      "bg-primary text-primary-foreground hover:opacity-90": variant === "default",
      "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
      "hover:bg-muted hover:text-foreground": variant === "ghost",
      "border border-border bg-transparent hover:bg-muted": variant === "outline",
      "bg-destructive text-destructive-foreground hover:opacity-90": variant === "destructive",
    },
    {
      "h-9 px-3": size === "default",
      "h-8 px-2.5 text-xs": size === "sm",
      "h-9 w-9": size === "icon",
    },
    className,
  );

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
    size?: "default" | "sm" | "icon";
  }
>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
