import clsx from "clsx";
import { HTMLAttributes } from "react";

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  size?: "md" | "lg" | "xl" | "2xl";
  as?: "h1" | "h2" | "h3";
}

export default function Heading({ size = "lg", as = "h2", className, children, ...props }: HeadingProps) {
  const Tag = as;
  return (
    <Tag
      className={clsx(
        "font-bold tracking-tight text-foreground",
        {
          "text-2xl lg:text-3xl": size === "md",
          "text-3xl lg:text-4xl": size === "lg",
          "text-4xl lg:text-5xl": size === "xl",
          "text-5xl lg:text-6xl": size === "2xl",
        },
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
