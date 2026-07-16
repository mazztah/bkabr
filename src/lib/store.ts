import { create } from "zustand";
import { Abrechnung, ChatMessage, ObjektTyp, Status } from "./types";

interface Filters {
  objektTyp: ObjektTyp | "Alle";
  status: Status | "Alle";
  jahr: string | "Alle";
  suche: string;
}

interface StoreState {
  abrechnungen: Abrechnung[];
  selectedId: string | null;
  loading: boolean;
  isAnalyzing: boolean;
  isGenerating: boolean;
  isChecking: boolean;
  error: string | null;
  filters: Filters;
  chatOpen: boolean;

  fetchAll: () => Promise<void>;
  select: (id: string | null) => void;
  setFilters: (f: Partial<Filters>) => void;
  toggleChat: () => void;

  uploadFiles: (files: File[]) => Promise<void>;
  patchAbrechnung: (id: string, patch: Partial<Abrechnung>) => Promise<void>;
  deleteAbrechnung: (id: string) => Promise<void>;
  createBlank: () => Promise<void>;

  generateAbrechnung: (id: string) => Promise<void>;
  generateAnschreiben: (id: string, anlass: string) => Promise<void>;
  runRechtCheck: (id: string | null) => Promise<string>;
  sendChat: (message: string) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  abrechnungen: [],
  selectedId: null,
  loading: false,
  isAnalyzing: false,
  isGenerating: false,
  isChecking: false,
  error: null,
  filters: { objektTyp: "Alle", status: "Alle", jahr: "Alle", suche: "" },
  chatOpen: true,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/abrechnungen");
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const data = await res.json();
      set({ abrechnungen: data.abrechnungen, loading: false });
      const { selectedId } = get();
      if (!selectedId && data.abrechnungen.length > 0) {
        set({ selectedId: data.abrechnungen[0].id });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),

  uploadFiles: async (files: File[]) => {
    set({ isAnalyzing: true, error: null });
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Analyse fehlgeschlagen");
        }
        const data = await res.json();
        set((s) => ({
          abrechnungen: [data.abrechnung, ...s.abrechnungen],
          selectedId: data.abrechnung.id,
        }));
      }
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isAnalyzing: false });
    }
  },

  patchAbrechnung: async (id, patch) => {
    // optimistic update
    set((s) => ({
      abrechnungen: s.abrechnungen.map((a) =>
        a.id === id ? { ...a, ...patch, workspace: { ...a.workspace, ...(patch.workspace || {}) } } : a
      ),
    }));
    try {
      const res = await fetch(`/api/abrechnungen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      const data = await res.json();
      set((s) => ({
        abrechnungen: s.abrechnungen.map((a) => (a.id === id ? data.abrechnung : a)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteAbrechnung: async (id) => {
    await fetch(`/api/abrechnungen/${id}`, { method: "DELETE" });
    set((s) => ({
      abrechnungen: s.abrechnungen.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  createBlank: async () => {
    const res = await fetch("/api/abrechnungen", { method: "POST", body: JSON.stringify({}) });
    const data = await res.json();
    set((s) => ({
      abrechnungen: [data.abrechnung, ...s.abrechnungen],
      selectedId: data.abrechnung.id,
    }));
  },

  generateAbrechnung: async (id) => {
    set({ isGenerating: true, error: null });
    try {
      const res = await fetch("/api/generate/abrechnung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Generierung fehlgeschlagen");
      const data = await res.json();
      set((s) => ({
        abrechnungen: s.abrechnungen.map((a) => (a.id === id ? data.abrechnung : a)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isGenerating: false });
    }
  },

  generateAnschreiben: async (id, anlass) => {
    set({ isGenerating: true, error: null });
    try {
      const res = await fetch("/api/generate/anschreiben", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, anlass }),
      });
      if (!res.ok) throw new Error("Generierung fehlgeschlagen");
      const data = await res.json();
      set((s) => ({
        abrechnungen: s.abrechnungen.map((a) => (a.id === id ? data.abrechnung : a)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isGenerating: false });
    }
  },

  runRechtCheck: async (id) => {
    set({ isChecking: true, error: null });
    try {
      const res = await fetch("/api/recht", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Rechtsprüfung fehlgeschlagen");
      const data = await res.json();
      return data.analysis as string;
    } catch (e: any) {
      set({ error: e.message });
      return "";
    } finally {
      set({ isChecking: false });
    }
  },

  sendChat: async (message: string) => {
    const { selectedId, abrechnungen } = get();
    const current = abrechnungen.find((a) => a.id === selectedId) || null;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    if (current) {
      set((s) => ({
        abrechnungen: s.abrechnungen.map((a) =>
          a.id === current.id ? { ...a, chat: [...a.chat, userMsg] } : a
        ),
      }));
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, id: selectedId }),
      });
      if (!res.ok) throw new Error("Chat fehlgeschlagen");
      const data = await res.json();
      if (current) {
        set((s) => ({
          abrechnungen: s.abrechnungen.map((a) => (a.id === current.id ? data.abrechnung : a)),
        }));
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },
}));
