"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard / Abrechnungen",
  "/liegenschaften": "Liegenschaften",
  "/gebaeude": "Gebäude",
  "/wohnungen": "Wohnungen",
  "/mieter": "Mieter",
  "/schriftverkehr": "Schriftverkehr",
  "/mietvertraege": "Mietverträge",
  "/eigentuemer": "Eigentümer",
  "/investoren": "Investoren",
  "/pm-vertrag": "PM-Vertrag",
  "/dienstleistungsvertraege": "Dienstleistungsverträge",
  "/kontoauszuege": "Kontoauszüge",
  "/vorauszahlungen": "Vorauszahlungen",
  "/budgetierung": "Budgetierung",
  "/finanzierung": "Finanzierung",
  "/instandhaltung": "Instandhaltung",
  "/auftraege": "Aufträge",
  "/rechnungen": "Rechnungen",
  "/assetmanagement": "Assetmanagement",
  "/auswertung": "Auswertung",
};

export default function ChatWindow() {
  const { abrechnungen, selectedId, sendChat, chatOpen, toggleChat, chatHistory, chatSending } =
    useStore();
  const abr = abrechnungen.find((a) => a.id === selectedId);
  const pathname = usePathname() || "/";
  const pageLabel = PAGE_LABELS[pathname] || pathname;
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory.length, chatSending]);

  if (pathname.startsWith("/login")) return null;

  const handleSend = async () => {
    if (!input.trim() || chatSending) return;
    const msg = input;
    setInput("");
    await sendChat(msg);
  };

  if (!chatOpen) {
    return (
      <button
        onClick={() => {
          setMinimized(false);
          toggleChat();
        }}
        className="fixed bottom-5 right-5 z-[200] rounded-full bg-primary text-primary-foreground shadow-lg h-14 w-14 flex items-center justify-center text-2xl no-print transition-transform hover:scale-105 active:scale-95"
        title="BetriebsKostenBot – überall verfügbar"
      >
        🤖
      </button>
    );
  }

  return (
    <aside
      className={`fixed bottom-5 right-5 z-[200] flex flex-col rounded-2xl border border-border bg-card shadow-2xl no-print overflow-hidden transition-[height,width] duration-200 ease-out ${
        minimized
          ? "h-14 w-[calc(100vw-2.5rem)] max-w-sm"
          : expanded
          ? "h-[85vh] max-h-[46rem] w-[calc(100vw-2.5rem)] max-w-lg"
          : "h-[32rem] max-h-[75vh] w-[calc(100vw-2.5rem)] max-w-sm"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-4 font-semibold">
        <button
          onClick={() => setMinimized((m) => !m)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={minimized ? "Aufklappen" : "Einklappen"}
        >
          <span className="shrink-0">🤖</span>
          <span className="truncate">BetriebsKostenBot</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{minimized ? "▲" : "▼"}</span>
        </button>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 hidden text-muted-foreground hover:text-foreground text-sm sm:inline"
          title={expanded ? "Verkleinern" : "Vergrößern"}
        >
          {expanded ? "⤡" : "⤢"}
        </button>
        <button
          onClick={() => {
            setMinimized(false);
            toggleChat();
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground text-sm"
          title="Schließen"
        >
          ✕
        </button>
      </div>

      {!minimized && (
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="bg-muted p-3 rounded-xl text-sm">
          Du bist auf: <strong>{pageLabel}</strong>
          {abr && (
            <>
              <br />
              Abrechnung: <strong>{abr.name}</strong>
            </>
          )}
          <br />
          Ich bin auf jeder Seite erreichbar. Fragen beantworte ich direkt; Aufträge wie
          „Erstelle alle Mahnungen für die Spannhagengartenstraße“ führe ich als Agent aus und
          lege die Briefe unter Schriftverkehr ab.
        </div>
        {chatHistory.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground ml-6" : "bg-muted mr-6"
            }`}
          >
            {m.content}
          </div>
        ))}
        {chatSending && (
          <div className="bg-muted p-3 rounded-xl text-sm mr-6 animate-pulse">Denke nach …</div>
        )}
      </div>
      )}

      {!minimized && (
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Frage den Bot …"
            autoFocus
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={chatSending}
            className="bg-primary text-primary-foreground px-3 rounded-md disabled:opacity-50"
          >
            ➤
          </button>
        </div>
      </div>
      )}
    </aside>
  );
}
