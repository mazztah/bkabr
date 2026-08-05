"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { TeamNachricht } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const EMOJIS = ["👍", "🎉", "☕", "🏠", "✅", "🚀"];

export default function TeamTab() {
  const [nachrichten, setNachrichten] = useState<TeamNachricht[] | null>(null);
  const [name, setName] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("bkabr_team_name") || "" : ""));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch("/api/team-nachrichten")
      .then((r) => r.json())
      .then((d) => setNachrichten(d.nachrichten || []));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // einfaches Polling statt Websocket
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [nachrichten?.length]);

  const send = async (emoji?: string) => {
    const inhalt = emoji || text.trim();
    if (!inhalt || !name.trim() || busy) return;
    setBusy(true);
    try {
      localStorage.setItem("bkabr_team_name", name.trim());
      await fetch("/api/team-nachrichten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autorName: name.trim(), text: inhalt }),
      });
      setText("");
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[560px] flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">💬 Team-Nachrichten</h2>
        <p className="text-xs text-muted-foreground">
          Einfacher Team-Chat ohne Benutzerkonten — jeder, der diese App öffnet, sieht dieselben
          Nachrichten. Für echte Zugriffskontrolle wird später ein Auth-System benötigt.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {!nachrichten ? (
          <p className="text-xs text-muted-foreground">Lade…</p>
        ) : nachrichten.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Nachrichten — schreib die erste!</p>
        ) : (
          nachrichten.map((n) => (
            <div key={n.id} className="flex items-start gap-2">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
                title={n.autorName}
              >
                {n.autorName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold">{n.autorName}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDate(n.createdAt)}</span>
                </div>
                <div className={cn("rounded-lg bg-muted px-2.5 py-1.5 text-sm", n.text.length <= 2 && "text-lg")}>
                  {n.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-2.5">
        {!name && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name, um mitzuschreiben…"
            className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        )}
        <div className="mb-1.5 flex gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => send(e)}
              disabled={!name.trim() || busy}
              className="rounded-md px-1.5 py-0.5 text-base hover:bg-muted disabled:opacity-40"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={name ? "Nachricht schreiben…" : "Erst Namen eintragen…"}
            disabled={!name.trim()}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!text.trim() || !name.trim() || busy}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {name && (
          <button onClick={() => setName("")} className="mt-1 text-[10px] text-muted-foreground hover:underline">
            als „{name}&rdquo; — Name ändern
          </button>
        )}
      </div>
    </div>
  );
}
