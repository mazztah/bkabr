"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function AppContentFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketing = pathname?.startsWith("/marketing");

  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-hidden",
        // The theme/sandbox/quick-create buttons (top-right) and, on phones,
        // the hamburger (top-left) float above every page. Push content
        // below them everywhere so page headers/links never get covered.
        !isMarketing && "pt-14"
      )}
    >
      {children}
    </div>
  );
}
