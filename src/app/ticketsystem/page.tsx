"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useTicketData } from "@/lib/use-ticket-data";
import { TicketStatus } from "@/lib/types";
import { PrioBadge, StatusBadge } from "@/components/ticketsystem/badges";
import NewTicketForm from "@/components/ticketsystem/NewTicketForm";
import NewHandwerkerForm from "@/components/ticketsystem/NewHandwerkerForm";
import TicketDetail from "@/components/ticketsystem/TicketDetail";
import HandwerkerDetail from "@/components/ticketsystem/HandwerkerDetail";

type View = "tickets" | "handwerker";

const STATUS_FILTER: ("Alle" | TicketStatus)[] = [
  "Alle",
  "Eingang",
  "Zur Freigabe",
  "Freigegeben",
  "Zugewiesen",
  "In Bearbeitung",
  "Erledigt",
  "Abgelehnt",
  "Storniert",
];

const ABGESCHLOSSEN: TicketStatus[] = ["Erledigt", "Abgelehnt", "Storniert"];

function isSlaUeberfaellig(t: { status: TicketStatus; slaLoesungBis?: string }): boolean {
  if (!t.slaLoesungBis || ABGESCHLOSSEN.includes(t.status)) return false;
  return new Date(t.slaLoesungBis).getTime() < Date.now();
}

export default function TicketsystemPage() {
  const { data, loading, refresh } = useTicketData();
  const [view, setView] = useState<View>("tickets");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"Alle" | TicketStatus>("Alle");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewHandwerker, setShowNewHandwerker] = useState(false);

  const tickets = useMemo(() => {
    const filtered =
      statusFilter === "Alle" ? data.tickets : data.tickets.filter((t) => t.status === statusFilter);
    return filtered;
  }, [data.tickets, statusFilter]);

  const eingangAnzahl = data.tickets.filter((t) => t.status === "Eingang").length;
  const freigabeAnzahl = data.tickets.filter((t) => t.status === "Zur Freigabe").length;
  const ueberfaelligAnzahl = data.tickets.filter(isSlaUeberfaellig).length;

  const selectedTicket = data.tickets.find((t) => t.id === selectedTicketId);
  const selectedHandwerker = data.handwerker.find((h) => h.id === selectedHandwerkerId);

  const gotoTicket = (id: string) => {
    setView("tickets");
    setSelectedTicketId(id);
  };
  const gotoHandwerker = (id: string) => {
    setView("handwerker");
    setSelectedHandwerkerId(id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 overflow-y-auto border-r border-border bg-card max-h-[52vh] lg:h-full lg:max-h-none lg:w-96">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-bold leading-tight">🎫 Ticketsystem</h1>
          <p className="text-xs text-muted-foreground">Instandhaltung &amp; Aufträge – Auftragseingang, Freigaben, Handwerker</p>

          <div className="mt-3 flex gap-1 rounded-lg border border-border p-1">
            <button
              onClick={() => setView("tickets")}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-sm font-medium",
                view === "tickets" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              Tickets {eingangAnzahl > 0 && `(${eingangAnzahl} neu)`}
            </button>
            <button
              onClick={() => setView("handwerker")}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-sm font-medium",
                view === "handwerker" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              Handwerker
            </button>
          </div>

          {freigabeAnzahl > 0 && view === "tickets" && (
            <button
              onClick={() => setStatusFilter("Zur Freigabe")}
              className="mt-2 w-full rounded-md bg-amber-100 px-2 py-1.5 text-left text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
            >
              ⚠️ {freigabeAnzahl} Ticket{freigabeAnzahl > 1 ? "s" : ""} warten auf Freigabe
            </button>
          )}
          {ueberfaelligAnzahl > 0 && view === "tickets" && (
            <button
              onClick={() => setStatusFilter("Alle")}
              className="mt-2 w-full rounded-md bg-red-100 px-2 py-1.5 text-left text-xs font-medium text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
            >
              ⏰ {ueberfaelligAnzahl} Ticket{ueberfaelligAnzahl > 1 ? "s" : ""} über SLA-Lösungsfrist
            </button>
          )}
        </div>

        {view === "tickets" ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "Alle" | TicketStatus)}
                className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                {STATUS_FILTER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewTicket((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                title="Neues Ticket (Auftragseingang / manuell weiterreichen)"
              >
                {showNewTicket ? "✕" : "＋"}
              </button>
            </div>

            {showNewTicket && (
              <NewTicketForm
                data={data}
                onCreated={(id) => {
                  setShowNewTicket(false);
                  refresh().then(() => setSelectedTicketId(id));
                }}
                onClose={() => setShowNewTicket(false)}
              />
            )}

            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Lade…</div>
            ) : tickets.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Keine Tickets in diesem Filter.</p>
            ) : (
              <div className="space-y-0.5 p-2">
                {tickets.map((t) => {
                  const hw = data.handwerker.find((h) => h.id === t.handwerkerId);
                  const active = selectedTicketId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={cn(
                        "block w-full rounded px-2 py-2 text-left text-sm",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{t.titel}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          {isSlaUeberfaellig(t) && <span title="SLA überfällig">⏰</span>}
                          {t.prioritaet === "notfall" && <span>🔴</span>}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 flex flex-wrap items-center gap-1 text-xs",
                          active ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        <span>{t.nummer}</span>
                        <span>·</span>
                        <span>{hw ? hw.name : "nicht zugewiesen"}</span>
                      </div>
                      {!active && (
                        <div className="mt-1 flex gap-1">
                          <StatusBadge status={t.status} />
                          <PrioBadge prioritaet={t.prioritaet} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <span className="text-sm text-muted-foreground">{data.handwerker.length} Handwerker</span>
              <button
                onClick={() => setShowNewHandwerker((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                title="Neuer Handwerker"
              >
                {showNewHandwerker ? "✕" : "＋"}
              </button>
            </div>

            {showNewHandwerker && (
              <NewHandwerkerForm
                onCreated={(id) => {
                  setShowNewHandwerker(false);
                  refresh().then(() => setSelectedHandwerkerId(id));
                }}
                onClose={() => setShowNewHandwerker(false)}
              />
            )}

            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Lade…</div>
            ) : data.handwerker.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Noch keine Handwerker angelegt.</p>
            ) : (
              <div className="space-y-0.5 p-2">
                {data.handwerker.map((h) => {
                  const offene = data.tickets.filter(
                    (t) => t.handwerkerId === h.id && !["Erledigt", "Abgelehnt", "Storniert"].includes(t.status)
                  ).length;
                  const active = selectedHandwerkerId === h.id;
                  return (
                    <button
                      key={h.id}
                      onClick={() => setSelectedHandwerkerId(h.id)}
                      className={cn(
                        "block w-full rounded px-2 py-2 text-left text-sm",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <div className="truncate font-medium">
                        {h.status === "aktiv" ? "🟢" : h.status === "gesperrt" ? "🔴" : "⚪"} {h.name}
                      </div>
                      <div
                        className={cn(
                          "truncate text-xs",
                          active ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        {h.nummer} · {h.gewerk}
                        {offene > 0 ? ` · ${offene} offen` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {view === "tickets" ? (
          selectedTicket ? (
            <TicketDetail
              ticket={selectedTicket}
              handwerker={data.handwerker}
              data={data}
              onChanged={refresh}
              onSelectHandwerker={gotoHandwerker}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Ticket auswählen oder mit „＋" ein neues anlegen — z.B. um einen Auftrag aus Instandhaltung
              manuell ans Ticketsystem weiterzureichen.
            </div>
          )
        ) : selectedHandwerker ? (
          <HandwerkerDetail
            handwerker={selectedHandwerker}
            tickets={data.tickets}
            onChanged={refresh}
            onSelectTicket={gotoTicket}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Handwerker auswählen oder mit „＋" neu anlegen.
          </div>
        )}
      </main>
    </div>
  );
}
