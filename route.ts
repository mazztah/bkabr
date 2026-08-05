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
  umsatz: {
    definition: "Klassische Bezeichnung für die Gesamteinnahmen im Betrachtungszeitraum.",
    berechnung: "Umsatz = Σ Einnahmen",
    interpretation: "Wachstum allein sagt wenig — erst im Verhältnis zur Umsatzrendite wird er aussagekräftig.",
    folgekennzahlen: ["Umsatzrendite", "Gewinn"],
  },
  ebit: {
    definition: "Ergebnis vor Zinsen und Steuern — operative Ertragskraft ohne Finanzierungs-/Steuereffekte.",
    berechnung: "EBIT = Gewinn + Zinsaufwand + Steueraufwand",
    interpretation: "Erlaubt den Vergleich der operativen Leistung unabhängig von Finanzierungsstruktur.",
    folgekennzahlen: ["EBITDA", "Umsatzrendite"],
  },
  ebitda: {
    definition: "Ergebnis vor Zinsen, Steuern und Abschreibungen.",
    berechnung: "EBITDA = EBIT + Abschreibungen",
    interpretation:
      "Steigt EBITDA und sinkt gleichzeitig der Cashflow, deutet das häufig auf wachsende Forderungsbestände oder Investitionen hin.",
    folgekennzahlen: ["EBIT", "Cashflow"],
  },
  liquiditaetsgradII: {
    definition: "Liquidität zweiten Grades: liquide Mittel plus kurzfristige Forderungen im Verhältnis zu Verbindlichkeiten.",
    berechnung: "Liquiditätsgrad II = (Liquide Mittel + Umlaufvermögen) / Verbindlichkeiten",
    interpretation: "Werte um 100–120 % gelten klassisch als solide.",
    folgekennzahlen: ["Liquiditätsgrad I", "Liquiditätsgrad III"],
  },
  liquiditaetsgradIII: {
    definition: "Liquidität dritten Grades: gesamtes Umlaufvermögen im Verhältnis zu Verbindlichkeiten.",
    berechnung: "Liquiditätsgrad III = Umlaufvermögen gesamt / Verbindlichkeiten",
    interpretation:
      "In diesem Geschäftsmodell ohne Warenlager/Vorräte rechnerisch identisch mit Liquiditätsgrad II — wird dennoch separat ausgewiesen, da klassisch erwartet.",
    folgekennzahlen: ["Liquiditätsgrad II"],
  },
  korrespondenzAutomatisierungsgrad: {
    definition: "Anteil der Schriftverkehr-Dokumente, die automatisch vom Agenten erzeugt wurden.",
    berechnung: "Korrespondenz-Automatisierungsgrad = Schriftverkehr mit quelle=agent / alle Schriftverkehr-Dokumente",
    interpretation: "Hoher Wert spart manuelle Formulierungsarbeit bei Mahnungen, Anschreiben etc.",
    folgekennzahlen: ["Automatisierungsgrad (gesamt)"],
  },
  gesamtAutomatisierungsgrad: {
    definition: "Übergreifender Automatisierungsgrad der Plattform.",
    berechnung: "Gleich gewichteter Schnitt aus Buchhaltungs- und Korrespondenz-Automatisierungsgrad",
    interpretation: "Wächst mit jeder neuen Automatisierung (z.B. automatische Rechnungsbuchung, Agent-Anschreiben).",
    folgekennzahlen: ["Business Health Score"],
  },
  kiKonfidenzScore: {
    definition: "Durchschnittliche Konfidenz der KI-Klassifikation über alle Ablage-Dokumente.",
    berechnung: "KI-Konfidenz-Score = Ø konfidenz-Wert (0–1) aller klassifizierten Dokumente",
    interpretation: "Sinkt der Wert, lohnt eine Stichprobenprüfung — evtl. neue Dokumenttypen, die das Modell nicht kennt.",
    folgekennzahlen: ["Data Quality Score"],
  },
  processingSpeedStunden: {
    definition: "Durchschnittliche Zeit von Dokument-Upload bis erfolgreicher Zuordnung.",
    berechnung: "Ø Stunden zwischen hochgeladenAm und updatedAt, für Dokumente mit status=zugeordnet",
    interpretation: "Niedriger ist besser. Steigende Werte deuten auf einen Rückstau in der Dokumentenverarbeitung hin.",
    folgekennzahlen: ["Automatisierungsgrad (gesamt)"],
  },
  dataQualityScore: {
    definition: "Datenqualität der Stammdaten, gemessen an offenen Prüfbefunden im Verhältnis zur Datenmenge.",
    berechnung:
      "100 − gewichtete Fehlerdichte (Fehler ×10, Warnungen ×4, Hinweise ×1) / Anzahl Stammdaten-Datensätze × 100",
    interpretation: "Niedrige Werte bei wenigen Datensätzen sind normal — die Kennzahl wird mit wachsender Datenbasis stabiler.",
    folgekennzahlen: ["Business Health Score", "Risk Exposure Index"],
  },
  riskExposureIndex: {
    definition: "Zusammengesetztes Risikomaß aus offenen Prüfbefunden und Liquiditätslage.",
    berechnung: "0–100, höher = riskanter: Fehler ×15 + Warnungen ×5 + Liquiditätsdefizit-Anteil ×30",
    interpretation: "Anders als der Business Health Score fokussiert dieser Index bewusst nur auf Risiko, nicht auf Gesamtleistung.",
    folgekennzahlen: ["Data Quality Score", "Liquiditätsgrad I"],
  },

  // -- Geplante Kennzahlen ohne Datenquelle (noch nicht live) --
  aiProductivityScore: {
    definition: "Verhältnis von durch KI erledigten Aufgaben zu deren Token-/Kostenaufwand.",
    berechnung: "Noch nicht implementiert — das AI Cost Observatory liefert bereits die Kostenseite; es fehlt noch die Verknüpfung mit einer Erfolgs-/Qualitätsmessung je Aufruf.",
    interpretation: "Wird verfügbar, sobald Modellaufrufe mit Kosten UND Ergebnisqualität verknüpft sind.",
  },
  forecastAccuracy: {
    definition: "Wie genau frühere Prognosen (z.B. Liquiditätsverlauf) tatsächlich eingetroffen sind.",
    berechnung: "Noch nicht implementiert — benötigt ein Forecast-Modul mit historischen Prognosen zum Abgleich.",
    interpretation: "Erst mit mehreren Prognosezyklen aussagekräftig.",
  },
  costPredictionAccuracy: {
    definition: "Treffgenauigkeit geschätzter KI-Kosten gegenüber tatsächlich abgerechneten Kosten.",
    berechnung: "Noch nicht implementiert — das AI Cost Observatory trackt bereits Tokens/Kosten live; es fehlt der Abgleich mit einer vorherigen Schätzung über mehrere Abrechnungszyklen.",
    interpretation: "Hilft, Kostenschätzungen für neue Modell-Integrationen realistischer zu machen.",
  },
  employeeTimeSaved: {
    definition: "Geschätzte eingesparte Bearbeitungszeit durch Automatisierung.",
    berechnung: "Noch nicht implementiert — benötigt eine Referenzzeit pro manuellem Vorgang (Zeiterfassung).",
    interpretation: "Aktuell nicht eingeplant, da keine Zeiterfassungsdaten vorliegen.",
  },
  tenantSatisfactionIndex: {
    definition: "Zufriedenheit der Mieter, z.B. aus Rückmeldungen oder Reaktionszeiten.",
    berechnung: "Noch nicht implementiert — benötigt eine Mieterbefragung oder Ticket-/Beschwerde-Tracking.",
    interpretation: "Aktuell nicht eingeplant, da keine entsprechende Datenquelle existiert.",
  },
  maintenancePredictionScore: {
    definition: "Vorhersage anstehender Instandhaltungskosten je Objekt.",
    berechnung: "Noch nicht implementiert — Teil der geplanten Predictive Intelligence (Durchgang 7).",
    interpretation: "Wird auf Basis historischer Instandhaltungsbuchungen je Liegenschaft berechnet werden.",
  },
  aiRecommendationAcceptanceRate: {
    definition: "Anteil der vom LLM-Agenten vorgeschlagenen Maßnahmen, die der Nutzer übernommen hat.",
    berechnung: "Noch nicht implementiert — die Agent-Hinweise existieren bereits (siehe LLM Dashboard Agent), aber es wird noch nicht erfasst, ob der Nutzer ihnen folgt.",
    interpretation: "Ein Frühindikator dafür, wie vertrauenswürdig die Agenten-Empfehlungen tatsächlich sind.",
  },
};

export type KpiKategorie = "klassisch" | "modern";

export interface KpiKatalogEintrag {
  id: string;
  label: string;
  kategorie: KpiKategorie;
  /** null = bereits live mit echten Daten berechnet */
  geplantAb?: string;
}

/**
 * Vollständiger Katalog aller 25 anvisierten Kennzahlen (10 klassisch + 15
 * modern) aus dem ursprünglichen Konzept. "geplantAb" markiert Kennzahlen,
 * für die noch keine Datenquelle existiert (z.B. LLM-Tokentracking,
 * Mieterbefragung, Wartungs-ML) — bewusst transparent statt mit
 * Platzhalterwerten gefüllt.
 */
export const KPI_KATALOG: KpiKatalogEintrag[] = [
  // -- 10 klassische Kennzahlen --
  { id: "umsatz", label: "Umsatz", kategorie: "klassisch" },
  { id: "gewinn", label: "Gewinn", kategorie: "klassisch" },
  { id: "ebitda", label: "EBITDA", kategorie: "klassisch" },
  { id: "ebit", label: "EBIT", kategorie: "klassisch" },
  { id: "liquiditaetsgradI", label: "Liquiditätsgrad I", kategorie: "klassisch" },
  { id: "liquiditaetsgradII", label: "Liquiditätsgrad II", kategorie: "klassisch" },
  { id: "liquiditaetsgradIII", label: "Liquiditätsgrad III", kategorie: "klassisch" },
  { id: "eigenkapitalquote", label: "Eigenkapitalquote", kategorie: "klassisch" },
  { id: "gewinn", label: "Cashflow", kategorie: "klassisch" },
  { id: "workingCapital", label: "Working Capital", kategorie: "klassisch" },
  // -- 15 moderne Kennzahlen --
  { id: "businessHealthScore", label: "Business Health Score", kategorie: "modern" },
  { id: "aiProductivityScore", label: "AI Productivity Score", kategorie: "modern", geplantAb: "benötigt Verknüpfung von AI Cost Observatory mit Ergebnisqualität (noch nicht eingeplant)" },
  { id: "korrespondenzAutomatisierungsgrad", label: "Document Automation Rate", kategorie: "modern" },
  { id: "kiKonfidenzScore", label: "KI Confidence Score", kategorie: "modern" },
  { id: "forecastAccuracy", label: "Forecast Accuracy", kategorie: "modern", geplantAb: "Durchgang 7 (Predictive Intelligence)" },
  { id: "costPredictionAccuracy", label: "Cost Prediction Accuracy", kategorie: "modern", geplantAb: "benötigt mehrere Abrechnungszyklen im AI Cost Observatory zum Abgleich (noch nicht eingeplant)" },
  { id: "gesamtAutomatisierungsgrad", label: "Automation Rate", kategorie: "modern" },
  { id: "employeeTimeSaved", label: "Employee Time Saved", kategorie: "modern", geplantAb: "benötigt Zeiterfassung (noch nicht eingeplant)" },
  { id: "processingSpeedStunden", label: "Processing Speed Index", kategorie: "modern" },
  { id: "tenantSatisfactionIndex", label: "Tenant Satisfaction Index", kategorie: "modern", geplantAb: "benötigt Mieterbefragung (noch nicht eingeplant)" },
  { id: "riskExposureIndex", label: "Risk Exposure Index", kategorie: "modern" },
  { id: "maintenancePredictionScore", label: "Maintenance Prediction Score", kategorie: "modern", geplantAb: "Durchgang 7 (Predictive Intelligence)" },
  { id: "cashBurnTageReichweite", label: "Cash Burn Velocity", kategorie: "modern" },
  { id: "dataQualityScore", label: "Data Quality Score", kategorie: "modern" },
  { id: "aiRecommendationAcceptanceRate", label: "AI Recommendation Acceptance Rate", kategorie: "modern", geplantAb: "benötigt Annehmen/Ablehnen-Tracking für Agent-Hinweise (noch nicht eingeplant)" },
];

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
