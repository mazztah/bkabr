"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { DashboardUebersicht, DashboardVerlauf, SYSTEM_LOG_TYP_ICON } from "@/lib/types";
import ProgressRing from "@/components/ProgressRing";
import KpiInfo, { KPI_KATALOG } from "@/components/KpiInfo";
import Sparkline from "@/components/Sparkline";
import CategoryBars from "@/components/CategoryBars";
import LlmControlCenter from "@/components/dashboard/LlmControlCenter";
import AiObservatory from "@/components/dashboard/AiObservatory";
import NewsWidget from "@/components/dashboard/NewsWidget";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardUebersicht | null>(null);
  const [verlauf, setVerlauf] = useState<DashboardVerlauf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/uebersicht").then((r) => r.json()),
      fetch("/api/dashboard/verlauf").then((r) => r.json()),
    ]).then(([u, v]) => {
      setData(u.uebersicht || null);
      setVerlauf(v.verlauf || null);
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
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="flex-1">
              <HeroArea data={data} />
            </div>
            <NewsWidget />
          </div>
          <LlmControlCenter />
          <AiObservatory />
          <BusinessCockpit data={data} />
          {verlauf && <TrendCharts verlauf={verlauf} />}
          <CategoryBreakdown data={data} />
          <KpiExplorer data={data} />
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
    <div className="grid h-full grid-cols-2 gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-4">
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
      label: "Umsatzrendite",
      kpiId: "umsatzrendite",
      value: kennzahlen.umsatzrendite === null ? "—" : formatPercent(kennzahlen.umsatzrendite),
      href: "/buchhaltung",
      tone: kennzahlen.umsatzrendite !== null ? (kennzahlen.umsatzrendite >= 0 ? "success" : "destructive") : undefined,
    },
    {
      label: "Working Capital",
      kpiId: "workingCapital",
      value: kennzahlen.workingCapital === null ? "—" : formatCurrency(kennzahlen.workingCapital),
      href: "/buchhaltung",
      tone: kennzahlen.workingCapital !== null ? (kennzahlen.workingCapital >= 0 ? "success" : "destructive") : undefined,
    },
    {
      label: "Automatisierungsgrad Buchhaltung",
      kpiId: "automatisierungsgrad",
      value: kennzahlen.automatisierungsgrad === null ? "—" : formatPercent(kennzahlen.automatisierungsgrad),
      href: "/buchhaltung",
    },
    {
      label: "Cash-Burn-Reichweite",
      kpiId: "cashBurnTageReichweite",
      value: kennzahlen.cashBurnTageReichweite === null ? "—" : `${kennzahlen.cashBurnTageReichweite} Tage`,
      href: "/buchhaltung",
      tone:
        kennzahlen.cashBurnTageReichweite !== null
          ? kennzahlen.cashBurnTageReichweite < 30
            ? "destructive"
            : "success"
          : undefined,
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

function TrendCharts({ verlauf }: { verlauf: DashboardVerlauf }) {
  const gewinnWerte = verlauf.buchungen.map((p) => p.gewinnKumuliert);
  const pruefWerte = verlauf.pruefung.map((p) => p.offeneBefunde);
  const aktivitaetWerte = verlauf.aktivitaet.map((p) => p.anzahl);

  const letzterGewinn = verlauf.buchungen[verlauf.buchungen.length - 1]?.gewinnKumuliert;
  const letzterPruefwert = verlauf.pruefung[verlauf.pruefung.length - 1]?.offeneBefunde;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <TrendCard
        title="Gewinn (kumuliert)"
        subtitle="aus allen Buchungstagen im Journal"
        values={gewinnWerte}
        summary={letzterGewinn !== undefined ? formatCurrency(letzterGewinn) : undefined}
      />
      <TrendCard
        title="Offene Prüfbefunde je Lauf"
        subtitle="Verlauf über bisherige Plausibilitätsprüfungen"
        values={pruefWerte}
        summary={letzterPruefwert !== undefined ? `${letzterPruefwert} offen` : undefined}
      />
      <TrendCard
        title="Systemaktivität"
        subtitle="Ereignisse pro Tag, letzte 30 Tage"
        values={aktivitaetWerte}
        summary={aktivitaetWerte.length > 0 ? `Ø ${(aktivitaetWerte.reduce((s, v) => s + v, 0) / aktivitaetWerte.length).toFixed(1)}/Tag` : undefined}
      />
    </div>
  );
}

function TrendCard({
  title,
  subtitle,
  values,
  summary,
}: {
  title: string;
  subtitle: string;
  values: number[];
  summary?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        {summary && <div className="shrink-0 text-sm font-bold tabular-nums">{summary}</div>}
      </div>
      <Sparkline values={values} width={220} height={44} />
    </div>
  );
}

function CategoryBreakdown({ data }: { data: DashboardUebersicht }) {
  const { einnahmenNachKategorie, ausgabenNachKategorie } = data.buchhaltung;
  const hatDaten =
    Object.keys(einnahmenNachKategorie).length > 0 || Object.keys(ausgabenNachKategorie).length > 0;

  if (!hatDaten) return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Einnahmen nach Kategorie</h2>
        <CategoryBars data={einnahmenNachKategorie} color="var(--success)" />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Ausgaben nach Kategorie</h2>
        <CategoryBars data={ausgabenNachKategorie} color="var(--destructive)" />
      </div>
    </div>
  );
}

function formatKpiValue(id: string, data: DashboardUebersicht): string {
  const k = data.kennzahlen;
  const pct = (v: number | null) => (v === null ? "—" : formatPercent(v));
  switch (id) {
    case "umsatz":
      return formatCurrency(k.umsatz);
    case "gewinn":
      return formatCurrency(data.buchhaltung.gewinn);
    case "ebitda":
      return formatCurrency(k.ebitda);
    case "ebit":
      return formatCurrency(k.ebit);
    case "liquiditaetsgradI":
      return pct(k.liquiditaetsgradI);
    case "liquiditaetsgradII":
      return pct(k.liquiditaetsgradII);
    case "liquiditaetsgradIII":
      return pct(k.liquiditaetsgradIII);
    case "eigenkapitalquote":
      return pct(k.eigenkapitalquote);
    case "workingCapital":
      return k.workingCapital === null ? "—" : formatCurrency(k.workingCapital);
    case "businessHealthScore":
      return `${k.businessHealthScore} / 100`;
    case "korrespondenzAutomatisierungsgrad":
      return pct(k.korrespondenzAutomatisierungsgrad);
    case "kiKonfidenzScore":
      return pct(k.kiKonfidenzScore);
    case "gesamtAutomatisierungsgrad":
      return pct(k.gesamtAutomatisierungsgrad);
    case "processingSpeedStunden":
      return k.processingSpeedStunden === null ? "—" : `${k.processingSpeedStunden.toFixed(1)} Std.`;
    case "riskExposureIndex":
      return `${Math.round(k.riskExposureIndex)} / 100`;
    case "cashBurnTageReichweite":
      return k.cashBurnTageReichweite === null ? "—" : `${k.cashBurnTageReichweite} Tage`;
    case "dataQualityScore":
      return k.dataQualityScore === null ? "—" : `${Math.round(k.dataQualityScore)} / 100`;
    default:
      return "—";
  }
}

function KpiExplorer({ data }: { data: DashboardUebersicht }) {
  const klassisch = KPI_KATALOG.filter((k) => k.kategorie === "klassisch");
  const modern = KPI_KATALOG.filter((k) => k.kategorie === "modern");

  return (
    <div className="mb-6 rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">📖 Kennzahlen-Explorer</h2>
        <p className="text-xs text-muted-foreground">
          Alle 10 klassischen + 15 modernen Kennzahlen aus dem Konzept — live berechnete mit Wert,
          geplante ehrlich mit Durchgang/Voraussetzung markiert.
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <KpiExplorerSpalte titel="Klassisch" eintraege={klassisch} data={data} />
        <KpiExplorerSpalte titel="Modern" eintraege={modern} data={data} />
      </div>
    </div>
  );
}

function KpiExplorerSpalte({
  titel,
  eintraege,
  data,
}: {
  titel: string;
  eintraege: typeof KPI_KATALOG;
  data: DashboardUebersicht;
}) {
  return (
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">
        {titel} ({eintraege.length})
      </div>
      <div className="space-y-1">
        {eintraege.map((kpi, i) => (
          <div key={`${kpi.id}-${i}`} className="flex items-center justify-between gap-2 py-1 text-sm">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{kpi.label}</span>
              <KpiInfo kpiId={kpi.id} label={kpi.label} />
            </div>
            {kpi.geplantAb ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                geplant · {kpi.geplantAb}
              </span>
            ) : (
              <span className="shrink-0 font-semibold tabular-nums">{formatKpiValue(kpi.id, data)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed({ data }: { data: DashboardUebersicht }) {
  return (
    <div className="rounded-lg border border-border bg-card lg:col-span-2">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">📋 Aktivitäts-Protokoll</h2>
        <p className="text-xs text-muted-foreground">
          Letzte Systemereignisse — der Kontext, den der LLM Dashboard Agent oben für seine Hinweise
          und im Chat als Gesprächskontext heranzieht.
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
