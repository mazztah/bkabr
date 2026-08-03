"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import Dropzone from "./Dropzone";
import ThemeToggle from "./ThemeToggle";
import Modal from "./Modal";

const STATUS_STYLES: Record<string, string> = {
  Rohdaten: "bg-muted text-muted-foreground",
  Validierung: "bg-[var(--danger-bg)] text-[var(--destructive)]",
  Fertig: "bg-[var(--success-bg)] text-[var(--success)]",
};

export default function Sidebar() {
  const { abrechnungen, selectedId, select, filters, setFilters, createBlank, deleteAbrechnung } =
    useStore();
  const { pendingLiegenschaften, confirmPendingLiegenschaft, dismissPendingLiegenschaft } =
    useStore();
  const pending = pendingLiegenschaften[0];
  const [filtersOpen, setFiltersOpen] = useState(false);

  const jahre = useMemo(() => {
    const years = new Set<string>();
    abrechnungen.forEach((a) => {
      const match = a.zeitraum.match(/\d{4}/g);
      match?.forEach((y) => years.add(y));
    });
    return Array.from(years).sort().reverse();
  }, [abrechnungen]);

  const filtered = useMemo(() => {
    return abrechnungen.filter((a) => {
      if (filters.objektTyp !== "Alle" && a.objektTyp !== filters.objektTyp) return false;
      if (filters.status !== "Alle" && a.status !== filters.status) return false;
      if (filters.jahr !== "Alle" && !a.zeitraum.includes(filters.jahr)) return false;
      if (
        filters.suche &&
        !`${a.name} ${a.adresse}`.toLowerCase().includes(filters.suche.toLowerCase())
      )
        return false;
      return true;
    });
  }, [abrechnungen, filters]);

  return (
    <aside className="w-full lg:w-96 shrink-0 border-r border-border bg-card flex flex-col lg:h-full lg:overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold leading-tight">BetriebsKostenBot</h1>
            <p className="text-xs text-muted-foreground">KI-Betriebskostenabrechnungen</p>
          </div>
          <ThemeToggle />
        </div>
        <Dropzone compact />
        <button
          onClick={() => createBlank()}
          className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
        >
          ＋ Leere Abrechnung anlegen
        </button>
      </div>

      <div className="border-b border-border">
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left lg:hidden"
        >
          <span className="text-sm font-medium text-muted-foreground">🔎 Suche &amp; Filter</span>
          <span className="text-xs text-muted-foreground">{filtersOpen ? "▲" : "▼"}</span>
        </button>
        <div
          className={`space-y-2 p-4 ${filtersOpen ? "block" : "hidden"} lg:block lg:pt-4`}
        >
          <input
            value={filters.suche}
            onChange={(e) => setFilters({ suche: e.target.value })}
            placeholder="Suche (Adresse, Name) …"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={filters.objektTyp}
              onChange={(e) => setFilters({ objektTyp: e.target.value as any })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option>Alle</option>
              <option>Wohnung</option>
              <option>Haus</option>
              <option>Gewerbe</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value as any })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option>Alle</option>
              <option>Rohdaten</option>
              <option>Validierung</option>
              <option>Fertig</option>
            </select>
            <select
              value={filters.jahr}
              onChange={(e) => setFilters({ jahr: e.target.value as any })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option>Alle</option>
              {jahre.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-h-[46vh] overflow-y-auto p-4 space-y-3 lg:max-h-none lg:flex-1">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Keine Abrechnungen gefunden.
          </p>
        )}
        {filtered.map((a) => (
          <div
            key={a.id}
            onClick={() => select(a.id)}
            className={`group relative rounded-xl border p-4 cursor-pointer transition-all ${
              selectedId === a.id
                ? "border-primary bg-secondary"
                : "border-border bg-background hover:border-primary/50"
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`"${a.name}" wirklich löschen?`)) deleteAbrechnung(a.id);
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive transition-opacity"
            >
              ✕
            </button>
            <div className="flex items-center justify-between gap-2 pr-4">
              <span className="font-semibold truncate">{a.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[a.status]}`}
              >
                {a.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {a.adresse || "Keine Adresse"} {a.zeitraum && `• ${a.zeitraum}`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{a.objektTyp}</div>
            <div className="font-mono text-lg font-bold mt-1">
              {formatCurrency(a.gesamtSumme)}
            </div>
          </div>
        ))}
      </div>

      {pending && (
        <Modal title="Neue Liegenschaft erkannt" onClose={dismissPendingLiegenschaft}>
          <p className="mb-3 text-sm text-muted-foreground">
            Die hochgeladene Rechnung nennt eine Adresse, die noch keiner Liegenschaft im System
            zugeordnet werden konnte:
          </p>
          <p className="mb-4 rounded-md border border-border bg-muted p-2.5 text-sm font-medium">
            {pending.strasse ? `${pending.strasse} ${pending.hausnummer}, ` : ""}
            {pending.plz} {pending.ort}
            {!pending.strasse && !pending.plz && pending.grund}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Soll dafür jetzt eine neue Liegenschaft angelegt und mit dieser Abrechnung verknüpft
            werden? Du kannst das auch später manuell unter „Liegenschaften“ nachholen.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={dismissPendingLiegenschaft}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Später
            </button>
            <button
              onClick={confirmPendingLiegenschaft}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Jetzt anlegen
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
