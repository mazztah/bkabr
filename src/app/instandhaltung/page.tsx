"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wrench, Ticket as TicketIcon, CalendarClock, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { bewerteAnlage, STUFEN_LABEL, type FaelligkeitsStufe, type WartungsZeile } from "@/lib/wartung";
import type { Anlage, Liegenschaft } from "@/lib/types";

type Filter = "alle" | FaelligkeitsStufe;

const TON: Record<FaelligkeitsStufe, "danger" | "warning" | "info" | "success" | undefined> = {
  ueberfaellig: "danger",
  "30": "warning",
  "90": "info",
  ok: "success",
  ungeplant: undefined,
};

const fmtDatum = (d?: Date) => (d ? d.toLocaleDateString("de-DE") : "—");

export default function InstandhaltungPage() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/anlagen").then((r) => r.json()), fetch("/api/liegenschaften").then((r) => r.json())])
      .then(([a, l]) => {
        setAnlagen(a.anlagen || []);
        setLiegenschaften(l.liegenschaften || []);
      })
      .catch(() => setError("Daten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  const zeilen = useMemo<WartungsZeile[]>(
    () =>
      anlagen
        .filter((a) => a.status !== "Außer Betrieb")
        .map((a) => bewerteAnlage(a))
        .sort((x, y) => (x.tage ?? Number.MAX_SAFE_INTEGER) - (y.tage ?? Number.MAX_SAFE_INTEGER)),
    [anlagen]
  );

  const zaehl = (s: FaelligkeitsStufe) => zeilen.filter((z) => z.stufe === s).length;
  const sichtbar = zeilen.filter(
    (z) =>
      (filter === "alle" || z.stufe === filter) &&
      (!suche ||
        `${z.anlage.bezeichnung} ${z.anlage.typ} ${z.anlage.wartungsfirma || ""}`.toLowerCase().includes(suche.toLowerCase()))
  );
  const lieg = (id: string) => liegenschaften.find((l) => l.id === id)?.name || "—";

  async function ticketErzeugen(z: WartungsZeile) {
    setBusy(z.anlage.id);
    setError(null);
    setInfo(null);
    const a = z.anlage;
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titel: `${a.typ === "Sonstige technische Anlage" ? "Wartung" : "Wartung/Prüfung"}: ${a.bezeichnung}`,
        beschreibung: `Fällige ${a.typ}-Wartung bzw. -Prüfung (${z.stufe === "ueberfaellig" ? "überfällig" : "fällig am " + fmtDatum(z.faellig)}). Standort: ${a.standortDetail || "n. a."}. Wartungsfirma: ${a.wartungsfirma || "n. a."}.`,
        kategorie: "Wartung",
        quelle: "Instandhaltung",
        prioritaet: z.stufe === "ueberfaellig" ? "hoch" : "mittel",
        liegenschaftId: a.liegenschaftId,
        gebaeudeId: a.gebaeudeId,
        wartungsvertragVorhanden: !!a.wartungsfirma,
        wartungspartner: a.wartungsfirma,
        faelligkeitsdatum: a.naechstePruefung,
      }),
    });
    setBusy(null);
    if (r.ok) setInfo(`Ticket für „${a.bezeichnung}“ wurde angelegt.`);
    else setError((await r.json().catch(() => ({}))).error || "Ticket konnte nicht angelegt werden.");
  }

  function exportCsv() {
    const kopf = ["Anlage", "Typ", "Liegenschaft", "Wartungsfirma", "Nächste Fälligkeit", "Status"];
    const rows = sichtbar.map((z) => [z.anlage.bezeichnung, z.anlage.typ, lieg(z.anlage.liegenschaftId), z.anlage.wartungsfirma || "", fmtDatum(z.faellig), STUFEN_LABEL[z.stufe]]);
    const csv = [kopf, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "wartungsplan.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page-shell">
      <PageHeader
        icon={Wrench}
        title="Instandhaltung"
        reqRef="WART-001 – WART-006"
        description="Regelbasierter Wartungs- und Prüfplan aller Anlagen. Überfällige Termine sind offene Aufgaben – per Klick als Ticket erzeugbar."
        actions={
          <>
            <button onClick={exportCsv} disabled={!sichtbar.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              <Download size={16} /> CSV
            </button>
            <Link href="/anlagen" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              <Wrench size={16} /> Anlagen pflegen
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Alle Anlagen" value={zeilen.length} active={filter === "alle"} onClick={() => setFilter("alle")} />
        <StatCard label="Überfällig" value={zaehl("ueberfaellig")} tone="danger" active={filter === "ueberfaellig"} onClick={() => setFilter("ueberfaellig")} hint="offene Aufgaben" />
        <StatCard label="Fällig ≤ 30 Tage" value={zaehl("30")} tone="warning" active={filter === "30"} onClick={() => setFilter("30")} />
        <StatCard label="Fällig ≤ 90 Tage" value={zaehl("90")} active={filter === "90"} onClick={() => setFilter("90")} />
        <StatCard label="Ohne Termin" value={zaehl("ungeplant")} active={filter === "ungeplant"} onClick={() => setFilter("ungeplant")} hint="Datenqualität" />
      </div>

      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Anlage, Typ oder Wartungsfirma suchen …" aria-label="Suche" className="field-input max-w-md" />

      {error && <div role="alert" className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--destructive)]">{error}</div>}
      {info && <div role="status" className="rounded-lg bg-[var(--success-bg)] px-3 py-2 text-sm text-[var(--success)]">{info}</div>}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11" />)}</div>
      ) : sichtbar.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Keine Anlagen in dieser Ansicht.
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Anlage</th><th>Typ</th><th>Liegenschaft</th><th>Wartungsfirma</th><th>Fällig am</th><th>Status</th><th aria-label="Aktion" /></tr>
            </thead>
            <tbody>
              {sichtbar.map((z) => (
                <tr key={z.anlage.id}>
                  <td className="font-medium">{z.anlage.bezeichnung}</td>
                  <td className="text-muted-foreground">{z.anlage.typ}</td>
                  <td>{lieg(z.anlage.liegenschaftId)}</td>
                  <td>{z.anlage.wartungsfirma || "—"}</td>
                  <td className="tabular-nums">{fmtDatum(z.faellig)}{z.tage !== undefined && <span className="ml-1 text-xs text-muted-foreground">({z.tage < 0 ? `${-z.tage} T. drüber` : `in ${z.tage} T.`})</span>}</td>
                  <td><span className="chip" data-tone={TON[z.stufe]}>{STUFEN_LABEL[z.stufe]}</span></td>
                  <td className="text-right">
                    <button onClick={() => ticketErzeugen(z)} disabled={busy === z.anlage.id || z.stufe === "ok"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40">
                      <TicketIcon size={13} /> {busy === z.anlage.id ? "…" : "Ticket"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
