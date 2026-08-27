"use client";

import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function MobileNavToggle() {
  const pathname = usePathname();
  const { toggleMobileNav, mobileNavOpen } = useStore();
  if (pathname?.startsWith("/marketing") || pathname?.startsWith("/login")) return null;
  // The drawer has its own close (✕) button once open, so hide this to
  // avoid it sitting on top of the drawer's logo/header.
  if (mobileNavOpen) return null;

  return (
    <button
      onClick={toggleMobileNav}
      className="fixed left-4 top-4 z-[250] flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-lg shadow-md no-print lg:hidden"
      title="Menü öffnen"
    >
      ☰
    </button>
  );
}
