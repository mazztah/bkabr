"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/utils";
import { Investor, InvestorStatus, INVESTOR_STATUS_LABEL } from "@/lib/types";
import {
  INVESTOR_HUB_VORSCHLAEGE,
  INVESTOR_LAND_VORSCHLAEGE,
  INVESTOR_SEKTOR_VORSCHLAEGE,
} from "@/lib/investoren";

const STATUS_FARBE: Record<InvestorStatus, string> = {
  vorschlag: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  freigegeben: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  kontaktiert: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_gespraech: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  abgelehnt: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const LEER_NEU = {
  firma: "",
  land: "",
  hub: "",
  ansprechpartnerName: "",
  email: "",
  telefon: "",
  webseite: "",
  linkedinUrl: "",
  xingUrl: "",
  sektorenText: "",
  kurzprofil: "",
};

export default function InvestorenPage() {
  const [investoren, setInvestoren] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<InvestorStatus | "">("");
  const [sektorFilter, setSektorFilter] = useState("");
  const [query, setQuery] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState(LEER_NEU);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freigebenLaufend, setFreigebenLaufend] = useState<string | null>(null);
  const [stammdatenLauf, setStammdatenLauf] = useState<{
    laufend: boolean;
    aktuellerName?: string;
    erledigt: number;
    gesamt: number;
    fehler: string[];
  } | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch("/api/investoren")
      .then((r) => r.json())
      .then((json) => setInvestoren(json.investoren || []))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of investoren) counts[inv.status] = (counts[inv.status] || 0) + 1;
    return counts;
  }, [investoren]);

  const offenFuerStammdaten = useMemo(
    () => investoren.filter((inv) => inv.status === "freigegeben" && !inv.stammdatenAktualisiertAm).length,
    [investoren]
  );

  const gefiltert = useMemo(() => {
    return investoren.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (sektorFilter && !inv.sektoren.some((s) => s.toLowerCase().includes(sektorFilter.toLowerCase()))) {
        return false;
      }
      if (query) {
        const hay = `${inv.firma} ${inv.ansprechpartnerName || ""} ${inv.land} ${inv.kurzprofil || ""}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [investoren, statusFilter, sektorFilter, query]);

  const freigeben = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFreigebenLaufend(id);
    try {
      const res = await fetch(`/api/investoren/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "freigegeben" }),
      });
      if (res.ok) {
        const json = await res.json();
        setInvestoren((prev) => prev.map((inv) => (inv.id === id ? json.investor || inv : inv)));
      }
    } finally {
      setFreigebenLaufend(null);
    }
  };

  // Verarbeitet die freigegebenen, noch nicht angereicherten Investoren EINZELN
  // nacheinander (ein Request pro Investor, siehe /api/investoren/[id]/stammdaten) –
  // damit die Liste live nach jedem Investor aktualisiert wird, statt auf einen
  // einzigen langen Sammel-Request zu warten.
  const stammdatenUpdaten = async () => {
    const targets = investoren.filter((inv) => inv.status === "freigegeben" && !inv.stammdatenAktualisiertAm);
    if (targets.length === 0) return;
    setStammdatenLauf({ laufend: true, erledigt: 0, gesamt: targets.length, fehler: [] });
    const fehler: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const inv = targets[i];
      setStammdatenLauf({ laufend: true, aktuellerName: inv.firma, erledigt: i, gesamt: targets.length, fehler });
      try {
        const res = await fetch(`/api/investoren/${inv.id}/stammdaten`, { method: "POST" });
        const json = await res.json();
        if (res.ok && json.investor) {
          setInvestoren((prev) => prev.map((x) => (x.id === inv.id ? json.investor : x)));
        } else {
          fehler.push(`${inv.firma}: ${json.error || "unbekannter Fehler"}`);
        }
      } catch {
        fehler.push(`${inv.firma}: Netzwerkfehler`);
      }
    }
    setStammdatenLauf({ laufend: false, erledigt: targets.length, gesamt: targets.length, fehler });
  };

  const anlegen = async () => {
    if (!neu.firma.trim() || !neu.land.trim()) {
      setError("Firma und Land sind erforderlich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/investoren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...neu,
          sektoren: neu.sektorenText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Anlegen fehlgeschlagen");
        return;
      }
      setNeuOffen(false);
      setNeu(LEER_NEU);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">💼 Investoren</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Kontaktsammlung aus Startup/VC, Private Equity, IT/Software, KI/AI, Real Estate,
            Property-/Facility-/Asset-Management – weltweit. Neue Kandidaten kann der Agent per
            Websuche recherchieren (Chat unten rechts, z.B. „suche 10 neue KI-Investoren aus
            Deutschland und den USA“) oder du legst sie hier manuell an.
          </p>
        </div>
        <button
          onClick={() => setNeuOffen(true)}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          ＋ Investor manuell anlegen
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(INVESTOR_STATUS_LABEL) as InvestorStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === s ? "ring-2 ring-primary" : ""
            } ${STATUS_FARBE[s]}`}
          >
            {INVESTOR_STATUS_LABEL[s]} · {statusCounts[s] || 0}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche (Firma, Ansprechpartner, Land, Profil) …"
          className="w-64 rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <select
          value={sektorFilter}
          onChange={(e) => setSektorFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Alle Sektoren</option>
          {INVESTOR_SEKTOR_VORSCHLAEGE.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {investoren.length === 0
            ? "Noch keine Investoren erfasst. Lass den Agenten im Chat nach Kandidaten suchen oder lege einen manuell an."
            : "Keine Investoren passen zu den aktuellen Filtern."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {gefiltert.map((inv) => (
            <Link
              key={inv.id}
              href={`/investoren/${inv.id}`}
              className="rounded-lg border border-border bg-card p-4 text-sm transition hover:border-primary/50"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="font-semibold">{inv.firma}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_FARBE[inv.status]}`}>
                  {INVESTOR_STATUS_LABEL[inv.status]}
                </span>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {inv.land}
                {inv.hub ? ` · ${inv.hub}` : ""}
                {typeof inv.score === "number" ? ` · Score ${inv.score}/10` : ""}
              </p>
              {inv.sektoren.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {inv.sektoren.slice(0, 4).map((s) => (
                    <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {inv.kurzprofil && <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{inv.kurzprofil}</p>}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Angelegt: {formatDate(inv.createdAt)}
                  {inv.stammdatenAktualisiertAm ? " · ✓ Stammdaten aktuell" : ""}
                </p>
                {inv.status === "vorschlag" && (
                  <button
                    onClick={(e) => freigeben(e, inv.id)}
                    disabled={freigebenLaufend === inv.id}
                    className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-400"
                  >
                    {freigebenLaufend === inv.id ? "…" : "✓ Freigeben"}
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {investoren.length > 0 && (
        <div className="mt-5 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Stammdaten updaten</p>
              <p className="text-xs text-muted-foreground">
                {offenFuerStammdaten > 0
                  ? `${offenFuerStammdaten} freigegebene(r) Investor(en) ohne vollständige Stammdaten. Sucht pro Investor einzeln nach Kontakt/Ansprechpartner und bewertet die Aufnahme-Kriterien.`
                  : "Alle freigegebenen Investoren haben aktuelle Stammdaten. Auch per Chat möglich: „Stammdaten für die freigegebenen Investoren anlegen“."}
              </p>
            </div>
            <button
              onClick={stammdatenUpdaten}
              disabled={offenFuerStammdaten === 0 || Boolean(stammdatenLauf?.laufend)}
              className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {stammdatenLauf?.laufend
                ? `Aktualisiere … (${stammdatenLauf.erledigt}/${stammdatenLauf.gesamt})`
                : `Stammdaten updaten${offenFuerStammdaten > 0 ? ` (${offenFuerStammdaten})` : ""}`}
            </button>
          </div>
          {stammdatenLauf?.laufend && stammdatenLauf.aktuellerName && (
            <p className="mt-2 text-xs text-muted-foreground">Gerade dran: {stammdatenLauf.aktuellerName} …</p>
          )}
          {!stammdatenLauf?.laufend && stammdatenLauf && stammdatenLauf.gesamt > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Fertig: {stammdatenLauf.erledigt}/{stammdatenLauf.gesamt} aktualisiert
              {stammdatenLauf.fehler.length > 0 ? `, ${stammdatenLauf.fehler.length} Fehler` : ""}.
            </p>
          )}
          {stammdatenLauf && stammdatenLauf.fehler.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-[var(--destructive)]">
              {stammdatenLauf.fehler.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {neuOffen && (
        <Modal title="Investor manuell anlegen" onClose={() => setNeuOffen(false)}>
          {error && <p className="mb-3 text-sm text-[var(--destructive)]">⚠️ {error}</p>}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={neu.firma}
                onChange={(e) => setNeu({ ...neu, firma: e.target.value })}
                placeholder="Firma *"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                value={neu.land}
                onChange={(e) => setNeu({ ...neu, land: e.target.value })}
                placeholder="Land *"
                list="investor-land-vorschlaege"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <datalist id="investor-land-vorschlaege">
                {INVESTOR_LAND_VORSCHLAEGE.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={neu.hub}
                onChange={(e) => setNeu({ ...neu, hub: e.target.value })}
                placeholder="Hub (z.B. Silicon Valley)"
                list="investor-hub-vorschlaege"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <datalist id="investor-hub-vorschlaege">
                {INVESTOR_HUB_VORSCHLAEGE.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
              <input
                value={neu.ansprechpartnerName}
                onChange={(e) => setNeu({ ...neu, ansprechpartnerName: e.target.value })}
                placeholder="Ansprechpartner"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <input
              value={neu.sektorenText}
              onChange={(e) => setNeu({ ...neu, sektorenText: e.target.value })}
              placeholder={`Sektoren, kommagetrennt (z.B. ${INVESTOR_SEKTOR_VORSCHLAEGE[3]}, ${INVESTOR_SEKTOR_VORSCHLAEGE[4]})`}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={neu.email}
                onChange={(e) => setNeu({ ...neu, email: e.target.value })}
                placeholder="E-Mail"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                value={neu.telefon}
                onChange={(e) => setNeu({ ...neu, telefon: e.target.value })}
                placeholder="Telefon"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={neu.webseite}
                onChange={(e) => setNeu({ ...neu, webseite: e.target.value })}
                placeholder="Webseite"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                value={neu.linkedinUrl}
                onChange={(e) => setNeu({ ...neu, linkedinUrl: e.target.value })}
                placeholder="LinkedIn-URL"
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <input
              value={neu.xingUrl}
              onChange={(e) => setNeu({ ...neu, xingUrl: e.target.value })}
              placeholder="Xing-URL"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <textarea
              value={neu.kurzprofil}
              onChange={(e) => setNeu({ ...neu, kurzprofil: e.target.value })}
              placeholder="Kurzprofil / Lebenslauf"
              rows={3}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setNeuOffen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              onClick={anlegen}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Speichere…" : "Anlegen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
