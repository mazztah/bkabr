"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { AgentHinweis, AgentSchedule, AgentScheduleRecurrence } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import KpiInfo from "@/components/KpiInfo";

function formatRecurrence(r: AgentScheduleRecurrence): string {
  if (r.art === "intervall") return `alle ${r.minuten} Min.`;
  if (r.art === "taeglich") return `täglich ${r.uhrzeit} Uhr`;
  const tage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `wöchentlich ${tage[r.wochentag]} ${r.uhrzeit} Uhr`;
}

const SCHWEREGRAD_STYLE: Record<AgentHinweis["schweregrad"], string> = {
  info: "border-border bg-card",
  warnung: "border-[var(--destructive)]/40 bg-[var(--destructive)]/5",
  kritisch: "border-[var(--destructive)] bg-[var(--destructive)]/10",
};

const SCHWEREGRAD_ICON: Record<AgentHinweis["schweregrad"], string> = {
  info: "💡",
  warnung: "⚠️",
  kritisch: "🚨",
};

export default function LlmControlCenter() {
  const { chatHistory, sendChat, chatSending, openChat } = useStore();
  const [hinweise, setHinweise] = useState<AgentHinweis[] | null>(null);
  const [routinen, setRoutinen] = useState<AgentSchedule[] | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/dashboard/hinweise")
      .then((r) => r.json())
      .then((d) => setHinweise(d.hinweise || []));
    fetch("/api/kalender")
      .then((r) => r.json())
      .then((d) => setRoutinen((d.schedules || []).filter((s: AgentSchedule) => s.aktiv)));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory.length, chatSending]);

  const handleSend = async () => {
    if (!input.trim() || chatSending) return;
    const msg = input;
    setInput("");
    await sendChat(msg);
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">🧠 LLM Dashboard Agent</h2>
        <p className="text-xs text-muted-foreground">
          Hinweise unten sind regelbasiert aus echten Kennzahlen abgeleitet (keine LLM-Halluzination).
          Für Rückfragen und Aufträge steht derselbe Agent bereit, der auch als schwebendes Chatfenster
          auf jeder Seite verfügbar ist — beide teilen sich denselben Gesprächsverlauf.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Hinweise */}
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Agent-Hinweise</div>
          {!hinweise ? (
            <p className="text-xs text-muted-foreground">Lade…</p>
          ) : (
            <div className="space-y-2">
              {hinweise.map((h) => (
                <div key={h.id} className={cn("rounded-lg border p-2.5 text-xs", SCHWEREGRAD_STYLE[h.schweregrad])}>
                  <div className="flex items-start gap-1.5">
                    <span>{SCHWEREGRAD_ICON[h.schweregrad]}</span>
                    <div className="flex-1">
                      <span>{h.text}</span>
                      {h.kpiId && (
                        <span className="ml-1 inline-flex align-middle">
                          <KpiInfo kpiId={h.kpiId} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">Chat mit dem Agenten</div>
            <button onClick={openChat} className="text-[10px] text-primary hover:underline">
              im Fenster öffnen
            </button>
          </div>
          <div ref={scrollRef} className="mb-2 h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {chatHistory.length === 0 ? (
              <p className="p-1 text-xs text-muted-foreground">
                Noch kein Gespräch. Frag z.B. „Wie steht es um die Liquidität?&rdquo;
              </p>
            ) : (
              chatHistory.slice(-6).map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg p-2 text-xs whitespace-pre-wrap",
                    m.role === "user" ? "ml-4 bg-primary text-primary-foreground" : "mr-4 bg-muted"
                  )}
                >
                  {m.content}
                </div>
              ))
            )}
            {chatSending && <div className="mr-4 animate-pulse rounded-lg bg-muted p-2 text-xs">Denke nach …</div>}
          </div>
          <div className="flex gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Frage den Agenten …"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={chatSending}
              className="rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              ➤
            </button>
          </div>
        </div>

        {/* Routinen */}
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">Aktive Routinen (Daily Loop)</div>
            <Link href="/kalender" className="text-[10px] text-primary hover:underline">
              verwalten
            </Link>
          </div>
          {!routinen ? (
            <p className="text-xs text-muted-foreground">Lade…</p>
          ) : routinen.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Noch keine aktiven Routinen. Unter „Kalender&rdquo; lassen sich wiederkehrende Agent-Aufträge
              anlegen (z.B. täglich Liquidität prüfen).
            </p>
          ) : (
            <div className="space-y-1.5">
              {routinen.slice(0, 6).map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-2 text-xs">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatRecurrence(r.recurrence)} · nächste Ausführung {formatDate(r.nextRunAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
