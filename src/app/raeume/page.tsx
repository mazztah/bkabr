"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DoorOpen, Plus, Trash2, Pencil, Download, PartyPopper, Layers } from "lucide-react";
import Modal from "@/components/Modal";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { DIN_GRUPPEN, NUTZUNGSARTEN, fmtM2, gruppiereNachEtage, summeNachGruppe } from "@/lib/raeume";
import type { DinGruppe, Gebaeude, Raum } from "@/lib/types";

interface Formular {
  id?: string;
  etage: string;
  laufendeNr: string;
  bezeichnung: string;
  nutzung: string;
  dinGruppe: string;
  flaeche: string;
  veranstaltungsflaeche: boolean;
  zusammenhangGruppe: string;
  notizen: string;
}

const LEER: Formular = {
  etage: "EG",
  laufendeNr: "",
  bezeichnung: "",
  nutzung: "Büro",
  dinGruppe: "NUF 2 Büroarbeit",
  flaeche: "",
  veranstaltungsflaeche: false,
  zusammenhangGruppe: "",
  notizen: "",
};

export default function RaeumePage() {
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [gebaeudeId, setGebaeudeId] = useState("");
  const [raeume, setRaeume] = useState<Raum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Formular | null>(null);
  const [nurVeranstaltung, setNurVeranstaltung] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/gebaeude")
      .then((r) => r.json())
      .then((d) => {
        const list: Gebaeude[] = d.gebaeude || [];
        setGebaeude(list);
        if (list[0]) setGebaeudeId(list[0].id);
      })
      .catch(() => setError("Gebäude konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  const laden = useCallback(() => {
    if (!gebaeudeId) return;
    setLoading(true);
    fetch(`/api/raeume?gebaeudeId=${gebaeudeId}`)
      .then((r) => r.json())
      .then((d) => setRaeume(d.raeume || []))
      .catch(() => setError("Räume konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [gebaeudeId]);

  useEffect(laden, [laden]);

  const sichtbar = useMemo(() => (nurVeranstaltung ? raeume.filter((r) => r.veranstaltungsflaeche) : raeume), [raeume, nurVeranstaltung]);
  const etagen = useMemo(() => gruppiereNachEtage(sichtbar), [sichtbar]);
  const gruppen = useMemo(() => summeNachGruppe(raeume), [raeume]);
  const gesamt = raeume.reduce((s, r) => s + (r.flaeche || 0), 0);
  const veranst = raeume.filter((r) => r.veranstaltungsflaeche).reduce((s, r) => s + (r.flaeche || 0), 0);
  const aktuell = gebaeude.find((g) => g.id === gebaeudeId);

  async function speichern() {
    if (!form || !gebaeudeId) return;
    setError(null);
    if (!form.bezeichnung.trim() || !form.etage.trim() || form.flaeche === "") {
      setError("Bitte Etage, Bezeichnung und Fläche angeben.");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      gebaeudeId,
      laufendeNr: form.laufendeNr ? Number(form.laufendeNr) : undefined,
      flaeche: Number(String(form.flaeche).replace(",", ".")),
      dinGruppe: form.dinGruppe || undefined,
      zusammenhangGruppe: form.zusammenhangGruppe || undefined,
    };
    const r = await fetch(form.id ? `/api/raeume/${form.id}` : "/api/raeume", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (r.ok) {
      setForm(null);
      laden();
    } else setError((await r.json().catch(() => ({}))).error || "Speichern fehlgeschlagen.");
  }

  async function toggleVeranstaltung(r: Raum) {
    const res = await fetch(`/api/raeume/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ veranstaltungsflaeche: !r.veranstaltungsflaeche }),
    });
    if (res.ok) laden();
  }

  async function loeschen(r: Raum) {
    if (!confirm(`Raum „${r.bezeichnung}“ wirklich löschen?`)) return;
    const res = await fetch(`/api/raeume/${r.id}`, { method: "DELETE" });
    if (res.ok) laden();
    else setError((await res.json().catch(() => ({}))).error || "Löschen fehlgeschlagen.");
  }

  function exportCsv() {
    const kopf = ["Etage", "Lfd. Nr.", "Bezeichnung", "Nutzung", "DIN 277", "Fläche m²", "Veranstaltungsfläche"];
    const zeilen = raeume.map((r) => [r.etage, r.laufendeNr, r.bezeichnung, r.nutzung, r.dinGruppe || "", r.flaeche, r.veranstaltungsflaeche ? "ja" : "nein"]);
    const csv = [kopf, ...zeilen].map((z) => z.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `raeume_${(aktuell?.name || "gebaeude").replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function nutzungWaehlen(name: string) {
    const vorgabe = NUTZUNGSARTEN.find((n) => n.name === name);
    setForm((f) => (f ? { ...f, nutzung: name, dinGruppe: vorgabe?.din || f.dinGruppe, veranstaltungsflaeche: name === "Veranstaltungsfläche" ? true : f.veranstaltungsflaeche } : f));
  }

  return (
    <div className="page-shell">
      <PageHeader
        icon={DoorOpen}
        title="Räume & Flächen"
        reqRef="IMM-003 – IMM-006"
        description="Etagen, Räume und Flächen je Gebäude – mit DIN-277-Nutzungsgruppen und Freigabe zusammenhängender Veranstaltungsflächen."
        actions={
          <>
            <button onClick={exportCsv} disabled={!raeume.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              <Download size={16} /> CSV
            </button>
            <button onClick={() => { setError(null); setForm({ ...LEER }); }} disabled={!gebaeudeId} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
              <Plus size={16} /> Raum anlegen
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="gebaeude-select">Gebäude</label>
        <select id="gebaeude-select" value={gebaeudeId} onChange={(e) => setGebaeudeId(e.target.value)} className="field-input max-w-xs">
          {gebaeude.length === 0 && <option value="">Keine Gebäude vorhanden</option>}
          {gebaeude.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={nurVeranstaltung} onChange={(e) => setNurVeranstaltung(e.target.checked)} />
          Nur Veranstaltungsflächen
        </label>
      </div>

      {error && <div role="alert" className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--destructive)]">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gesamtfläche" value={fmtM2(gesamt)} hint={`${raeume.length} Räume erfasst`} />
        <StatCard label="Etagen" value={gruppiereNachEtage(raeume).length} />
        <StatCard label="Veranstaltungsfläche" value={fmtM2(veranst)} tone="success" hint={gesamt ? `${Math.round((veranst / gesamt) * 100)} % der Gesamtfläche` : undefined} />
        <StatCard label="Ohne DIN-Zuordnung" value={raeume.filter((r) => !r.dinGruppe).length} tone={raeume.some((r) => !r.dinGruppe) ? "warning" : "default"} hint="Datenqualität" />
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : raeume.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Für dieses Gebäude sind noch keine Räume erfasst.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {etagen.map((e) => (
              <section key={e.etage} aria-label={`Etage ${e.etage}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-bold">{e.etage}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{e.raeume.length} Räume · {fmtM2(e.summe)}</span>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Nr.</th><th>Bezeichnung</th><th>Nutzung</th><th>DIN 277</th><th className="text-right">Fläche</th><th>Veranst.</th><th aria-label="Aktionen" /></tr>
                    </thead>
                    <tbody>
                      {e.raeume.map((r) => (
                        <tr key={r.id}>
                          <td className="tabular-nums text-muted-foreground">{r.laufendeNr}</td>
                          <td className="font-medium">{r.bezeichnung}{r.zusammenhangGruppe && <span className="chip ml-2" data-tone="info">{r.zusammenhangGruppe}</span>}</td>
                          <td>{r.nutzung}</td>
                          <td className="text-xs text-muted-foreground">{r.dinGruppe ? r.dinGruppe.split(" ")[0] + " " + (r.dinGruppe.split(" ")[1] || "") : <span className="chip" data-tone="warning">offen</span>}</td>
                          <td className="text-right tabular-nums">{fmtM2(r.flaeche)}</td>
                          <td>
                            <button onClick={() => toggleVeranstaltung(r)} aria-pressed={!!r.veranstaltungsflaeche} aria-label="Als Veranstaltungsfläche freigeben" className="chip cursor-pointer" data-tone={r.veranstaltungsflaeche ? "success" : undefined}>
                              <PartyPopper size={12} /> {r.veranstaltungsflaeche ? "frei" : "–"}
                            </button>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button aria-label="Bearbeiten" onClick={() => { setError(null); setForm({ id: r.id, etage: r.etage, laufendeNr: String(r.laufendeNr), bezeichnung: r.bezeichnung, nutzung: r.nutzung, dinGruppe: r.dinGruppe || "", flaeche: String(r.flaeche), veranstaltungsflaeche: !!r.veranstaltungsflaeche, zusammenhangGruppe: r.zusammenhangGruppe || "", notizen: r.notizen || "" }); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={14} /></button>
                            <button aria-label="Löschen" onClick={() => loeschen(r)} className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--danger-bg)] hover:text-[var(--destructive)]"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <aside className="glass-panel h-fit rounded-2xl p-4">
            <h2 className="mb-3 text-sm font-bold">Nutzungsgruppen (DIN 277)</h2>
            <ul className="space-y-3">
              {gruppen.map((g) => (
                <li key={g.gruppe}>
                  <div className="flex justify-between text-xs">
                    <span className="pr-2">{g.gruppe}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtM2(g.flaeche)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--brand-accent)]" style={{ width: `${gesamt ? (g.flaeche / gesamt) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {form && (
        <Modal title={form.id ? "Raum bearbeiten" : "Raum anlegen"} onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label field-label--required" htmlFor="f-etage">Etage</label><input id="f-etage" className="field-input" value={form.etage} onChange={(e) => setForm({ ...form, etage: e.target.value })} list="etagen-vorschlag" /><datalist id="etagen-vorschlag">{["UG", "EG", "1. OG", "2. OG", "3. OG", "DG"].map((e) => <option key={e} value={e} />)}</datalist></div>
            <div><label className="field-label" htmlFor="f-nr">Lfd. Nr.</label><input id="f-nr" inputMode="numeric" className="field-input" placeholder="automatisch" value={form.laufendeNr} onChange={(e) => setForm({ ...form, laufendeNr: e.target.value })} /></div>
            <div className="col-span-2"><label className="field-label field-label--required" htmlFor="f-bez">Bezeichnung</label><input id="f-bez" className="field-input" value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} /></div>
            <div><label className="field-label" htmlFor="f-nutz">Nutzung</label><input id="f-nutz" className="field-input" list="nutzungen" value={form.nutzung} onChange={(e) => nutzungWaehlen(e.target.value)} /><datalist id="nutzungen">{NUTZUNGSARTEN.map((n) => <option key={n.name} value={n.name} />)}</datalist></div>
            <div><label className="field-label field-label--required" htmlFor="f-fl">Fläche (m²)</label><input id="f-fl" inputMode="decimal" className="field-input" value={form.flaeche} onChange={(e) => setForm({ ...form, flaeche: e.target.value })} /></div>
            <div className="col-span-2"><label className="field-label" htmlFor="f-din">DIN-277-Gruppe</label><select id="f-din" className="field-input" value={form.dinGruppe} onChange={(e) => setForm({ ...form, dinGruppe: e.target.value })}><option value="">— nicht zugeordnet —</option>{DIN_GRUPPEN.map((g: DinGruppe) => <option key={g} value={g}>{g}</option>)}</select></div>
            <div><label className="field-label" htmlFor="f-zg">Zusammenhang (Gruppe)</label><input id="f-zg" className="field-input" placeholder="z. B. Foyer-Verbund" value={form.zusammenhangGruppe} onChange={(e) => setForm({ ...form, zusammenhangGruppe: e.target.value })} /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.veranstaltungsflaeche} onChange={(e) => setForm({ ...form, veranstaltungsflaeche: e.target.checked })} /> Veranstaltungsfläche</label>
          </div>
          {error && <div role="alert" className="mt-3 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--destructive)]">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Abbrechen</button>
            <button onClick={speichern} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Speichern …" : "Speichern"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
