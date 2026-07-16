"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-base ring-1 ring-border transition-colors hover:bg-muted"
        title="Dark Mode umschalten"
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
      title="Dark Mode umschalten"
    >
      {isDark ? "☀️ Hell" : "🌙 Dunkel"}
    </button>
  );
}
