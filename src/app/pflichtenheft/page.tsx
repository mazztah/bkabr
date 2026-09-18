"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { ANFORDERUNGEN, STATUS_LABEL, type Erfuellung } from "@/lib/pflichtenheft";

const TON: Record<Erfuellung, "success" | "warning" | "danger"> = { erfuellt: "success", teilweise: "warning", offen: "danger" };
const FARBE: Record<Erfuellung, string> = { erfuellt: "var(--success)", teilweise: "var(--warning)", offen: "var(--destructive)" };

export default function PflichtenheftPage() {
  const [status, setStatus] = useState<Erfuellung | "alle">("alle");
  const [modul, setModul] = useState("alle");
  const [suche, setSuche] = useState("");

  const modulListe = useMemo(() => Array.from(new Set(ANFORDERUNGEN.map((a) => a.modul))), []);
  const anzahl = (s: Erfuellung, m?: string) => ANFORDERUNGEN.filter((a) => a.status === s && (!m || a.modul === m)).length;
  const gesamt = ANFORDERUNGEN.length;
  // Erfüllungsgrad: „teilweise“ zählt zur Hälfte
  const grad = Math.round(((anzahl("erfuellt") + anzahl("teilweise") * 0.5) / gesamt) * 100);

  const sichtbar = ANFORDERUNGEN.filter(
    (a) =>
      (status === "alle" || a.status === status) &&
      (modul === "alle" || a.modul === modul) &&
      (!suche || `${a.id} ${a.text} ${a.bemerkung || ""}`.toLowerCase().includes(suche.toLowerCase()))
  );

  function exportCsv() {
    const kopf = ["Anforderungs-ID", "Modul", "Anforderung", "Erfüllungsgrad", "Bemerkung / Abweichung"];
    const rows = sichtbar.map((a) => [a.id, a.modul, a.text, STATUS_LABEL[a.status], a.bemerkung || ""]);
    const csv = [kopf, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    el.download = "pflichtenheft_erfuellungsmatrix.csv";
    el.click();
    URL.revokeObjectURL(el.href);
  }

  return (
    <div className="page-shell">
      <PageHeader
        icon={ClipboardCheck}
        title="Pflichtenheft – Erfüllungsgrad"
        reqRef="Kap. 28"
        description="Bewertungsmatrix aller MUSS-Anforderungen. Selbsteinschätzung anhand des Code-Stands – nicht durch Abnahmetests belegt."
        actions={
          <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            <Download size={16} /> CSV
          </button>
        }
      />

      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Gesamt-Erfüllungsgrad (teilweise = 50 %)</div>
            <div className="text-4xl font-bold tabular-nums tracking-tight">{grad} %</div>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">{gesamt} Anforderungen</div>
        </div>
        <ProgressBar
          height={10}
          segments={(["erfuellt", "teilweise", "offen"] as Erfuellung[]).map((s) => ({ label: STATUS_LABEL[s], value: (anzahl(s) / gesamt) * 100, color: FARBE[s] }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Alle" value={gesamt} active={status === "alle"} onClick={() => setStatus("alle")} />
        <StatCard label="Erfüllt" value={anzahl("erfuellt")} tone="success" active={status === "erfuellt"} onClick={() => setStatus("erfuellt")} />
        <StatCard label="Teilweise" value={anzahl("teilweise")} tone="warning" active={status === "teilweise"} onClick={() => setStatus("teilweise")} />
        <StatCard label="Offen" value={anzahl("offen")} tone="danger" active={status === "offen"} onClick={() => setStatus("offen")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modulListe.map((m) => {
          const n = ANFORDERUNGEN.filter((a) => a.modul === m).length;
          return (
            <button key={m} onClick={() => setModul(modul === m ? "alle" : m)} aria-pressed={modul === m} className="stat-card text-left" data-active={modul === m}>
              <div className="mb-2 flex justify-between text-sm font-semibold"><span>{m}</span><span className="tabular-nums text-muted-foreground">{n}</span></div>
              <ProgressBar segments={(["erfuellt", "teilweise", "offen"] as Erfuellung[]).map((s) => ({ label: STATUS_LABEL[s], value: (anzahl(s, m) / n) * 100, color: FARBE[s] }))} />
            </button>
          );
        })}
      </div>

      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="ID, Anforderung oder Bemerkung suchen …" aria-label="Suche" className="field-input max-w-md" />

      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>ID</th><th>Anforderung</th><th>Erfüllung</th><th>Bemerkung</th></tr></thead>
          <tbody>
            {sichtbar.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap font-mono text-xs">{a.link ? <Link href={a.link} className="text-primary hover:underline">{a.id}</Link> : a.id}</td>
                <td>{a.text}</td>
                <td><span className="chip" data-tone={TON[a.status]}>{STATUS_LABEL[a.status]}</span></td>
                <td className="text-xs text-muted-foreground">{a.bemerkung || "—"}</td>
              </tr>
            ))}
            {sichtbar.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Keine Treffer.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
