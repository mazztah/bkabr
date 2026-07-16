"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Abrechnung, Gebaeude, Liegenschaft, Mieter, Wohnung } from "@/lib/types";
import { zeitraumEnthaeltJahr } from "@/lib/matching";

interface Data {
  abrechnungen: Abrechnung[];
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
}

const EMPTY: Data = { abrechnungen: [], liegenschaften: [], gebaeude: [], wohnungen: [], mieter: [] };

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AuswertungPage() {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [liegenschaftId, setLiegenschaftId] = useState("");
  const [gebaeudeId, setGebaeudeId] = useState("");
  const [wohnungId, setWohnungId] = useState("");
  const [jahr, setJahr] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/abrechnungen").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
      fetch("/api/gebaeude").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
      fetch("/api/mieter").then((r) => r.json()),
    ]).then(([a, l, g, w, m]) => {
      setData({
        abrechnungen: a.abrechnungen || [],
        liegenschaften: l.liegenschaften || [],
        gebaeude: g.gebaeude || [],
        wohnungen: w.wohnungen || [],
        mieter: m.mieter || [],
      });
      setLoading(false);
    });
  }, []);

  const gebaeudeOptions = data.gebaeude.filter(
    (g) => !liegenschaftId || g.liegenschaftId === liegenschaftId
  );
  const wohnungOptions = data.wohnungen.filter(
    (w) => !gebaeudeId || w.gebaeudeId === gebaeudeId
  );

  const jahre = useMemo(() => {
    const set = new Set<string>();
    data.abrechnungen.forEach((a) => {
      const m = a.zeitraum.match(/\b(19|20)\d{2}\b/);
      if (m) set.add(m[0]);
    });
    return Array.from(set).sort().reverse();
  }, [data.abrechnungen]);

  // Deszendenten-Scope für Liegenschaft/Gebäude auflösen
  const scope = useMemo(() => {
    if (wohnungId) return { wohnungIds: [wohnungId], gebaeudeIds: [] as string[], liegenschaftIds: [] as string[] };
    if (gebaeudeId) {
      const wIds = data.wohnungen.filter((w) => w.gebaeudeId === gebaeudeId).map((w) => w.id);
      return { wohnungIds: wIds, gebaeudeIds: [gebaeudeId], liegenschaftIds: [] };
    }
    if (liegenschaftId) {
      const gIds = data.gebaeude.filter((g) => g.liegenschaftId === liegenschaftId).map((g) => g.id);
      const wIds = data.wohnungen.filter((w) => gIds.includes(w.gebaeudeId)).map((w) => w.id);
      return { wohnungIds: wIds, gebaeudeIds: gIds, liegenschaftIds: [liegenschaftId] };
    }
    return null;
  }, [liegenschaftId, gebaeudeId, wohnungId, data]);

  const gefiltert = useMemo(() => {
    return data.abrechnungen.filter((a) => {
      if (scope) {
        const match =
          (a.wohnungId && scope.wohnungIds.includes(a.wohnungId)) ||
          (a.gebaeudeId && scope.gebaeudeIds.includes(a.gebaeudeId)) ||
          (a.liegenschaftId && scope.liegenschaftIds.includes(a.liegenschaftId));
        if (!match) return false;
      }
      if (jahr && !zeitraumEnthaeltJahr(a.zeitraum, parseInt(jahr, 10))) return false;
      if (status && a.status !== status) return false;
      return true;
    });
  }, [data.abrechnungen, scope, jahr, status]);

  const alleDokumente = gefiltert.flatMap((a) => a.dokumente);
  const gesamtSumme = gefiltert.reduce((s, a) => s + a.gesamtSumme, 0);
  const mieteinnahmen = gefiltert.reduce((s, a) => s + a.workspace.mieteinnahmen, 0);
  const nebenkosten = gefiltert.reduce((s, a) => s + a.workspace.nebenkosten, 0);
  const merkmalsQuote =
    alleDokumente.length > 0
      ? (alleDokumente.filter((d) => d.pruefung?.akzeptiert).length / alleDokumente.length) * 100
      : 0;
  const freigegeben = alleDokumente.filter(
    (d) => d.pruefung?.zahlungsfreigabe?.status === "freigegeben"
  ).length;

  const relevanteMieter = wohnungId
    ? data.mieter.filter((m) => m.wohnungId === wohnungId)
    : scope
    ? data.mieter.filter((m) => scope.wohnungIds.includes(m.wohnungId))
    : data.mieter;
  const sollGesamt = relevanteMieter.flatMap((m) => m.sollIst || []).reduce((s, e) => s + e.sollVorauszahlung, 0);
  const istGesamt = relevanteMieter.flatMap((m) => m.sollIst || []).reduce((s, e) => s + e.istZahlungen, 0);

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-1 text-xl font-bold">📊 Auswertung</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Filtere von Liegenschafts- bis Mieterebene und erhalte eine aggregierte Übersicht.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <select
          value={liegenschaftId}
          onChange={(e) => {
            setLiegenschaftId(e.target.value);
            setGebaeudeId("");
            setWohnungId("");
          }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Liegenschaften</option>
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
          }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Gebäude</option>
          {gebaeudeOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select
          value={wohnungId}
          onChange={(e) => setWohnungId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Wohnungen</option>
          {wohnungOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.bezeichnung}
            </option>
          ))}
        </select>

        <select
          value={jahr}
          onChange={(e) => setJahr(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Jahre</option>
          {jahre.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Status</option>
          <option value="Rohdaten">Rohdaten</option>
          <option value="Validierung">Validierung</option>
          <option value="Fertig">Fertig</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Abrechnungen" value={String(gefiltert.length)} />
            <StatCard label="Gesamtsumme" value={formatCurrency(gesamtSumme)} />
            <StatCard label="Mieteinnahmen" value={formatCurrency(mieteinnahmen)} />
            <StatCard label="Nebenkosten" value={formatCurrency(nebenkosten)} />
            <StatCard label="Dokumente" value={String(alleDokumente.length)} />
            <StatCard
              label="Merkmalsquote Ø"
              value={`${merkmalsQuote.toFixed(0)}%`}
              sub="akzeptierte Rechnungen"
            />
            <StatCard label="Zahlungsfreigaben" value={`${freigegeben}/${alleDokumente.length}`} />
            <StatCard
              label="Soll/Ist Vorauszahlung"
              value={formatCurrency(istGesamt - sollGesamt)}
              sub={`Soll ${formatCurrency(sollGesamt)} · Ist ${formatCurrency(istGesamt)}`}
            />
          </div>

          <h2 className="mb-2 text-sm font-semibold">Abrechnungen im Filter</h2>
          {gefiltert.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Treffer für diese Filterkombination.</p>
          ) : (
            <div className="space-y-2">
              {gefiltert.map((a) => (
                <div key={a.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {a.nummer && (
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{a.nummer}</span>
                      )}
                      {a.name}
                    </span>
                    <span>{formatCurrency(a.gesamtSumme)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.zeitraum} · {a.status} · {a.dokumente.length} Dokument(e)
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
