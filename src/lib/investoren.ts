import { Investor, InvestorKriteriumErgebnis } from "./types";

// -------- Die 10 Aufnahme-Kriterien --------
// Jeder per Websuche gefundene Investoren-Kandidat wird gegen diese 10
// Kriterien geprüft (siehe evaluateInvestorKriterien in ai.ts). "hart"
// markierte Kriterien sind Ausschlusskriterien: fehlen sie, wird der
// Kandidat unabhängig vom Gesamt-Score verworfen (harteAusschlussVerletzt()).
export interface InvestorKriterium {
  id: string;
  label: string;
  beschreibung: string;
  hart: boolean;
}

export const INVESTOR_KRITERIEN: InvestorKriterium[] = [
  {
    id: "aktive_investitionstaetigkeit",
    label: "Aktive Investitionstätigkeit",
    beschreibung:
      "Nachweisbare Investitionstätigkeit im relevanten Sektor (Startup/PE/IT/KI/Real Estate/PM/FM/Asset-Management) der letzten 24 Monate.",
    hart: false,
  },
  {
    id: "quelle_verifizierbar",
    label: "Verifizierbare Quelle",
    beschreibung:
      "Kontakt stammt aus einer nachvollziehbaren Quelle (Firmenwebsite, Handelsregister, Presseartikel) – keine anonyme/ungeprüfte Quelle.",
    hart: true,
  },
  {
    id: "ticketgroesse_passend",
    label: "Passende Ticketgröße",
    beschreibung: "Investitionsvolumen/Ticketgröße passt plausibel zum Zielsegment.",
    hart: false,
  },
  {
    id: "aktiver_status",
    label: "Aktiver Status",
    beschreibung: "Kein erkennbar inaktiver/geschlossener Fonds oder eingestellte Investitionstätigkeit.",
    hart: false,
  },
  {
    id: "regionaler_fokus",
    label: "Regionaler Fokus passt",
    beschreibung: "Geografischer Investitionsfokus deckt eine für uns relevante Region ab.",
    hart: false,
  },
  {
    id: "kontaktweg_oeffentlich",
    label: "Öffentlicher Kontaktweg",
    beschreibung:
      "Öffentlich erreichbarer Kontaktweg vorhanden (Website, geschäftliche E-Mail, LinkedIn-Profil-Link) – kein reines Gerücht.",
    hart: true,
  },
  {
    id: "track_record",
    label: "Nachvollziehbarer Track Record",
    beschreibung: "Mindestens ein dokumentiertes Investment/Portfolio-Beispiel auffindbar.",
    hart: false,
  },
  {
    id: "kein_reputationskonflikt",
    label: "Kein Reputationskonflikt",
    beschreibung: "Keine bekannten Sanktionslisten-Treffer oder laufenden gravierenden Rechtsstreitigkeiten.",
    hart: true,
  },
  {
    id: "philosophie_passung",
    label: "Passung zur Philosophie",
    beschreibung: "Grundsätzliche Passung zu einer seriösen, langfristig orientierten Zusammenarbeit (keine Red Flags).",
    hart: false,
  },
  {
    id: "erreichbarkeit_sprache",
    label: "Sprachliche Erreichbarkeit",
    beschreibung: "Ansprache in Deutsch oder Englisch realistisch möglich.",
    hart: false,
  },
];

export const INVESTOR_KRITERIEN_IDS = INVESTOR_KRITERIEN.map((k) => k.id);

/** true, wenn mindestens ein hartes (Ausschluss-)Kriterium NICHT erfüllt ist. */
export function harteAusschlussVerletzt(ergebnisse: InvestorKriteriumErgebnis[]): boolean {
  const harteIds = new Set(INVESTOR_KRITERIEN.filter((k) => k.hart).map((k) => k.id));
  return ergebnisse.some((e) => harteIds.has(e.kriteriumId) && !e.erfuellt);
}

/** Score 0-10 aus der Anzahl erfüllter Kriterien (unabhängig von hart/weich). */
export function berechneInvestorScore(ergebnisse: InvestorKriteriumErgebnis[]): number {
  if (ergebnisse.length === 0) return 0;
  const erfuellt = ergebnisse.filter((e) => e.erfuellt).length;
  return Math.round((erfuellt / INVESTOR_KRITERIEN.length) * 10 * 10) / 10;
}

/** Ab diesem Score (und ohne verletzte harte Kriterien) gilt ein Kandidat als aufnahmewürdig. */
export const INVESTOR_SCORE_SCHWELLE = 7;

export function empfehlungAusScore(
  ergebnisse: InvestorKriteriumErgebnis[]
): { score: number; empfehlung: "aufnehmen" | "ablehnen" } {
  const score = berechneInvestorScore(ergebnisse);
  const empfehlung =
    !harteAusschlussVerletzt(ergebnisse) && score >= INVESTOR_SCORE_SCHWELLE ? "aufnehmen" : "ablehnen";
  return { score, empfehlung };
}

// -------- Vorschlagslisten fürs UI (freie Texteingabe bleibt möglich) --------

export const INVESTOR_SEKTOR_VORSCHLAEGE = [
  "Startup / VC",
  "Private Equity",
  "IT / Software",
  "KI / AI",
  "Real Estate",
  "Property Management",
  "Facility Management",
  "Asset Management",
];

export const INVESTOR_HUB_VORSCHLAEGE = [
  "Silicon Valley",
  "New York",
  "Berlin",
  "München",
  "Frankfurt",
  "London",
  "Zürich",
  "Tel Aviv",
  "Singapur",
  "Shanghai / Shenzhen",
  "Bangalore / Mumbai",
  "Moskau",
  "Dubai",
];

export const INVESTOR_LAND_VORSCHLAEGE = [
  "Deutschland",
  "USA",
  "Russland",
  "China",
  "Indien",
  "Großbritannien",
  "Schweiz",
  "Israel",
  "Singapur",
  "Vereinigte Arabische Emirate",
];

// -------- Brief-Zusammenbau (Corporate-Design-Briefkopf, analog schriftverkehr.ts) --------
// generateInvestorAnschreiben() (ai.ts) liefert nur den Fließtext ab der Anrede.
// Diese Funktion fügt Absender-/Empfängerblock, Datum, Betreffzeile und
// Grußformel hinzu – exakt dieselbe Struktur, die buildSchriftverkehrPdf beim
// "Fertigstellen" mit dem grafischen Briefkopf (Logo) versieht.

function heuteDe(): string {
  return new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function buildInvestorBriefText(investor: Pick<Investor, "firma" | "ansprechpartnerName" | "land">, betreff: string, body: string): string {
  const empfaenger = [investor.firma, investor.ansprechpartnerName ? `z. Hd. ${investor.ansprechpartnerName}` : null, investor.land]
    .filter(Boolean)
    .join("\n");

  return `BetriebsKostenBot AI
ProManage Immobilienverwaltung GmbH
Am Friedrichswall 10 · 30159 Hannover
Tel. 0511 / 123 456-0 · info@betriebskostenbot-dummy.de

${empfaenger}

Hannover, ${heuteDe()}

Betreff: ${betreff}

${body}


Mit freundlichen Grüßen

_______________________________
BetriebsKostenBot AI`;
}
