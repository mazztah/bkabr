import { create } from "zustand";
import { Abrechnung, ChatMessage, ObjektTyp, Status } from "./types";

interface Filters {
  objektTyp: ObjektTyp | "Alle";
  status: Status | "Alle";
  jahr: string | "Alle";
  suche: string;
}

interface PendingLiegenschaft {
  abrechnungId: string;
  grund: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
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
  chatHistory: ChatMessage[];
  chatSending: boolean;
  mobileNavOpen: boolean;
  pendingLiegenschaften: PendingLiegenschaft[];

  fetchAll: () => Promise<void>;
  select: (id: string | null) => void;
  setFilters: (f: Partial<Filters>) => void;
  toggleChat: () => void;
  openChat: () => void;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  confirmPendingLiegenschaft: () => Promise<void>;
  dismissPendingLiegenschaft: () => void;

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
  chatOpen: false,
  chatHistory: [],
  chatSending: false,
  mobileNavOpen: false,
  pendingLiegenschaften: [],

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
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  openChat: () => set({ chatOpen: true }),

  uploadFiles: async (files: File[]) => {
    set({ isAnalyzing: true, error: null });
    const fehler: string[] = [];
    try {
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/analyze", { method: "POST", body: fd });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Analyse fehlgeschlagen");
          }
          const data = await res.json();
          set((s) => ({
            abrechnungen: [data.abrechnung, ...s.abrechnungen.filter((a) => a.id !== data.abrechnung.id)],
            selectedId: data.abrechnung.id,
            pendingLiegenschaften: data.liegenschaftVorschlag
              ? [
                  ...s.pendingLiegenschaften,
                  { abrechnungId: data.abrechnung.id, ...data.liegenschaftVorschlag },
                ]
              : s.pendingLiegenschaften,
          }));
        } catch (e: any) {
          // Fehler bei einer einzelnen Datei (z.B. falscher Dokumenttyp) darf die
          // übrigen Dateien des Batches nicht blockieren.
          fehler.push(`${file.name}: ${e.message || "Analyse fehlgeschlagen"}`);
        }
      }
      if (fehler.length > 0) {
        set({ error: fehler.join(" · ") });
      }
    } finally {
      set({ isAnalyzing: false });
    }
  },

  confirmPendingLiegenschaft: async () => {
    const item = get().pendingLiegenschaften[0];
    if (!item) return;
    try {
      const res = await fetch("/api/liegenschaften", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.strasse ? `${item.strasse} ${item.hausnummer}`.trim() : item.grund,
          strasse: item.strasse,
          hausnummer: item.hausnummer,
          plz: item.plz,
          ort: item.ort,
        }),
      });
      const json = await res.json();
      if (json.liegenschaft) {
        await fetch(`/api/abrechnungen/${item.abrechnungId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liegenschaftId: json.liegenschaft.id }),
        });
        await get().fetchAll();
      }
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set((s) => ({ pendingLiegenschaften: s.pendingLiegenschaften.slice(1) }));
    }
  },

  dismissPendingLiegenschaft: () =>
    set((s) => ({ pendingLiegenschaften: s.pendingLiegenschaften.slice(1) })),

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
    const { selectedId } = get();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    set((s) => ({ chatHistory: [...s.chatHistory, userMsg], chatSending: true }));

    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    const history = get()
      .chatHistory.slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, id: selectedId, path, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Chat fehlgeschlagen (HTTP ${res.status})`);
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "(Keine Antwort)",
        timestamp: new Date().toISOString(),
      };
      set((s) => ({ chatHistory: [...s.chatHistory, assistantMsg], chatSending: false, error: null }));
    } catch (e: any) {
      const errText = e?.message || "Chat fehlgeschlagen";
      set((s) => ({
        error: errText,
        chatSending: false,
        chatHistory: [
          ...s.chatHistory,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ ${errText}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
    }
  },
}));
