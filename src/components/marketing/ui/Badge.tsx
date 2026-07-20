import clsx from "clsx";
import { HTMLAttributes, ReactNode } from "react";

export default function Badge({
  children,
  icon,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
