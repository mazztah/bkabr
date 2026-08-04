"use client";

import { motion } from "framer-motion";
import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface PremiumButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export default function PremiumButton({
  variant = "primary",
  size = "md",
  children,
  className,
  ...props
}: PremiumButtonProps) {
  const base = "interactive rounded-xl font-medium inline-flex items-center justify-center gap-1.5";

  const variants: Record<string, string> = {
    primary: "bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-white glow-ring-primary",
    secondary: "bg-secondary text-secondary-foreground hover:brightness-110",
    accent: "bg-gradient-to-br from-[var(--brand-accent)] to-[var(--brand-accent-2)] text-white glow-ring-accent",
    ghost: "hover:bg-muted text-foreground",
    danger: "bg-[var(--destructive)] text-white",
  };

  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <motion.button
      {...(props as any)}
      whileTap={{ scale: 0.97 }}
      className={cn(base, variants[variant], sizes[size], props.disabled && "opacity-50 cursor-not-allowed", className)}
    >
      {children}
    </motion.button>
  );
}
