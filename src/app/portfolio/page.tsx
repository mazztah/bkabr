"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, AlertTriangle, CalendarClock, FileWarning } from "lucide-react";

interface ProLiegenschaft {
  id: string;
  name: string;
  ort?: string;
  gebaeude: number;
  wohnungen: number;
  flurstuecke: number;
  vertraege: number;
  anlagen: number;
  zaehler: number;
  veranstaltungsflaechen: number;
  offeneTickets: number;
  pruefungenUeberfaellig: number;
}

interface PortfolioDaten {
  gesamt: Record<string, number>;
  proLiegenschaft: ProLiegenschaft[];
  handlungsbedarf: {
    ueberfaelligePruefungen: { id: string; bezeichnung: string; typ: string; faellig?: string }[];
    auslaufendeVertraege: { id: string; bezeichnung: string; art: string; ende?: string }[];
    kommendeReservierungen: { id: string; titel: string; beginn: string; status: string }[];
  };
}

function Kachel({ label, wert, link }: { label: string; wert: number; link?: string }) {
  const inhalt = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{wert}</p>
    </div>
  );
  return link ? <Link href={link}>{inhalt}</Link> : inhalt;
}

export default function PortfolioPage() {
  const [daten, setDaten] = useState<PortfolioDaten | null>(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setDaten(j);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Lädt …</div>;
  if (fehler) return <div className="p-6 text-sm text-[var(--destructive)]">{fehler}</div>;
  if (!daten) return null;

  const h = daten.handlungsbedarf;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LayoutDashboard size={22} className="text-primary" />
          Portfolio-Übersicht
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bestandskennzahlen über alle Module hinweg, plus aktueller Handlungsbedarf.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kachel label="Liegenschaften" wert={daten.gesamt.liegenschaften} link="/liegenschaften" />
        <Kachel label="Gebäude" wert={daten.gesamt.gebaeude} link="/gebaeude" />
        <Kachel label="Wohnungen" wert={daten.gesamt.wohnungen} link="/wohnungen" />
        <Kachel label="Flurstücke" wert={daten.gesamt.flurstuecke} link="/flurstuecke" />
        <Kachel label="Aktive Verträge" wert={daten.gesamt.vertraege} link="/vertraege" />
        <Kachel label="Technische Anlagen" wert={daten.gesamt.anlagen} link="/anlagen" />
        <Kachel label="Zähler" wert={daten.gesamt.zaehler} link="/zaehler" />
        <Kachel label="Offene Tickets" wert={daten.gesamt.offeneTickets} link="/ticketsystem" />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle size={15} className="text-[var(--destructive)]" />
            Überfällige Prüfungen ({h.ueberfaelligePruefungen.length})
          </h2>
          {h.ueberfaelligePruefungen.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine überfälligen Prüfungen.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {h.ueberfaelligePruefungen.slice(0, 6).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.bezeichnung}</span>
                  <span className="shrink-0 text-[var(--destructive)]">
                    {p.faellig ? new Date(p.faellig).toLocaleDateString("de-DE") : ""}
                  </span>
                </li>
              ))}
              {h.ueberfaelligePruefungen.length > 6 && (
                <li className="text-muted-foreground">+{h.ueberfaelligePruefungen.length - 6} weitere</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <FileWarning size={15} className="text-amber-500" />
            Verträge enden bald ({h.auslaufendeVertraege.length})
          </h2>
          {h.auslaufendeVertraege.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Vertragsenden in den nächsten 90 Tagen.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {h.auslaufendeVertraege.slice(0, 6).map((v) => (
                <li key={v.id} className="flex justify-between gap-2">
                  <span className="truncate">{v.bezeichnung}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {v.ende ? new Date(v.ende).toLocaleDateString("de-DE") : ""}
                  </span>
                </li>
              ))}
              {h.auslaufendeVertraege.length > 6 && (
                <li className="text-muted-foreground">+{h.auslaufendeVertraege.length - 6} weitere</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <CalendarClock size={15} className="text-primary" />
            Kommende Reservierungen ({h.kommendeReservierungen.length})
          </h2>
          {h.kommendeReservierungen.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine anstehenden Reservierungen.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {h.kommendeReservierungen.slice(0, 6).map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="truncate">{r.titel}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(r.beginn).toLocaleDateString("de-DE")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Liegenschaft</th>
              <th className="px-3 py-2 font-medium">Gebäude</th>
              <th className="px-3 py-2 font-medium">Whg.</th>
              <th className="px-3 py-2 font-medium">Flurst.</th>
              <th className="px-3 py-2 font-medium">Verträge</th>
              <th className="px-3 py-2 font-medium">Anlagen</th>
              <th className="px-3 py-2 font-medium">Zähler</th>
              <th className="px-3 py-2 font-medium">Tickets</th>
              <th className="px-3 py-2 font-medium">Überfällig</th>
            </tr>
          </thead>
          <tbody>
            {daten.proLiegenschaft.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Noch keine Liegenschaften erfasst.
                </td>
              </tr>
            ) : (
              daten.proLiegenschaft.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{p.name}</div>
                    {p.ort && <div className="text-xs text-muted-foreground">{p.ort}</div>}
                  </td>
                  <td className="px-3 py-2.5">{p.gebaeude}</td>
                  <td className="px-3 py-2.5">{p.wohnungen}</td>
                  <td className="px-3 py-2.5">{p.flurstuecke}</td>
                  <td className="px-3 py-2.5">{p.vertraege}</td>
                  <td className="px-3 py-2.5">{p.anlagen}</td>
                  <td className="px-3 py-2.5">{p.zaehler}</td>
                  <td className="px-3 py-2.5">{p.offeneTickets}</td>
                  <td className="px-3 py-2.5">
                    {p.pruefungenUeberfaellig > 0 ? (
                      <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--destructive)]">
                        {p.pruefungenUeberfaellig}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
