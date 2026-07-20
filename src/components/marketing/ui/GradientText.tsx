import { ReactNode } from "react";
import clsx from "clsx";

export default function GradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "mk-gradient-text bg-gradient-to-r from-[var(--brand-accent)] via-[var(--primary)] to-emerald-300 bg-clip-text text-transparent",
        className
      )}
    >
      {children}
    </span>
  );
}
