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
        // On phones the hamburger (top-left) and theme/sandbox/quick-create
        // buttons (top-right) float above the page — push content below them
        // so nothing gets covered. From lg upward there's enough room again.
        !isMarketing && "pt-14 lg:pt-0"
      )}
    >
      {children}
    </div>
  );
}
