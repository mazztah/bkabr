"use client";

import ThemeToggle from "./ThemeToggle";
import { SandboxToggle } from "./SandboxLayer";
import QuickCreate from "./QuickCreate";

export default function GlobalTopBar() {
  return (
    <div className="fixed right-5 top-4 z-[250] flex items-center gap-2 no-print">
      <ThemeToggle compact />
      <SandboxToggle />
      <QuickCreate />
    </div>
  );
}
