"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function AppContentFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketing = pathname?.startsWith("/marketing");

  return (
    <div
      style={!isMarketing ? { marginLeft: "var(--nav-width, 0px)" } : undefined}
      className={cn(
        "min-h-0 flex-1 overflow-hidden",
        // The theme/sandbox/quick-create buttons (top-right) and, on phones,
        // the hamburger (top-left) float above every page. Push content
        // below them everywhere so page headers/links never get covered.
        !isMarketing && "pt-14",
        // LeftNav ist jetzt immer `fixed` (fürs Flyout-Verhalten beim
        // Auto-Fade); --nav-width spiegelt die aktuell reservierte Breite
        // (Rail bzw. angepinnte volle Breite) und wird von LeftNav gesetzt.
        !isMarketing && "transition-[margin-left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      )}
    >
      {children}
    </div>
  );
}
