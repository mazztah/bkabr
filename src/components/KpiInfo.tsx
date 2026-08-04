"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface KpiErklaerung {
  definition: string;
  berechnung: string;
  interpretation: string;
  folgekennzahlen?: string[];
}

/**
 * Zentrales Wörterbuch aller Kennzahlen-Erklärungen. Wird in Durchgang 4
 * ("KPI & Analytics Engine") auf die vollen 10 klassischen + 15 modernen
 * Kennzahlen erweitert – aktuell nur für die im Dashboard bereits mit echten
 * Daten befüllten Kennzahlen, damit keine Erklärung ohne echten Wert im UI
 * auftaucht.
 */
export const KPI_ERKLAERUNGEN: Record<string, KpiErklaerung> = {
  businessHealthScore: {
    definition: "Zusammengesetzter 0–100-Indikator für den Gesamtzustand des Geschäfts.",
    berechnung:
      "Gleich gewichteter Mittelwert aus Gewinnmarge, Bilanzgleichgewicht, offenen Prüfbefunden und Belegungsquote. Fehlt eine Datenquelle, geht sie neutral mit 50 ein statt den Score zu verzerren.",
    interpretation:
      "Ein Wert nahe 50 bedeutet häufig noch fehlende Datenbasis, nicht zwingend ein Problem. Erst mit wachsender Buchungshistorie wird der Score aussagekräftig.",
    folgekennzahlen: ["Gewinn", "Liquiditätsgrad I", "Eigenkapitalquote"],
  },
  gewinn: {
    definition: "Einnahmen minus Ausgaben im Buchhaltungsjournal.",
    berechnung: "Gewinn = Σ Einnahmen − Σ Ausgaben",
    interpretation:
      "Noch ohne Zeitraumvergleich wenig aussagekräftig — sobald mehrere Monate vorliegen, wird der Trendverlauf relevanter als der Absolutwert.",
    folgekennzahlen: ["Cashflow", "Eigenkapitalquote"],
  },
  einnahmen: {
    definition: "Summe aller im Journal erfassten Einnahmebuchungen.",
    berechnung: "Σ Buchungen mit typ = Einnahme",
    interpretation: "Sprunghafte Veränderungen lohnen einen Blick in die Kategorie-Aufschlüsselung.",
    folgekennzahlen: ["Gewinn", "Cashflow"],
  },
  ausgaben: {
    definition: "Summe aller im Journal erfassten Ausgabebuchungen.",
    berechnung: "Σ Buchungen mit typ = Ausgabe",
    interpretation: "Steigen Ausgaben schneller als Einnahmen, sinkt die Gewinnmarge überproportional.",
    folgekennzahlen: ["Gewinn", "Liquiditätsgrad I"],
  },
  liquiditaetsgradI: {
    definition: "Barliquidität: Fähigkeit, kurzfristige Verbindlichkeiten aus liquiden Mitteln zu decken.",
    berechnung: "Liquiditätsgrad I = Liquide Mittel / Verbindlichkeiten",
    interpretation:
      "Werte um 100 % gelten klassisch als solide. Aktuell ohne Fristigkeiten-Trennung (kurz-/langfristig) berechnet — vereinfachte Näherung.",
    folgekennzahlen: ["Eigenkapitalquote", "Cashflow"],
  },
  eigenkapitalquote: {
    definition: "Anteil des Eigenkapitals an der Bilanzsumme.",
    berechnung: "Eigenkapitalquote = Eigenkapital / Bilanzsumme (Aktiva)",
    interpretation:
      "Höhere Werte deuten auf geringere Fremdfinanzierung und mehr finanziellen Puffer hin.",
    folgekennzahlen: ["Liquiditätsgrad I", "Bilanzsumme"],
  },
  bilanzsumme: {
    definition: "Summe aller Aktiva bzw. Passiva-Konten.",
    berechnung: "Bilanzsumme = Σ Kontosalden je Seite (müssen im Gleichgewicht sein)",
    interpretation:
      "Weichen Aktiva- und Passivsumme voneinander ab, ist die Bilanz nicht im Gleichgewicht — ein Hinweis auf fehlende oder falsche Buchungen.",
    folgekennzahlen: ["Eigenkapitalquote"],
  },
  belegungsquote: {
    definition: "Anteil der Wohnungen mit aktivem Mieter.",
    berechnung: "Belegungsquote = aktive Mieter / Wohnungen",
    interpretation: "Sinkende Belegung wirkt sich meist mit Verzögerung auf die Einnahmen aus.",
    folgekennzahlen: ["Einnahmen", "Business Health Score"],
  },
  offeneBefunde: {
    definition: "Offene Befunde aus dem letzten Plausibilitätsprüfungslauf.",
    berechnung: "Anzahl Befunde mit status = offen, aus dem jüngsten Prüflauf",
    interpretation: "Fehler sollten vor Fehlerbefunden vor Warnungen priorisiert bearbeitet werden.",
    folgekennzahlen: ["Business Health Score"],
  },
  umsatzrendite: {
    definition: "Klassische Profitabilitätskennzahl: welcher Anteil der Einnahmen bleibt als Gewinn.",
    berechnung: "Umsatzrendite = Gewinn / Einnahmen",
    interpretation:
      "Sinkt die Umsatzrendite bei gleichbleibenden Einnahmen, steigen die Ausgaben überproportional — ein Blick in die Ausgabenkategorien lohnt sich.",
    folgekennzahlen: ["Gewinn", "Cash Burn Reichweite"],
  },
  workingCapital: {
    definition: "Kurzfristig verfügbares Kapital zur Deckung des laufenden Geschäftsbetriebs.",
    berechnung: "Working Capital = Umlaufvermögen − Verbindlichkeiten (vereinfacht, ohne Fristigkeiten-Trennung)",
    interpretation:
      "Negatives Working Capital ist nicht zwingend kritisch, verdient aber Beobachtung, besonders in Kombination mit sinkendem Liquiditätsgrad I.",
    folgekennzahlen: ["Liquiditätsgrad I", "Eigenkapitalquote"],
  },
  automatisierungsgrad: {
    definition: "Anteil der Buchungen, die automatisch aus Rechnungen/Abrechnungen/Kontoauszügen erzeugt wurden statt manuell erfasst.",
    berechnung: "Automatisierungsgrad = Buchungen mit belegTyp ≠ Manuell / alle Buchungen",
    interpretation:
      "Steigt dieser Wert über Zeit, sinkt der manuelle Erfassungsaufwand — ein direkter Effizienzindikator für die App selbst.",
    folgekennzahlen: ["Business Health Score"],
  },
  cashBurnTageReichweite: {
    definition: "Geschätzte Reichweite der liquiden Mittel bei aktuellem Ausgabentempo.",
    berechnung: "Reichweite (Tage) = Liquide Mittel / durchschnittliche tägliche Ausgaben (letzte 30 Tage)",
    interpretation:
      "Ein sinkender Wert über mehrere Wochen ist ein Frühwarnsignal, unabhängig vom absoluten Kontostand.",
    folgekennzahlen: ["Liquiditätsgrad I", "Working Capital"],
  },
};

export default function KpiInfo({ kpiId, label }: { kpiId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const info = KPI_ERKLAERUNGEN[kpiId];
  if (!info) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Erklärung zu ${label || kpiId}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted-foreground hover:border-primary hover:text-primary"
      >
        i
      </button>
      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left text-xs shadow-lg"
          )}
        >
          <div className="mb-1.5 font-semibold">{label || kpiId}</div>
          <div className="mb-1.5">
            <span className="font-medium text-muted-foreground">Definition: </span>
            {info.definition}
          </div>
          <div className="mb-1.5">
            <span className="font-medium text-muted-foreground">Berechnung: </span>
            {info.berechnung}
          </div>
          <div className="mb-1.5">
            <span className="font-medium text-muted-foreground">Interpretation: </span>
            {info.interpretation}
          </div>
          {info.folgekennzahlen && info.folgekennzahlen.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Im Verhältnis zu: </span>
              {info.folgekennzahlen.join(", ")}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
