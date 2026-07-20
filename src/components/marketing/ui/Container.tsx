import clsx from "clsx";
import { HTMLAttributes } from "react";

export default function Container({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("mx-auto w-full max-w-7xl px-6 lg:px-8", className)} {...props}>
      {children}
    </div>
  );
}
