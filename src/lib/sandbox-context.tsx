"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
}

interface SandboxState {
  enabled: boolean;
  toggle: () => void;
  notes: StickyNote[];
  addNote: () => void;
  updateNote: (id: string, patch: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  restoreLast: () => void;
  canRestore: boolean;
}

const SandboxContext = createContext<SandboxState | null>(null);

const STORAGE_KEY = "bkabr:sandbox:notes";
const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function SandboxProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [lastDeleted, setLastDeleted] = useState<StickyNote | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // ignore
    }
  }, [notes, hydrated]);

  const addNote = useCallback(() => {
    const note: StickyNote = {
      id: uid(),
      x: 120 + Math.random() * 200,
      y: 120 + Math.random() * 150,
      w: 220,
      h: 180,
      text: "Neue Notiz…",
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      fontSize: 14,
      fontFamily: "sans-serif",
    };
    setNotes((prev) => [...prev, note]);
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<StickyNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id);
      if (note) setLastDeleted(note);
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const restoreLast = useCallback(() => {
    if (!lastDeleted) return;
    setNotes((prev) => [...prev, lastDeleted]);
    setLastDeleted(null);
  }, [lastDeleted]);

  return (
    <SandboxContext.Provider
      value={{
        enabled,
        toggle: () => setEnabled((v) => !v),
        notes,
        addNote,
        updateNote,
        deleteNote,
        restoreLast,
        canRestore: !!lastDeleted,
      }}
    >
      {children}
    </SandboxContext.Provider>
  );
}

export function useSandbox() {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error("useSandbox must be used within SandboxProvider");
  return ctx;
}

export { COLORS as SANDBOX_COLORS };
