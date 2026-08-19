"use client";

import { useEffect, useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import {
  AnhangTyp,
  Handwerker,
  Ticket,
  TicketKostenart,
  TicketMelderTyp,
  TicketNachricht,
  TicketPrioritaet,
  TicketSchadensart,
  TicketSchluesselstatus,
  TicketArt,
  TICKET_ARTEN,
  TICKET_KOSTENARTEN,
  TICKET_MELDERTYPEN,
  TICKET_RECHNUNGSSTATUS,
  TICKET_SCHADENSARTEN,
  TICKET_SCHLUESSELSTATUS,
} from "@/lib/types";
import { PrioBadge, PRIO_LABEL, StatusBadge } from "./badges";
import { Anhaenge, hochladenUndAnhaengen } from "@/components/Anhaenge";
import { objektPfad, TicketSystemData } from "@/lib/use-ticket-data";

const TICKET_DOK_TYPEN: AnhangTyp[] = ["Angebot", "Rechnung", "Foto", "Sonstiges"];

async function patchTicket(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** Zeigt Reaktions-/Lösungsfrist mit Ampel (grün=erledigt/im Plan, gelb=<25% Restzeit, rot=überfällig). */
function SlaZeile({ label, deadline, erreichtAm }: { label: string; deadline?: string; erreichtAm?: string }) {
  if (!deadline) return null;
  const now = Date.now();
  const zielMs = new Date(deadline).getTime();
  const erreicht = !!erreichtAm;
  const ueberfaellig = !erreicht && zielMs < now;
  const restMs = zielMs - now;
  const farbe = erreicht
    ? "text-emerald-600"
    : ueberfaellig
      ? "text-red-600 font-medium"
      : restMs < 6 * 3600 * 1000
        ? "text-amber-600"
        : "text-muted-foreground";
  return (
    <div className={cn("text-xs", farbe)}>
      {label}: {formatDate(deadline)} {erreicht ? "✓ erreicht" : ueberfaellig ? "⚠️ überfällig" : ""}
    </div>
  );
}

export default function TicketDetail({
  ticket,
  handwerker,
  data,
  onChanged,
  onSelectHandwerker,
}: {
  ticket: Ticket;
  handwerker: Handwerker[];
  data: TicketSystemData;
  onChanged: () => void;
  onSelectHandwerker?: (id: string) => void;
}) {
  const [nachrichten, setNachrichten] = useState<TicketNachricht[]>([]);
  const [neueNachricht, setNeueNachricht] = useState("");
  const [nachrichtIntern, setNachrichtIntern] = useState(true);
  const [zuweisenId, setZuweisenId] = useState("");
  const [ablehnenGrund, setAblehnenGrund] = useState("");
  const [showAblehnen, setShowAblehnen] = useState(false);
  const [freigabeKommentar, setFreigabeKommentar] = useState("");
  const [busy, setBusy] = useState(false);

  const zugewiesen = handwerker.find((h) => h.id === ticket.handwerkerId);

  const loadNachrichten = async () => {
    const res = await fetch(`/api/tickets/${ticket.id}/nachrichten`);
    const json = await res.json();
    setNachrichten(json.nachrichten || []);
  };

  useEffect(() => {
    loadNachrichten();
    setZuweisenId(ticket.handwerkerId || "");
    setShowAblehnen(false);
    setAblehnenGrund("");
    setFreigabeKommentar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const sendNachricht = async () => {
    if (!neueNachricht.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/nachrichten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: neueNachricht, intern: nachrichtIntern, von: "Verwaltung" }),
      });
      setNeueNachricht("");
      await loadNachrichten();
    } finally {
      setBusy(false);
    }
  };

  const zuweisen = async () => {
    if (!zuweisenId) return;
    setBusy(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/zuweisen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handwerkerId: zuweisenId, von: "Verwaltung" }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const freigeben = async () => {
    setBusy(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ von: "Verwaltung", kommentar: freigabeKommentar || undefined }),
      });
      setFreigabeKommentar("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const ablehnen = async () => {
    if (!ablehnenGrund.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/ablehnen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ von: "Verwaltung", grund: ablehnenGrund }),
      });
      setShowAblehnen(false);
      setAblehnenGrund("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: Ticket["status"]) => {
    await patchTicket(ticket.id, { status });
    onChanged();
  };

  const deleteTicket = async () => {
    if (!window.confirm(`Ticket „${ticket.titel}" wirklich löschen?`)) return;
    await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
    onChanged();
  };

  const kandidaten = handwerker.filter((h) => h.status === "aktiv");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            {ticket.nummer} · {ticket.quelle}
          </div>
          <h1 className="text-xl font-bold">🎫 {ticket.titel}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PrioBadge prioritaet={ticket.prioritaet} />
            {ticket.ticketArt && ticket.ticketArt !== "Reparatur" && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                {ticket.ticketArt}
              </span>
            )}
            {ticket.erstelltVon && (
              <span className="text-xs text-muted-foreground">
                gemeldet von {ticket.erstelltVon}
                {ticket.melderTyp ? ` (${ticket.melderTyp})` : ""}
              </span>
            )}
          </div>
          {(ticket.liegenschaftId || ticket.gebaeudeId || ticket.wohnungId || ticket.mieterId) && (
            <div className="mt-1 text-xs text-muted-foreground">📍 {objektPfad(data, ticket)}</div>
          )}
          <div className="mt-1 flex flex-wrap gap-3">
            <SlaZeile label="SLA Reaktion" deadline={ticket.slaReaktionBis} erreichtAm={ticket.ersteReaktionAm} />
            <SlaZeile
              label="SLA Lösung"
              deadline={ticket.slaLoesungBis}
              erreichtAm={ticket.status === "Erledigt" ? ticket.updatedAt : undefined}
            />
          </div>
        </div>
        <select
          value={ticket.status}
          onChange={(e) => setStatus(e.target.value as Ticket["status"])}
          className="rounded-full border border-border bg-background px-2 py-1 text-xs"
        >
          {[
            "Eingang",
            "Zur Freigabe",
            "Freigegeben",
            "Zugewiesen",
            "In Bearbeitung",
            "Erledigt",
            "Abgelehnt",
            "Storniert",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {ticket.beschreibung && (
        <p className="mb-4 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {ticket.beschreibung}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Priorität</div>
          <select
            value={ticket.prioritaet}
            onChange={(e) => patchTicket(ticket.id, { prioritaet: e.target.value as TicketPrioritaet }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          >
            {(["niedrig", "mittel", "hoch", "notfall"] as TicketPrioritaet[]).map((p) => (
              <option key={p} value={p}>
                {PRIO_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Ticket-Art</div>
          <select
            value={ticket.ticketArt || "Reparatur"}
            onChange={(e) => patchTicket(ticket.id, { ticketArt: e.target.value as TicketArt }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          >
            {TICKET_ARTEN.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Schadensart</div>
          <select
            value={ticket.schadensart || ""}
            onChange={(e) => patchTicket(ticket.id, { schadensart: (e.target.value || undefined) as TicketSchadensart }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">—</option>
            {TICKET_SCHADENSARTEN.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Melder-Typ</div>
          <select
            value={ticket.melderTyp || ""}
            onChange={(e) => patchTicket(ticket.id, { melderTyp: (e.target.value || undefined) as TicketMelderTyp }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">—</option>
            {TICKET_MELDERTYPEN.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Zuständiger Mitarbeiter</div>
          <input
            defaultValue={ticket.zustaendigerMitarbeiter}
            onBlur={(e) => patchTicket(ticket.id, { zustaendigerMitarbeiter: e.target.value || undefined }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Fälligkeit</div>
          <input
            type="date"
            defaultValue={ticket.faelligkeitsdatum?.slice(0, 10)}
            onBlur={(e) => patchTicket(ticket.id, { faelligkeitsdatum: e.target.value || undefined }).then(onChanged)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Kaufmännische Daten */}
      <div className="mb-4 rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-medium">Kaufmännisch</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Kostenstelle</div>
            <input
              defaultValue={ticket.kostenstelle}
              onBlur={(e) => patchTicket(ticket.id, { kostenstelle: e.target.value || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Kostenart</div>
            <select
              value={ticket.kostenart || ""}
              onChange={(e) => patchTicket(ticket.id, { kostenart: (e.target.value || undefined) as TicketKostenart }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {TICKET_KOSTENARTEN.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Bestellnummer</div>
            <input
              defaultValue={ticket.bestellnummer}
              onBlur={(e) => patchTicket(ticket.id, { bestellnummer: e.target.value || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Kostenschätzung (€)</div>
            <input
              type="number"
              defaultValue={ticket.kostenSchaetzung}
              onBlur={(e) => patchTicket(ticket.id, { kostenSchaetzung: Number(e.target.value) || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Rechnungssumme (€)</div>
            <input
              type="number"
              defaultValue={ticket.rechnungssumme}
              onBlur={(e) => patchTicket(ticket.id, { rechnungssumme: Number(e.target.value) || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Rechnungsstatus</div>
            <select
              value={ticket.rechnungsstatus || ""}
              onChange={(e) => patchTicket(ticket.id, { rechnungsstatus: e.target.value || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {TICKET_RECHNUNGSSTATUS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Terminierung & Zugang */}
      <div className="mb-4 rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-medium">Terminierung &amp; Zugang</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Vereinbarter Termin</div>
            <input
              type="datetime-local"
              defaultValue={ticket.vereinbarterTermin?.slice(0, 16)}
              onBlur={(e) =>
                patchTicket(ticket.id, {
                  vereinbarterTermin: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }).then(onChanged)
              }
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Schlüsselstatus</div>
            <select
              value={ticket.schluesselstatus || ""}
              onChange={(e) => patchTicket(ticket.id, { schluesselstatus: (e.target.value || undefined) as TicketSchluesselstatus }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {TICKET_SCHLUESSELSTATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <div className="text-xs font-medium text-muted-foreground">Verfügbarkeit des Mieters</div>
            <input
              defaultValue={ticket.mieterVerfuegbarkeit}
              placeholder="z.B. werktags ab 16 Uhr, Rufnummer vorab abstimmen"
              onBlur={(e) => patchTicket(ticket.id, { mieterVerfuegbarkeit: e.target.value || undefined }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Gewerbe-Zusatzdaten – nur wenn Ticket an eine Gewerbeeinheit gebunden ist */}
      {data.wohnungen.find((w) => w.id === ticket.wohnungId)?.typ === "Gewerbe" && (
        <div className="mb-4 rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-medium">🏢 Gewerbe-Zusatzdaten</div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!ticket.betriebsunterbrechungRisiko}
                onChange={(e) => patchTicket(ticket.id, { betriebsunterbrechungRisiko: e.target.checked }).then(onChanged)}
              />
              Betriebsunterbrechungs-Risiko
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!ticket.sicherheitsfreigabeErforderlich}
                onChange={(e) => patchTicket(ticket.id, { sicherheitsfreigabeErforderlich: e.target.checked }).then(onChanged)}
              />
              Sicherheitsfreigabe/Begleitperson erforderlich
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!ticket.wartungsvertragVorhanden}
                onChange={(e) => patchTicket(ticket.id, { wartungsvertragVorhanden: e.target.checked }).then(onChanged)}
              />
              Wartungsvertrag vorhanden
            </label>
            {ticket.wartungsvertragVorhanden && (
              <input
                defaultValue={ticket.wartungspartner}
                placeholder="Wartungspartner (Firma)"
                onBlur={(e) => patchTicket(ticket.id, { wartungspartner: e.target.value || undefined }).then(onChanged)}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>
      )}

      {/* Freigabe-Workflow */}
      {ticket.freigabeErforderlich && ticket.status !== "Freigegeben" && !["Erledigt", "Abgelehnt", "Storniert"].includes(ticket.status) && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="mb-1 text-sm font-medium">⚠️ Freigabe erforderlich</div>
          <input
            value={freigabeKommentar}
            onChange={(e) => setFreigabeKommentar(e.target.value)}
            placeholder="Kommentar zur Freigabe (optional)"
            className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            onClick={freigeben}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✓ Freigeben
          </button>
        </div>
      )}
      {ticket.freigegebenVon && (
        <p className="mb-4 text-xs text-muted-foreground">
          ✓ Freigegeben von {ticket.freigegebenVon} am {ticket.freigegebenAm && formatDate(ticket.freigegebenAm)}
          {ticket.freigabeKommentar ? ` – „${ticket.freigabeKommentar}"` : ""}
        </p>
      )}

      {/* Zuweisung / manuelle Weiterleitung an Handwerker */}
      <div className="mb-4 rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-medium">Handwerker zuweisen / Auftrag weiterreichen</div>
        {zugewiesen && (
          <div className="mb-2 text-sm">
            Aktuell zugewiesen:{" "}
            <button
              onClick={() => onSelectHandwerker?.(zugewiesen.id)}
              className="font-medium text-primary hover:underline"
            >
              {zugewiesen.name}
            </button>{" "}
            <span className="text-xs text-muted-foreground">({zugewiesen.gewerk})</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            value={zuweisenId}
            onChange={(e) => setZuweisenId(e.target.value)}
            className="min-w-[220px] flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Handwerker wählen —</option>
            {kandidaten.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} · {h.gewerk}
                {h.firma ? ` (${h.firma})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={zuweisen}
            disabled={busy || !zuweisenId || zuweisenId === ticket.handwerkerId}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {zugewiesen ? "Weiterleiten" : "Zuweisen"}
          </button>
        </div>
        {kandidaten.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Noch keine aktiven Handwerker angelegt – im Tab „Handwerker" anlegen.
          </p>
        )}
      </div>

      {/* Ablehnen */}
      {!["Abgelehnt", "Erledigt", "Storniert"].includes(ticket.status) && (
        <div className="mb-4">
          {!showAblehnen ? (
            <button
              onClick={() => setShowAblehnen(true)}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              ✕ Ticket ablehnen
            </button>
          ) : (
            <div className="rounded-lg border border-red-300 p-3 dark:border-red-800">
              <input
                value={ablehnenGrund}
                onChange={(e) => setAblehnenGrund(e.target.value)}
                placeholder="Ablehnungsgrund (Pflichtfeld)"
                className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={ablehnen}
                  disabled={busy || !ablehnenGrund.trim()}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Ablehnung bestätigen
                </button>
                <button
                  onClick={() => setShowAblehnen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {ticket.status === "Abgelehnt" && ticket.ablehnungsgrund && (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/20">
          Abgelehnt von {ticket.abgelehntVon} am {ticket.abgelehntAm && formatDate(ticket.abgelehntAm)}: „
          {ticket.ablehnungsgrund}"
        </p>
      )}

      {/* Dokumente */}
      <div className="mb-4">
        <div className="mb-1 text-sm font-medium">Dokumente</div>
        <Anhaenge
          anhaenge={ticket.dokumente}
          typen={TICKET_DOK_TYPEN}
          onUpload={async (typ, file) => {
            const anhang = await hochladenUndAnhaengen(file, typ);
            if (!anhang) return;
            await patchTicket(ticket.id, { dokumente: [...(ticket.dokumente || []), anhang] });
            onChanged();
          }}
        />
      </div>

      {/* Nachrichten */}
      <div className="mb-4">
        <div className="mb-2 text-sm font-medium">Nachrichten</div>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
          {nachrichten.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Nachrichten.</p>}
          {nachrichten.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-lg p-2 text-sm",
                n.intern ? "bg-muted" : "border border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/20"
              )}
            >
              <div className="mb-0.5 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.von}</span>
                <span>
                  {n.intern ? "🔒 intern" : "📨 extern sichtbar"} · {formatDate(n.createdAt)}
                </span>
              </div>
              <div className="whitespace-pre-wrap">{n.text}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          <textarea
            value={neueNachricht}
            onChange={(e) => setNeueNachricht(e.target.value)}
            placeholder="Nachricht schreiben…"
            rows={2}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={nachrichtIntern} onChange={(e) => setNachrichtIntern(e.target.checked)} />
              Interne Notiz (nicht für Handwerker sichtbar)
            </label>
            <button
              onClick={sendNachricht}
              disabled={busy || !neueNachricht.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Senden
            </button>
          </div>
        </div>
      </div>

      {/* Historie */}
      <div className="mb-4">
        <div className="mb-2 text-sm font-medium">Verlauf</div>
        <ul className="space-y-1.5 border-l-2 border-border pl-3">
          {[...ticket.historie].reverse().map((h) => (
            <li key={h.id} className="text-xs">
              <span className="text-muted-foreground">{formatDate(h.zeitpunkt)}</span>{" "}
              {h.status && <StatusBadge status={h.status} />} <span>{h.text}</span>
              {h.von && <span className="text-muted-foreground"> — {h.von}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-3">
        <button onClick={deleteTicket} className="text-xs text-red-600 hover:underline">
          Ticket löschen
        </button>
      </div>
    </div>
  );
}
