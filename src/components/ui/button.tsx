"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "premium";
  size?: "default" | "sm" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default:
        "bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] text-white shadow-lg shadow-[var(--primary)]/25 hover:shadow-[var(--primary)]/40 hover:scale-[1.02] active:scale-[0.98]",
      secondary:
        "bg-gradient-to-r from-[var(--secondary)] to-[var(--secondary-light)] text-white shadow-lg shadow-[var(--secondary)]/25 hover:shadow-[var(--secondary)]/40 hover:scale-[1.02] active:scale-[0.98]",
      outline:
        "border border-[var(--card-border)] bg-transparent hover:bg-[var(--glass)] hover:border-[var(--primary)]/50 text-[var(--foreground)]",
      ghost:
        "hover:bg-[var(--glass)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
      destructive:
        "bg-gradient-to-r from-[var(--error)] to-red-500 text-white shadow-lg shadow-[var(--error)]/25 hover:shadow-[var(--error)]/40 hover:scale-[1.02] active:scale-[0.98]",
      premium:
        "btn-premium",
    };

    const sizes = {
      default: "h-10 px-5 py-2",
      sm: "h-8 px-3 text-sm",
      lg: "h-12 px-8 text-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
