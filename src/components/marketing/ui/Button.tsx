"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "glass";
type Size = "md" | "lg";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

interface ButtonProps extends NativeButtonProps {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  loading?: boolean;
  href?: string;
}

export default function Button({
  variant = "primary",
  size = "md",
  arrow,
  loading,
  className,
  children,
  href,
  ...props
}: ButtonProps) {
  const classes = clsx(
    "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold transition-all duration-300 whitespace-nowrap",
    {
      "px-6 py-3 text-sm": size === "md",
      "px-8 py-4 text-base": size === "lg",
    },
    {
      "bg-gradient-to-r from-[var(--primary)] to-[var(--brand-accent)] text-[var(--primary-foreground)] shadow-[0_0_35px_rgba(59,157,255,.35)] hover:shadow-[0_0_50px_rgba(59,157,255,.5)]":
        variant === "primary",
      "border border-white/10 bg-white/5 backdrop-blur-xl text-foreground hover:bg-white/10":
        variant === "glass",
      "border border-[var(--brand-accent)]/30 bg-transparent text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/10":
        variant === "secondary",
      "bg-transparent text-foreground hover:text-[var(--brand-accent)]": variant === "ghost",
    },
    className
  );

  const content = (
    <>
      <span className="relative z-10 flex items-center justify-center gap-2.5">
        {loading ? "Bitte warten…" : children}
        {arrow && (
          <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
        )}
      </span>
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full opacity-0 transition-all duration-500 group-hover:translate-x-full group-hover:opacity-100"
        style={{
          background: "linear-gradient(120deg,transparent,rgba(255,255,255,.22),transparent)",
        }}
      />
    </>
  );

  if (href) {
    return (
      <motion.a
        href={href}
        whileHover={{ scale: 1.025 }}
        whileTap={{ scale: 0.98 }}
        className={classes}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.98 }} className={classes} {...props}>
      {content}
    </motion.button>
  );
}
