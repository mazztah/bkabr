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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory.length, chatSending]);

  const handleSend = async () => {
    if (!input.trim() || chatSending) return;
    const msg = input;
    setInput("");
    await sendChat(msg);
  };

  if (!chatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-5 right-5 z-[200] rounded-full bg-primary text-primary-foreground shadow-lg h-14 w-14 flex items-center justify-center text-2xl no-print hover:scale-105 transition-transform"
        title="BetriebsKostenBot – überall verfügbar"
      >
        🤖
      </button>
    );
  }

  return (
    <aside className="fixed bottom-5 right-5 z-[200] w-[calc(100vw-2.5rem)] max-w-sm h-[32rem] max-h-[75vh] rounded-2xl border border-border bg-card flex flex-col shadow-2xl no-print overflow-hidden">
      <div className="p-4 border-b border-border font-semibold flex items-center justify-between shrink-0">
        <span>🤖 BetriebsKostenBot</span>
        <button onClick={toggleChat} className="text-muted-foreground hover:text-foreground text-sm">
          ✕
        </button>
      </div>

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

      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Frage den Bot …"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
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
    </aside>
  );
}
