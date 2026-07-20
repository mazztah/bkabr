import clsx from "clsx";
import { HTMLAttributes } from "react";

export default function Section({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx("relative py-24 lg:py-32", className)} {...props}>
      {children}
    </section>
  );
}
