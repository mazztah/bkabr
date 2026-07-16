"use client";

import { useEffect, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { Gebaeude, Liegenschaft, Mieter, Wohnung } from "@/lib/types";

export default function VorauszahlungenPage() {
  const [mieter, setMieter] = useState<Mieter[]>([]);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/mieter").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
      fetch("/api/gebaeude").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ]).then(([m, w, g, l]) => {
      setMieter(m.mieter || []);
      setWohnungen(w.wohnungen || []);
      setGebaeude(g.gebaeude || []);
      setLiegenschaften(l.liegenschaften || []);
      setLoading(false);
    });
  }, []);

  const rows = mieter.flatMap((m) => {
    const wohnung = wohnungen.find((w) => w.id === m.wohnungId);
    const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
    const lieg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;
    return (m.sollIst || []).map((e) => ({
      ...e,
      mieterId: m.id,
      mieterName: m.name,
      wohnung: wohnung?.bezeichnung || "–",
      objekt: lieg?.name || geb?.name || "–",
    }));
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-1 text-xl font-bold">💶 Vorauszahlungen – Soll/Ist-Übersicht</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Aggregierte Nebenkosten-Vorauszahlungen aller Mieter. Einzelne Einträge werden in der
        jeweiligen Mieterakte unter „Liegenschaften" gepflegt.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Soll/Ist-Einträge vorhanden.</p>
      ) : (
        <table className="w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2">Mieter</th>
              <th className="py-2">Objekt</th>
              <th className="py-2">Einheit</th>
              <th className="py-2">Jahr</th>
              <th className="py-2">Soll</th>
              <th className="py-2">Ist</th>
              <th className="py-2">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="py-2 font-medium">
                  <a href={`/liegenschaften?select=mieter:${r.mieterId}`} className="text-primary hover:underline">
                    {r.mieterName} ↗
                  </a>
                </td>
                <td className="py-2 text-muted-foreground">{r.objekt}</td>
                <td className="py-2 text-muted-foreground">{r.wohnung}</td>
                <td className="py-2">{r.jahr}</td>
                <td className="py-2">{formatCurrency(r.sollVorauszahlung)}</td>
                <td className="py-2">{formatCurrency(r.istZahlungen)}</td>
                <td
                  className={cn(
                    "py-2 font-medium",
                    r.istZahlungen - r.sollVorauszahlung < 0
                      ? "text-[var(--destructive)]"
                      : "text-[var(--success)]"
                  )}
                >
                  {formatCurrency(r.istZahlungen - r.sollVorauszahlung)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
