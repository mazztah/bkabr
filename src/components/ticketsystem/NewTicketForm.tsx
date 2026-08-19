"use client";

import { useMemo, useState } from "react";
import {
  TICKET_ARTEN,
  TICKET_KOSTENARTEN,
  TICKET_MELDERTYPEN,
  TICKET_PRIORITAETEN,
  TICKET_QUELLEN,
  TICKET_SCHADENSARTEN,
  TICKET_SCHLUESSELSTATUS,
  TicketArt,
  TicketKostenart,
  TicketMelderTyp,
  TicketPrioritaet,
  TicketQuelle,
  TicketSchadensart,
  TicketSchluesselstatus,
} from "@/lib/types";
import { TicketSystemData } from "@/lib/use-ticket-data";

export default function NewTicketForm({
  data,
  onCreated,
  onClose,
}: {
  data: TicketSystemData;
  onCreated: (ticketId: string) => void;
  onClose: () => void;
}) {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [prioritaet, setPrioritaet] = useState<TicketPrioritaet>("mittel");
  const [quelle, setQuelle] = useState<TicketQuelle>("Manuell weitergeleitet");
  const [ticketArt, setTicketArt] = useState<TicketArt>("Reparatur");
  const [schadensart, setSchadensart] = useState<TicketSchadensart | "">("");
  const [erstelltVon, setErstelltVon] = useState("");
  const [melderTyp, setMelderTyp] = useState<TicketMelderTyp | "">("");
  const [freigabeErforderlich, setFreigabeErforderlich] = useState(false);
  const [kostenSchaetzung, setKostenSchaetzung] = useState("");
  const [kostenart, setKostenart] = useState<TicketKostenart | "">("");
  const [schluesselstatus, setSchluesselstatus] = useState<TicketSchluesselstatus | "">("");
  const [showErweitert, setShowErweitert] = useState(false);

  // Objektbezug (kaskadierend)
  const [liegenschaftId, setLiegenschaftId] = useState("");
  const [gebaeudeId, setGebaeudeId] = useState("");
  const [wohnungId, setWohnungId] = useState("");
  const [mieterId, setMieterId] = useState("");

  const [busy, setBusy] = useState(false);

  const gebaeudeOptionen = useMemo(
    () => data.gebaeude.filter((g) => !liegenschaftId || g.liegenschaftId === liegenschaftId),
    [data.gebaeude, liegenschaftId]
  );
  const wohnungOptionen = useMemo(
    () => data.wohnungen.filter((w) => !gebaeudeId || w.gebaeudeId === gebaeudeId),
    [data.wohnungen, gebaeudeId]
  );
  const mieterOptionen = useMemo(
    () => data.mieter.filter((m) => !wohnungId || m.wohnungId === wohnungId),
    [data.mieter, wohnungId]
  );
  const gewaehlteWohnung = data.wohnungen.find((w) => w.id === wohnungId);
  const istGewerbe = gewaehlteWohnung?.typ === "Gewerbe";

  // Gewerbe-Zusatzdaten
  const [betriebsunterbrechungRisiko, setBetriebsunterbrechungRisiko] = useState(false);
  const [sicherheitsfreigabeErforderlich, setSicherheitsfreigabeErforderlich] = useState(false);
  const [wartungsvertragVorhanden, setWartungsvertragVorhanden] = useState(false);
  const [wartungspartner, setWartungspartner] = useState("");

  const create = async () => {
    if (!titel.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titel,
          beschreibung,
          prioritaet,
          quelle,
          ticketArt,
          schadensart: schadensart || undefined,
          erstelltVon,
          melderTyp: melderTyp || undefined,
          freigabeErforderlich,
          kostenSchaetzung: kostenSchaetzung ? Number(kostenSchaetzung) : undefined,
          kostenart: kostenart || undefined,
          schluesselstatus: schluesselstatus || undefined,
          liegenschaftId: liegenschaftId || undefined,
          gebaeudeId: gebaeudeId || undefined,
          wohnungId: wohnungId || undefined,
          mieterId: mieterId || undefined,
          betriebsunterbrechungRisiko: istGewerbe ? betriebsunterbrechungRisiko : undefined,
          sicherheitsfreigabeErforderlich: istGewerbe ? sicherheitsfreigabeErforderlich : undefined,
          wartungsvertragVorhanden: istGewerbe ? wartungsvertragVorhanden : undefined,
          wartungspartner: istGewerbe ? wartungspartner || undefined : undefined,
        }),
      });
      const { ticket } = await res.json();
      if (ticket) onCreated(ticket.id);
    } finally {
      setBusy(false);
    }
  };

  const selectCls = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
  const inputCls = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-2 border-b border-border p-4">
      <input
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        placeholder="Titel (z.B. „Heizung fällt aus – Whg. 3.OG links“)"
        className={inputCls}
      />
      <textarea
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
        placeholder="Beschreibung / Meldung"
        rows={3}
        className={inputCls}
      />

      {/* Objektbezug: Liegenschaft -> Gebäude -> Wohnung -> Mieter */}
      <div className="rounded-lg border border-border p-2">
        <div className="mb-1 text-xs font-medium text-muted-foreground">Objektbezug (optional)</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={liegenschaftId}
            onChange={(e) => {
              setLiegenschaftId(e.target.value);
              setGebaeudeId("");
              setWohnungId("");
              setMieterId("");
            }}
            className={selectCls}
          >
            <option value="">Liegenschaft…</option>
            {data.liegenschaften.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value={gebaeudeId}
            onChange={(e) => {
              setGebaeudeId(e.target.value);
              setWohnungId("");
              setMieterId("");
            }}
            disabled={!liegenschaftId}
            className={selectCls}
          >
            <option value="">Gebäude…</option>
            {gebaeudeOptionen.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={wohnungId}
            onChange={(e) => {
              setWohnungId(e.target.value);
              setMieterId("");
            }}
            disabled={!gebaeudeId}
            className={selectCls}
          >
            <option value="">Einheit…</option>
            {wohnungOptionen.map((w) => (
              <option key={w.id} value={w.id}>
                {w.bezeichnung} {w.typ === "Gewerbe" ? "(Gewerbe)" : ""}
              </option>
            ))}
          </select>
          <select value={mieterId} onChange={(e) => setMieterId(e.target.value)} disabled={!wohnungId} className={selectCls}>
            <option value="">Mieter…</option>
            {mieterOptionen.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        {istGewerbe && (
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
            🏢 Gewerbeeinheit – Zusatzfelder unten ausklappen.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={prioritaet} onChange={(e) => setPrioritaet(e.target.value as TicketPrioritaet)} className={selectCls}>
          {TICKET_PRIORITAETEN.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={quelle} onChange={(e) => setQuelle(e.target.value as TicketQuelle)} className={selectCls}>
          {TICKET_QUELLEN.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <select value={ticketArt} onChange={(e) => setTicketArt(e.target.value as TicketArt)} className={selectCls}>
          {TICKET_ARTEN.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={schadensart} onChange={(e) => setSchadensart(e.target.value as TicketSchadensart)} className={selectCls}>
          <option value="">Schadensart…</option>
          {TICKET_SCHADENSARTEN.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={erstelltVon}
          onChange={(e) => setErstelltVon(e.target.value)}
          placeholder="Gemeldet von (Name, optional)"
          className={inputCls}
        />
        <select value={melderTyp} onChange={(e) => setMelderTyp(e.target.value as TicketMelderTyp)} className={selectCls}>
          <option value="">Melder-Typ…</option>
          {TICKET_MELDERTYPEN.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={freigabeErforderlich} onChange={(e) => setFreigabeErforderlich(e.target.checked)} />
        Freigabe vor Beauftragung erforderlich
      </label>

      <button
        type="button"
        onClick={() => setShowErweitert((v) => !v)}
        className="text-xs text-primary hover:underline"
      >
        {showErweitert ? "− Weitere Angaben ausblenden" : "+ Weitere Angaben (Kosten, Termin, Gewerbe)"}
      </button>

      {showErweitert && (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={kostenSchaetzung}
              onChange={(e) => setKostenSchaetzung(e.target.value)}
              placeholder="Kostenschätzung (€)"
              className={inputCls}
            />
            <select value={kostenart} onChange={(e) => setKostenart(e.target.value as TicketKostenart)} className={selectCls}>
              <option value="">Kostenart…</option>
              {TICKET_KOSTENARTEN.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <select value={schluesselstatus} onChange={(e) => setSchluesselstatus(e.target.value as TicketSchluesselstatus)} className={selectCls}>
            <option value="">Schlüsselstatus…</option>
            {TICKET_SCHLUESSELSTATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {istGewerbe && (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="text-xs font-medium text-muted-foreground">Gewerbe-Zusatzdaten</div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={betriebsunterbrechungRisiko}
                  onChange={(e) => setBetriebsunterbrechungRisiko(e.target.checked)}
                />
                Betriebsunterbrechungs-Risiko (Mieter kann Geschäft ggf. nicht fortführen)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sicherheitsfreigabeErforderlich}
                  onChange={(e) => setSicherheitsfreigabeErforderlich(e.target.checked)}
                />
                Sicherheitsfreigabe/Begleitperson für Handwerker nötig
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={wartungsvertragVorhanden}
                  onChange={(e) => setWartungsvertragVorhanden(e.target.checked)}
                />
                Läuft ein Wartungsvertrag für das betroffene Gerät/Anlage?
              </label>
              {wartungsvertragVorhanden && (
                <input
                  value={wartungspartner}
                  onChange={(e) => setWartungspartner(e.target.value)}
                  placeholder="Wartungspartner (Firma)"
                  className={inputCls}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={create}
          disabled={busy || !titel.trim()}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Anlegen…" : "Ticket anlegen"}
        </button>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
