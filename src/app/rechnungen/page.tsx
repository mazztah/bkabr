"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Abrechnung, Dokument } from "@/lib/types";
import ProgressRing from "@/components/ProgressRing";

type SortKey = "name" | "datum" | "betrag" | "liegenschaft" | "gebaeude" | "mieter" | "firma";
type SortDir = "asc" | "desc";

async function patchAbrechnung(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/abrechnungen/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

type Row = {
  dok: Dokument;
  abrechnung: Abrechnung;
  liegenschaftLabel: string;
  gebaeudeLabel: string;
  mieterLabel: string;
};

export default function RechnungenPage() {
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("datum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");

  const refresh = () => {
    setLoading(true);
    fetch("/api/abrechnungen")
      .then((r) => r.json())
      .then((d) => {
        setAbrechnungen(d.abrechnungen || []);
        setLoading(false);
      });
  };

  useEffect(refresh, []);

  const rows: Row[] = useMemo(() => {
    return abrechnungen.flatMap((a) =>
      a.dokumente.map((d) => ({
        dok: d,
        abrechnung: a,
        liegenschaftLabel: a.adresse || a.name || "—",
        gebaeudeLabel: a.gebaeudeId || "—",
        mieterLabel: a.mieterName || "—",
      }))
    );
  }, [abrechnungen]);

  const sorted = useMemo(() => {
    let list = [...rows];
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(
        (r) =>
          r.dok.name.toLowerCase().includes(q) ||
          r.liegenschaftLabel.toLowerCase().includes(q) ||
          (r.dok.firma || "").toLowerCase().includes(q) ||
          (r.dok.leistungsart || "").toLowerCase().includes(q) ||
          (r.dok.rechnungsnummer || "").toLowerCase().includes(q) ||
          r.mieterLabel.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name":
          av = a.dok.name;
          bv = b.dok.name;
          break;
        case "datum":
          av = a.dok.rechnungsdatum || a.dok.uploadedAt || "";
          bv = b.dok.rechnungsdatum || b.dok.uploadedAt || "";
          break;
        case "betrag":
          av = a.dok.betrag || 0;
          bv = b.dok.betrag || 0;
          break;
        case "liegenschaft":
          av = a.liegenschaftLabel;
          bv = b.liegenschaftLabel;
          break;
        case "gebaeude":
          av = a.gebaeudeLabel;
          bv = b.gebaeudeLabel;
          break;
        case "mieter":
          av = a.mieterLabel;
          bv = b.mieterLabel;
          break;
        case "firma":
          av = a.dok.firma || a.dok.auftragnehmer || "";
          bv = b.dok.firma || b.dok.auftragnehmer || "";
          break;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, sortKey, sortDir, filter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "betrag" || key === "datum" ? "desc" : "asc");
    }
  };

  const freigeben = async (abrechnung: Abrechnung, dok: Dokument) => {
    const status = dok.pruefung?.zahlungsfreigabe?.status === "freigegeben" ? "offen" : "freigegeben";
    const updatedDokumente = abrechnung.dokumente.map((d) =>
      d.id === dok.id
        ? {
            ...d,
            pruefung: {
              ...(d.pruefung || { erkannteMerkmale: [], score: 0, akzeptiert: false }),
              zahlungsfreigabe: { status, timestamp: new Date().toISOString() },
            },
          }
        : d
    );
    await patchAbrechnung(abrechnung.id, { dokumente: updatedDokumente });
    refresh();
  };

  const exportExcel = () => {
    // CSV mit BOM für Excel (DE)
    const sep = ";";
    const header = [
      "Nummer",
      "Dateiname",
      "Rechnungsnr.",
      "Datum",
      "Firma",
      "Leistungsart",
      "Leistungsort",
      "Betrag",
      "Liegenschaft",
      "Gebäude",
      "Mieter",
      "Status Freigabe",
      "Hochgeladen",
    ].join(sep);

    const lines = sorted.map((r) => {
      const d = r.dok;
      return [
        d.nummer || "",
        `"${(d.name || "").replace(/"/g, '""')}"`,
        d.rechnungsnummer || "",
        d.rechnungsdatum || "",
        `"${(d.firma || d.auftragnehmer || "").replace(/"/g, '""')}"`,
        `"${(d.leistungsart || "").replace(/"/g, '""')}"`,
        `"${(d.leistungsort || "").replace(/"/g, '""')}"`,
        typeof d.betrag === "number" ? d.betrag.toFixed(2).replace(".", ",") : "",
        `"${r.liegenschaftLabel.replace(/"/g, '""')}"`,
        r.gebaeudeLabel,
        `"${r.mieterLabel.replace(/"/g, '""')}"`,
        d.pruefung?.zahlungsfreigabe?.status || "offen",
        d.uploadedAt ? formatDate(d.uploadedAt) : "",
      ].join(sep);
    });

    const bom = "\uFEFF";
    const csv = bom + [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rechnungen_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn(
        "rounded px-2 py-1 text-xs font-medium hover:bg-muted",
        sortKey === k && "bg-muted text-primary"
      )}
    >
      {label}
      {sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">📥 Rechnungen</h1>
          <p className="text-sm text-muted-foreground">
            Alle erkannten Eingangsrechnungen – sortierbar wie in Excel, exportierbar als CSV/Excel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Suche…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={exportExcel}
            disabled={sorted.length === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            📊 Excel-Export
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 text-muted-foreground">
        <span className="self-center text-xs">Sortieren:</span>
        <SortBtn k="datum" label="Datum" />
        <SortBtn k="betrag" label="Betrag" />
        <SortBtn k="name" label="Dateiname" />
        <SortBtn k="firma" label="Firma" />
        <SortBtn k="liegenschaft" label="Liegenschaft" />
        <SortBtn k="gebaeude" label="Gebäude" />
        <SortBtn k="mieter" label="Mieter" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rechnungen hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(({ dok, abrechnung, liegenschaftLabel, mieterLabel }) => {
            const freigegeben = dok.pruefung?.zahlungsfreigabe?.status === "freigegeben";
            return (
              <div key={dok.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {dok.nummer || "—"}
                    </span>{" "}
                    <span className="font-semibold">{dok.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {dok.pruefung && <ProgressRing percent={dok.pruefung.score * 100} />}
                    {dok.storedFileName && (
                      <a
                        href={`/api/files/${dok.storedFileName}?mime=${encodeURIComponent(
                          dok.mimeType
                        )}&name=${encodeURIComponent(dok.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        👁 Ansehen
                      </a>
                    )}
                    <button
                      onClick={() => freigeben(abrechnung, dok)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium",
                        freigegeben
                          ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {freigegeben ? "✓ Freigegeben" : "Freigeben"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                  {dok.rechnungsnummer && <span>Nr.: {dok.rechnungsnummer}</span>}
                  {dok.rechnungsdatum && <span>Datum: {dok.rechnungsdatum}</span>}
                  {(dok.firma || dok.auftragnehmer) && (
                    <span>Firma: {dok.firma || dok.auftragnehmer}</span>
                  )}
                  {typeof dok.betrag === "number" && dok.betrag > 0 && (
                    <span>Betrag: {formatCurrency(dok.betrag)}</span>
                  )}
                  {dok.leistungsart && <span>Leistung: {dok.leistungsart}</span>}
                  {dok.leistungsort && <span>Ort: {dok.leistungsort}</span>}
                  <span>Liegenschaft: {liegenschaftLabel}</span>
                  {mieterLabel !== "—" && <span>Mieter: {mieterLabel}</span>}
                  <a
                    href={
                      abrechnung.wohnungId
                        ? `/liegenschaften?select=wohnung:${abrechnung.wohnungId}`
                        : abrechnung.gebaeudeId
                          ? `/liegenschaften?select=gebaeude:${abrechnung.gebaeudeId}`
                          : abrechnung.liegenschaftId
                            ? `/liegenschaften?select=liegenschaft:${abrechnung.liegenschaftId}`
                            : "/"
                    }
                    className="text-primary hover:underline"
                  >
                    Zugeordnet zu: {abrechnung.name} ↗
                  </a>
                  <span>Hochgeladen: {formatDate(dok.uploadedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
