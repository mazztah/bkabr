"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { HTMLAttributes } from "react";

type NativeDivProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

interface GlassCardProps extends NativeDivProps {
  glow?: boolean;
  hover?: boolean;
  blur?: "sm" | "md" | "lg";
}

export default function GlassCard({
  children,
  className,
  glow = true,
  hover = true,
  blur = "lg",
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -6, scale: 1.012 } : undefined}
      transition={{ duration: 0.25 }}
      className={clsx(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045]",
        {
          "backdrop-blur-sm": blur === "sm",
          "backdrop-blur-md": blur === "md",
          "backdrop-blur-xl": blur === "lg",
        },
        glow && "shadow-[0_0_45px_rgba(59,157,255,.08)] hover:shadow-[0_0_65px_rgba(59,157,255,.18)]",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-[var(--brand-accent)]/[0.06] via-transparent to-[var(--primary)]/[0.06]" />
      <div className="mk-noise pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
