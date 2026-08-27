"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { SandboxToggle } from "./SandboxLayer";
import QuickCreate from "./QuickCreate";
import UserBadge from "./UserBadge";

export default function GlobalTopBar() {
  const pathname = usePathname();
  if (pathname?.startsWith("/marketing") || pathname?.startsWith("/login")) return null;

  return (
    <div className="fixed right-5 top-4 z-[250] flex items-center gap-2 no-print">
      <UserBadge />
      <ThemeToggle compact />
      <SandboxToggle />
      <QuickCreate />
    </div>
  );
}
