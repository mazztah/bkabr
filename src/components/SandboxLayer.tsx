"use client";

import { useSandbox } from "@/lib/sandbox-context";
import SandboxNote from "./SandboxNote";

export function SandboxToggle() {
  const { enabled, toggle } = useSandbox();
  return (
    <button
      onClick={toggle}
      title="Sandbox-Modus (Notizen frei platzieren)"
      className={`flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-all ${
        enabled
          ? "bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-white scale-105"
          : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted"
      }`}
    >
      ✨
    </button>
  );
}

export default function SandboxLayer() {
  const { enabled, notes, addNote, restoreLast, canRestore } = useSandbox();
  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150]">
      <div className="pointer-events-auto fixed left-1/2 top-4 z-[160] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-lg">
        <span className="font-semibold">✨ Sandbox-Modus</span>
        <button
          onClick={addNote}
          className="rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
        >
          ＋ Notiz
        </button>
        {canRestore && (
          <button
            onClick={restoreLast}
            className="rounded-full border border-border px-2.5 py-1 hover:bg-muted"
          >
            ↩ Wiederherstellen
          </button>
        )}
        <span className="text-muted-foreground">Frei platzierbare Notizen – zum Beenden ✨ oben rechts klicken</span>
      </div>

      {notes.map((n) => (
        <SandboxNote key={n.id} note={n} />
      ))}
    </div>
  );
}
