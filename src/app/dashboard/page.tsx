"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { DashboardUebersicht, SYSTEM_LOG_TYP_ICON } from "@/lib/types";
import ProgressRing from "@/components/ProgressRing";
import KpiInfo from "@/components/KpiInfo";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardUebersicht | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/uebersicht")
      .then((r) => r.json())
      .then((d) => {
        setData(d.uebersicht || null);
        setLoading(false);
      });
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-bold">🎛️ Business Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Alle Kennzahlen hier basieren auf echten Daten aus Buchhaltung, Stammdaten und
          Plausibilitätsprüfung — keine Platzhalterwerte. Je mehr Buchungen und Stammdaten erfasst
          sind, desto aussagekräftiger werden Score und Trends.
        </p>
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Lade Kennzahlen…</p>
      ) : (
        <>
          <HeroArea data={data} />
          <BusinessCockpit data={data} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ActivityFeed data={data} />
            <RoadmapCard />
          </div>
        </>
      )}
    </div>
  );
}

function HeroArea({ data }: { data: DashboardUebersicht }) {
  const { kennzahlen, objekte } = data;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-4">
      <div className="flex items-center gap-3">
        <ProgressRing percent={kennzahlen.businessHealthScore} size={52} />
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Business Health <KpiInfo kpiId="businessHealthScore" label="Business Health Score" />
          </div>
          <div className="text-lg font-bold tabular-nums">{kennzahlen.businessHealthScore} / 100</div>
        </div>
      </div>

      <HeroMetric
        label="Gewinn"
        kpiId="gewinn"
        value={formatCurrency(kennzahlen.cashflow)}
        positive={kennzahlen.cashflow >= 0}
      />
      <HeroMetric
        label="Liquiditätsgrad I"
        kpiId="liquiditaetsgradI"
        value={kennzahlen.liquiditaetsgradI === null ? "—" : formatPercent(kennzahlen.liquiditaetsgradI)}
        hint={kennzahlen.liquiditaetsgradI === null ? "keine Verbindlichkeiten erfasst" : undefined}
      />
      <HeroMetric
        label="Belegungsquote"
        kpiId="belegungsquote"
        value={objekte.belegungsquote === null ? "—" : formatPercent(objekte.belegungsquote)}
        hint={objekte.belegungsquote === null ? "keine Wohnungen erfasst" : undefined}
      />
    </div>
  );
}

function HeroMetric({
  label,
  kpiId,
  value,
  hint,
  positive,
}: {
  label: string;
  kpiId: string;
  value: string;
  hint?: string;
  positive?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} <KpiInfo kpiId={kpiId} label={label} />
      </div>
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          positive === true && "text-[var(--success)]",
          positive === false && "text-[var(--destructive)]"
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function BusinessCockpit({ data }: { data: DashboardUebersicht }) {
  const { buchhaltung, objekte, abrechnungen, pruefung, kennzahlen } = data;

  const tiles: { label: string; kpiId?: string; value: string; href?: string; tone?: "success" | "destructive" }[] = [
    { label: "Einnahmen", kpiId: "einnahmen", value: formatCurrency(buchhaltung.einnahmen), href: "/buchhaltung" },
    { label: "Ausgaben", kpiId: "ausgaben", value: formatCurrency(buchhaltung.ausgaben), href: "/buchhaltung" },
    {
      label: "Bilanzsumme (Aktiva)",
      kpiId: "bilanzsumme",
      value: formatCurrency(buchhaltung.bilanz.summeAktiva),
      href: "/buchhaltung",
    },
    {
      label: "Eigenkapitalquote",
      kpiId: "eigenkapitalquote",
      value: kennzahlen.eigenkapitalquote === null ? "—" : formatPercent(kennzahlen.eigenkapitalquote),
      href: "/buchhaltung",
    },
    {
      label: "Liegenschaften / Gebäude / Wohnungen",
      value: `${objekte.liegenschaften} / ${objekte.gebaeude} / ${objekte.wohnungen}`,
      href: "/liegenschaften",
    },
    { label: "Aktive Mieter", value: String(objekte.mieterAktiv), href: "/mieter" },
    {
      label: "Abrechnungen (Rohdaten / Validierung / Fertig)",
      value: `${abrechnungen.rohdaten} / ${abrechnungen.validierung} / ${abrechnungen.fertig}`,
      href: "/",
    },
    {
      label: "Offene Prüfbefunde",
      kpiId: "offeneBefunde",
      value: String(pruefung.offeneBefunde),
      href: "/pruefung",
      tone: pruefung.fehler > 0 ? "destructive" : pruefung.offeneBefunde > 0 ? undefined : "success",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const content = (
          <div className="h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              {t.label}
              {t.kpiId && <KpiInfo kpiId={t.kpiId} label={t.label} />}
            </div>
            <div
              className={cn(
                "text-base font-bold tabular-nums",
                t.tone === "success" && "text-[var(--success)]",
                t.tone === "destructive" && "text-[var(--destructive)]"
              )}
            >
              {t.value}
            </div>
          </div>
        );
        return t.href ? (
          <Link key={t.label} href={t.href}>
            {content}
          </Link>
        ) : (
          <div key={t.label}>{content}</div>
        );
      })}
    </div>
  );
}

function ActivityFeed({ data }: { data: DashboardUebersicht }) {
  return (
    <div className="rounded-lg border border-border bg-card lg:col-span-2">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">📋 Aktivitäts-Protokoll</h2>
        <p className="text-xs text-muted-foreground">
          Letzte Systemereignisse — Vorstufe des geplanten Kontext-Recorders für den LLM-Agenten
          (Durchgang 5).
        </p>
      </div>
      {data.aktivitaet.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">Noch keine Ereignisse protokolliert.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.aktivitaet.map((e) => (
            <div key={e.id} className="flex items-start gap-2 p-3 text-sm">
              <span>{SYSTEM_LOG_TYP_ICON[e.typ]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{e.text}</div>
                <div className="text-xs text-muted-foreground">{formatDate(e.zeitpunkt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoadmapCard() {
  const kommend = [
    { titel: "LLM Control Center", durchgang: 5, beschreibung: "Chat, Kontext-Recorder, Daily-Loop-Routinen" },
    { titel: "AI Cost Observatory", durchgang: 6, beschreibung: "Token-/Kosten-Tracking je Modell, Free-Tier-Empfehlungen" },
    { titel: "Predictive Intelligence", durchgang: 7, beschreibung: "Forecasts, Anomalieerkennung, Frühwarnungen" },
  ];

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">🗺️ Als Nächstes geplant</h2>
      <div className="space-y-3">
        {kommend.map((k) => (
          <div key={k.titel} className="text-xs">
            <div className="font-medium text-foreground">
              {k.titel} <span className="text-muted-foreground">· Durchgang {k.durchgang}</span>
            </div>
            <div className="text-muted-foreground">{k.beschreibung}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
