"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function ChatWindow() {
  const { abrechnungen, selectedId, sendChat, chatOpen, toggleChat } = useStore();
  const abr = abrechnungen.find((a) => a.id === selectedId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [abr?.chat?.length]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msg = input;
    setInput("");
    setSending(true);
    await sendChat(msg);
    setSending(false);
  };

  if (!chatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-primary text-primary-foreground shadow-lg h-12 w-12 flex items-center justify-center text-xl no-print"
        title="Chat öffnen"
      >
        🤖
      </button>
    );
  }

  return (
    <aside className="w-full lg:w-96 shrink-0 border-l border-border bg-card flex flex-col h-full no-print">
      <div className="p-4 border-b border-border font-semibold flex items-center justify-between">
        <span>🤖 BetriebsKostenBot</span>
        <button onClick={toggleChat} className="text-muted-foreground hover:text-foreground text-sm">
          Minimieren
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="bg-muted p-3 rounded-xl text-sm">
          Aktueller Kontext: <strong>{abr?.name || "Keine Abrechnung ausgewählt"}</strong>
          <br />
          Ich sehe die gesamte Seite – frag mich z.B. nach fehlenden Positionen, USt bei
          Gewerbeobjekten oder Formulierungen fürs Anschreiben.
        </div>
        {(abr?.chat || []).map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-primary text-primary-foreground ml-6"
                : "bg-muted mr-6"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <div className="bg-muted p-3 rounded-xl text-sm mr-6 animate-pulse">Denke nach …</div>}
      </div>

      <div className="p-4 border-t border-border">
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
            disabled={sending}
            className="bg-primary text-primary-foreground px-3 rounded-md disabled:opacity-50"
          >
            ➤
          </button>
        </div>
      </div>
    </aside>
  );
}
