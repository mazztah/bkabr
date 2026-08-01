import { Mieter, Wohnung, Gebaeude, Liegenschaft } from "./types";
import { mietRueckstand } from "./mietkonto";

export interface SchriftverkehrField {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "textarea";
  default?: (ctx: BriefKontext) => string;
}

export interface SchriftverkehrTemplate {
  id: string;
  label: string;
  icon: string;
  betreff: (ctx: BriefKontext) => string;
  fields: SchriftverkehrField[];
  body: (ctx: BriefKontext) => string;
}

export interface BriefKontext {
  mieter: Mieter;
  wohnung?: Wohnung;
  gebaeude?: Gebaeude;
  liegenschaft?: Liegenschaft;
  werte: Record<string, string>;
  heute: string;
}

function heuteDe(): string {
  return new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function plusTage(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function objektadresse(ctx: BriefKontext): string {
  const lg = ctx.liegenschaft;
  if (!lg) return "[Objektadresse]";
  return `${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}`;
}

export function gesamtmiete(m: Mieter): number {
  return (m.kaltmiete || 0) + (m.nebenkostenVorauszahlung || 0);
}

function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
}

function header(ctx: BriefKontext): string {
  return `BetriebsKostenBot AI
ProManage Immobilienverwaltung GmbH
Am Friedrichswall 10 · 30159 Hannover
Tel. 0511 / 123 456-0 · info@betriebskostenbot-dummy.de

${ctx.mieter.name}
${objektadresse(ctx)}

Hannover, ${ctx.heute}
`;
}

function footer(): string {
  return `

Mit freundlichen Grüßen

_______________________________
BetriebsKostenBot AI · ProManage Immobilienverwaltung GmbH
i. A. der Eigentümergemeinschaft / des Vermieters`;
}

export const SCHRIFTVERKEHR_TEMPLATES: SchriftverkehrTemplate[] = [
  {
    id: "kuendigung",
    label: "Kündigung Mietverhältnis",
    icon: "📄",
    betreff: (ctx) => `Kündigung des Mietverhältnisses – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [{ key: "kuendigungstermin", label: "Kündigungstermin", type: "date", default: () => plusTage(90) }],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

hiermit kündigen wir das mit Ihnen bestehende Mietverhältnis über die Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} ordentlich und fristgerecht zum ${ctx.werte.kuendigungstermin}.

Die Kündigungsfrist beträgt gemäß § 573c BGB drei Monate zum Monatsende. Das Mietverhältnis endet somit mit Ablauf des ${ctx.werte.kuendigungstermin}.

Wir bitten Sie, die Wohnung bis zum Beendigungszeitpunkt geräumt und in vertragsgemäßem Zustand zurückzugeben. Einen Termin zur Wohnungsabnahme werden wir gesondert mit Ihnen vereinbaren.

Bitte teilen Sie uns mit, an welche Adresse wir die Kaution bzw. die Nebenkostenabrechnung nach Ihrem Auszug übersenden sollen.

Für Rückfragen stehen wir Ihnen gerne zur Verfügung.`,
  },
  {
    id: "mietvertrag_uebersendung",
    label: "Übersendung Mietvertrag",
    icon: "📃",
    betreff: (ctx) => `Übersendung des Mietvertrags – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "rueckgabeFrist", label: "Rückgabe unterschrieben bis", type: "date", default: () => plusTage(14) },
      { key: "mietbeginn", label: "Mietbeginn", type: "date", default: (ctx) => ctx.mieter.mietbeginn || "" },
      { key: "kaution", label: "Kaution (EUR)", type: "number", default: (ctx) => String((ctx.mieter.kaltmiete || 0) * 3) },
      { key: "iban", label: "IBAN", type: "text" },
      { key: "bic", label: "BIC", type: "text" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

anbei übersenden wir Ihnen den unterzeichneten Mietvertrag über die Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} in zweifacher Ausfertigung.

Bitte senden Sie uns ein von Ihnen unterschriebenes Exemplar bis zum ${ctx.werte.rueckgabeFrist} an die oben genannte Adresse zurück. Das zweite Exemplar verbleibt bei Ihnen.

Der Mietbeginn ist der ${ctx.werte.mietbeginn}. Die monatliche Gesamtmiete (Kaltmiete zzgl. Betriebskosten- und Heizkostenvorauszahlung) beträgt ${eur(gesamtmiete(ctx.mieter))} und ist jeweils zum 3. Werktag eines Monats im Voraus zu zahlen.

Die Mietkaution in Höhe von ${eur(Number(ctx.werte.kaution) || 0)} ist vor Übergabe der Wohnung auf folgendes Konto zu überweisen:
IBAN: ${ctx.werte.iban || "[IBAN]"}
BIC: ${ctx.werte.bic || "[BIC]"}
Verwendungszweck: Kaution ${objektadresse(ctx)} ${ctx.mieter.name}

Den Übergabetermin stimmen wir gesondert mit Ihnen ab.

Wir freuen uns auf die Zusammenarbeit und stehen für Fragen gerne zur Verfügung.`,
  },
  {
    id: "uebergabetermin",
    label: "Einladung Übergabetermin (Einzug)",
    icon: "🔑",
    betreff: (ctx) => `Vereinbarung Übergabetermin – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "terminDatum", label: "Termin-Datum", type: "date" },
      { key: "terminUhrzeit", label: "Uhrzeit", type: "text", default: () => "10:00" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

gerne möchten wir mit Ihnen den Termin zur Übergabe der Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} vereinbaren.

Wir schlagen folgenden Termin vor:
Datum: ${ctx.werte.terminDatum}
Uhrzeit: ${ctx.werte.terminUhrzeit} Uhr
Treffpunkt: vor dem Hauseingang / in der Wohnung

Bitte bringen Sie zum Termin mit:
• einen gültigen Personalausweis oder Reisepass
• den unterschriebenen Mietvertrag (falls noch nicht geschehen)
• den Nachweis über die geleistete Mietkaution

Bei der Übergabe wird ein Übergabeprotokoll erstellt, in dem der Zustand der Wohnung, Zählerstände (Strom, Wasser, Heizung/Gas) sowie übergebene Schlüssel dokumentiert werden.

Sollten Sie den vorgeschlagenen Termin nicht wahrnehmen können, teilen Sie uns bitte umgehend alternative Terminvorschläge mit.

Wir freuen uns auf Ihren Einzug.`,
  },
  {
    id: "abnahmetermin",
    label: "Einladung Abnahmetermin (Auszug)",
    icon: "📦",
    betreff: (ctx) => `Vereinbarung Wohnungsabnahme – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "mietende", label: "Mietende", type: "date", default: (ctx) => ctx.mieter.mietende || "" },
      { key: "terminDatum", label: "Termin-Datum", type: "date" },
      { key: "terminUhrzeit", label: "Uhrzeit", type: "text", default: () => "10:00" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

anlässlich der Beendigung Ihres Mietverhältnisses über die Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} zum ${ctx.werte.mietende} laden wir Sie zur förmlichen Wohnungsabnahme ein.

Wir schlagen folgenden Termin vor:
Datum: ${ctx.werte.terminDatum}
Uhrzeit: ${ctx.werte.terminUhrzeit} Uhr

Bitte stellen Sie sicher, dass die Wohnung zu diesem Zeitpunkt vollständig geräumt, besenrein und in vertragsgemäßem Zustand ist. Alle übergebenen Schlüssel sind zurückzugeben.

Im Rahmen der Abnahme werden u. a. erfasst:
• Zustand von Böden, Wänden, Fenstern, Sanitär und Einbauten
• Zählerstände
• Vollständigkeit der Schlüssel

Das Abnahmeprotokoll wird von beiden Seiten unterzeichnet. Etwaige Mängel oder Schäden, die über die normale Abnutzung hinausgehen, werden dokumentiert und können zu Forderungen führen.

Bitte bestätigen Sie den Termin oder schlagen Sie zeitnah eine Alternative vor.`,
  },
  {
    id: "mietkaution",
    label: "Aufforderung / Hinweise Mietkaution",
    icon: "💰",
    betreff: (ctx) => `Mietkaution – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "kaution", label: "Kaution (EUR)", type: "number", default: (ctx) => String((ctx.mieter.kaltmiete || 0) * 3) },
      { key: "frist", label: "Frist", type: "date", default: () => plusTage(14) },
      { key: "iban", label: "IBAN", type: "text" },
      { key: "bic", label: "BIC", type: "text" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

gemäß Mietvertrag ist für die Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} eine Mietkaution in Höhe von ${eur(Number(ctx.werte.kaution) || 0)} (drei Monatskaltmieten) zu leisten.

Wir bitten Sie, den Betrag bis spätestens ${ctx.werte.frist} auf folgendes Konto zu überweisen:

Kontoinhaber: Vermieter / Treuhand
IBAN: ${ctx.werte.iban || "[IBAN]"}
BIC: ${ctx.werte.bic || "[BIC]"}
Verwendungszweck: Kaution ${objektadresse(ctx)} ${ctx.mieter.name}

Die Kaution wird getrennt vom Vermögen des Vermieters angelegt und verzinst. Eine Rückzahlung erfolgt nach Beendigung des Mietverhältnisses und ordnungsgemäßer Rückgabe der Wohnung, abzüglich etwaiger berechtigter Forderungen (z. B. offene Mieten, Schadensersatz, Nachzahlungen aus der Nebenkostenabrechnung).

Die gesetzliche Frist zur Abrechnung und Rückzahlung der Kaution beträgt in der Regel bis zu sechs Monate nach Mietende; offene Nebenkostenabrechnungen können eine Zurückbehaltung eines angemessenen Teils rechtfertigen.

Bitte senden Sie uns den Überweisungsbeleg zur Dokumentation zu.`,
  },
  {
    id: "hausordnung",
    label: "Abmahnung Störung der Hausordnung",
    icon: "⚠️",
    betreff: (ctx) => `Abmahnung wegen Verstoßes gegen die Hausordnung – ${objektadresse(ctx)}`,
    fields: [
      {
        key: "sachverhalt",
        label: "Sachverhalt",
        type: "textarea",
        default: () => "z. B. übermäßige Lärmbelästigung in den Abend-/Nachtstunden",
      },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

leider müssen wir Sie auf wiederholte / folgende Verstöße gegen die Hausordnung bzw. den Mietvertrag hinweisen:

Sachverhalt:
${ctx.werte.sachverhalt}

Die Hausordnung ist Bestandteil Ihres Mietvertrags. Durch das beschriebene Verhalten werden die Rechte der Mitmieter und/oder des Vermieters beeinträchtigt.

Wir fordern Sie hiermit auf, das beanstandete Verhalten sofort und dauerhaft zu unterlassen. Bei weiteren Verstößen behalten wir uns vor, weitere Maßnahmen zu ergreifen – bis hin zur außerordentlichen Kündigung des Mietverhältnisses gemäß § 543 BGB.

Diese Abmahnung wird zu Ihren Mietvertragsunterlagen genommen.

Wir gehen davon aus, dass eine erneute Ansprache nicht erforderlich sein wird, und danken für Ihr Verständnis.`,
  },
  {
    id: "mieterhoehung",
    label: "Mieterhöhung (§ 558 BGB)",
    icon: "📈",
    betreff: (ctx) => `Mieterhöhung gemäß § 558 BGB – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "neueMiete", label: "Neue Nettokaltmiete (EUR)", type: "number" },
      { key: "wirksamAb", label: "Wirksam ab", type: "date" },
      { key: "frist", label: "Zustimmungsfrist", type: "date", default: () => plusTage(90) },
    ],
    body: (ctx) => {
      const alt = ctx.mieter.kaltmiete || 0;
      const neu = Number(ctx.werte.neueMiete) || 0;
      const diff = neu - alt;
      const prozent = alt ? ((diff / alt) * 100).toFixed(1) : "0";
      return `sehr geehrte/r ${ctx.mieter.name},

hiermit verlangen wir Ihre Zustimmung zu einer Erhöhung der Nettokaltmiete für die Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""} gemäß § 558 BGB.

Bisherige Nettokaltmiete: ${eur(alt)}
Neue Nettokaltmiete ab ${ctx.werte.wirksamAb}: ${eur(neu)}
Erhöhung um: ${eur(diff)} (${prozent} %)

Die Miete liegt damit weiterhin im Rahmen der ortsüblichen Vergleichsmiete.

Die Kappungsgrenze (§ 558 Abs. 3 BGB) wird eingehalten: Innerhalb von drei Jahren steigt die Miete um nicht mehr als 20 % (bzw. 15 % in Gebieten mit abgesenkter Kappungsgrenze).

Wir bitten Sie, der Mieterhöhung bis spätestens ${ctx.werte.frist} schriftlich zuzustimmen. Ohne Zustimmung sind wir berechtigt, auf Erteilung der Zustimmung zu klagen (§ 558b BGB).

Die Betriebskosten- und Heizkostenvorauszahlungen bleiben unverändert, sofern nicht gesondert angepasst.`;
    },
  },
  {
    id: "mahnung",
    label: "Mahnung Mietrückstand",
    icon: "📮",
    betreff: (ctx) => `Mahnung – offene Mietforderungen – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      {
        key: "offenerBetrag",
        label: "Offener Betrag (EUR)",
        type: "number",
        default: (ctx) => String(Math.max(0, mietRueckstand(ctx.mieter))),
      },
      { key: "frist", label: "Zahlungsfrist", type: "date", default: () => plusTage(10) },
      { key: "iban", label: "IBAN", type: "text" },
      { key: "bic", label: "BIC", type: "text" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

trotz Fälligkeit und bisheriger Erinnerung ist folgende Forderung noch nicht vollständig bei uns eingegangen:

Offener Betrag: ${eur(Number(ctx.werte.offenerBetrag) || 0)}
Fällig seit: sofort

Wir fordern Sie auf, den Gesamtbetrag von ${eur(Number(ctx.werte.offenerBetrag) || 0)} innerhalb von 10 Tagen nach Zugang dieses Schreibens (spätestens ${ctx.werte.frist}) auf das bekannte Mietkonto zu überweisen:

IBAN: ${ctx.werte.iban || "[IBAN]"}
BIC: ${ctx.werte.bic || "[BIC]"}
Verwendungszweck: Miete ${objektadresse(ctx)} ${ctx.mieter.name}

Sollten Sie den Betrag bereits überwiesen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos und senden Sie uns den Zahlungsbeleg zur Abstimmung zu.

Bei weiterhin ausbleibender Zahlung behalten wir uns vor, ohne weitere Ankündigung das gerichtliche Mahnverfahren einzuleiten bzw. das Mietverhältnis außerordentlich zu kündigen, sofern die Voraussetzungen des § 543 Abs. 2 Nr. 3 BGB vorliegen (Rückstand von mehr als einer Monatsmiete an zwei aufeinander folgenden Terminen oder Rückstand in Höhe von zwei Monatsmieten).

Bitte setzen Sie sich bei Zahlungsschwierigkeiten umgehend mit uns in Verbindung, damit eine einvernehmliche Lösung gefunden werden kann.`,
  },
  {
    id: "modernisierung",
    label: "Ankündigung Modernisierung/Baumaßnahmen",
    icon: "🏗️",
    betreff: (ctx) => `Ankündigung von Modernisierungsmaßnahmen – ${objektadresse(ctx)}`,
    fields: [
      { key: "massnahme", label: "Art der Maßnahme", type: "text" },
      { key: "beginn", label: "Voraussichtlicher Beginn", type: "date" },
      { key: "dauer", label: "Voraussichtliche Dauer", type: "text", default: () => "ca. 2 Wochen" },
      { key: "bereiche", label: "Betroffene Bereiche", type: "textarea" },
    ],
    body: (ctx) => `sehr geehrte/r ${ctx.mieter.name},

hiermit kündigen wir gemäß § 555c BGB folgende Modernisierungs- bzw. Instandsetzungsmaßnahmen in dem Anwesen ${objektadresse(ctx)} an:

Art der Maßnahme: ${ctx.werte.massnahme}
Voraussichtlicher Beginn: ${ctx.werte.beginn}
Voraussichtliche Dauer: ${ctx.werte.dauer}
Betroffene Bereiche: ${ctx.werte.bereiche}

Die Maßnahmen dienen der Energieeinsparung / der Verbesserung der Wohnverhältnisse / der nachhaltigen Erhaltung des Gebäudes.

Während der Bauzeit kann es zu Lärm, Schmutz und vorübergehenden Einschränkungen kommen. Wir bemühen uns, die Beeinträchtigungen so gering wie möglich zu halten und werden Sie über den genauen Ablauf rechtzeitig informieren.

Nach Abschluss der Maßnahmen behalten wir uns vor, eine Mieterhöhung nach § 559 BGB (Modernisierungsumlage, max. 8 % der Kosten jährlich) geltend zu machen. Hierüber erhalten Sie ein gesondertes Schreiben mit der Berechnung.

Für Rückfragen und Abstimmung von Terminwünschen (z. B. Zugang zur Wohnung) stehen wir Ihnen gerne zur Verfügung.`,
  },
  {
    id: "bk_abrechnung",
    label: "Übersendung Betriebskostenabrechnung",
    icon: "🧾",
    betreff: (ctx) => `Betriebskostenabrechnung ${ctx.werte.jahr} – ${objektadresse(ctx)}, Wohnung ${ctx.wohnung?.bezeichnung || ""}`,
    fields: [
      { key: "jahr", label: "Abrechnungsjahr", type: "text", default: () => String(new Date().getFullYear() - 1) },
      { key: "vorauszahlungen", label: "Vorauszahlungen gesamt (EUR)", type: "number" },
      { key: "kosten", label: "Auf Sie entfallende Kosten (EUR)", type: "number" },
      { key: "frist", label: "Zahlungsfrist bei Nachzahlung", type: "date", default: () => plusTage(30) },
    ],
    body: (ctx) => {
      const vz = Number(ctx.werte.vorauszahlungen) || 0;
      const kosten = Number(ctx.werte.kosten) || 0;
      const saldo = kosten - vz;
      return `sehr geehrte/r ${ctx.mieter.name},

anbei erhalten Sie die Betriebskostenabrechnung für das Kalenderjahr ${ctx.werte.jahr} für Ihre Wohnung ${objektadresse(ctx)}, ${ctx.wohnung?.bezeichnung || ""}.

Ergebnis der Abrechnung:
Ihre Vorauszahlungen gesamt: ${eur(vz)}
Auf Sie entfallende Kosten gesamt: ${eur(kosten)}
${saldo >= 0 ? "Nachzahlung" : "Guthaben"}: ${eur(Math.abs(saldo))}

${
  saldo >= 0
    ? `Bei einer Nachzahlung bitten wir um Überweisung des Betrags bis zum ${ctx.werte.frist} auf das bekannte Mietkonto unter Angabe des Verwendungszwecks „NK-Abrechnung ${ctx.werte.jahr} ${ctx.mieter.name}".`
    : "Das Guthaben wird innerhalb der nächsten Werktage auf das uns bekannte Konto erstattet bzw. mit der nächsten Miete verrechnet (bitte teilen Sie uns Ihre Wunschweise mit)."
}

Die Abrechnung wurde mit Unterstützung von BetriebsKostenBot AI erstellt und berücksichtigt den vereinbarten Umlageschlüssel.

Einwendungen gegen die Abrechnung sind innerhalb von 12 Monaten nach Zugang schriftlich geltend zu machen (§ 556 Abs. 3 BGB).`;
    },
  },
];

export function renderBrief(template: SchriftverkehrTemplate, ctx: BriefKontext): string {
  return `${header(ctx)}
Betreff: ${template.betreff(ctx)}

${template.body(ctx)}${footer()}`;
}

export function initialWerte(template: SchriftverkehrTemplate, ctx: Omit<BriefKontext, "werte">): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const f of template.fields) {
    werte[f.key] = f.default ? f.default({ ...ctx, werte: {} }) : "";
  }
  return werte;
}

export { heuteDe };
