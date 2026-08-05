import { promises as fs } from "fs";
import path from "path";
import {
  AblageDokument,
  Abrechnung,
  Abrechnungskreis,
  AbrechnungskreisSplitErgebnis,
  AbgeleitetesKalenderEreignis,
  AgentSchedule,
  AgentScheduleLauf,
  AiCallLogEintrag,
  AiObservatoryUebersicht,
  AiProvider,
  AiProviderKatalogEintrag,
  Buchung,
  BuchhaltungsUebersicht,
  BuchungsAufteilungsPosition,
  BuchungsTyp,
  KalenderEreignis,
  TeamNachricht,
  AgentHinweis,
  DashboardAktivitaetVerlaufPunkt,
  DashboardBuchungsVerlaufPunkt,
  DashboardPruefVerlaufPunkt,
  DashboardUebersicht,
  DashboardVerlauf,
  Eigentuemer,
  Gebaeude,
  Konto,
  Kontoauszug,
  Liegenschaft,
  Mieter,
  Mietvertrag,
  PmVertrag,
  PruefLauf,
  SchriftverkehrDokument,
  SystemLogEintrag,
  SystemLogTyp,
  Wohnung,
} from "./types";
import { uid } from "./utils";

// DATA_DIR kann per ENV überschrieben werden (z.B. für ein Fly.io Volume unter /data)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DbShape {
  abrechnungen: Abrechnung[];
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
  mietvertraege: Mietvertrag[];
  eigentuemer: Eigentuemer[];
  pmVertraege: PmVertrag[];
  schriftverkehr: SchriftverkehrDokument[];
  kontoauszuege: Kontoauszug[];
  ablage: AblageDokument[];
  systemLog: SystemLogEintrag[];
  pruefLaeufe: PruefLauf[];
  agentSchedules: AgentSchedule[];
  buchungen: Buchung[];
  konten: Konto[];
  abrechnungskreise: Abrechnungskreis[];
  aiUsageLog: AiCallLogEintrag[];
  kalenderEreignisse: KalenderEreignis[];
  teamNachrichten: TeamNachricht[];
  counters: Record<string, number>;
}

let cache: DbShape | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function withDefaults(db: Partial<DbShape>): DbShape {
  return {
    abrechnungen: db.abrechnungen || [],
    liegenschaften: db.liegenschaften || [],
    gebaeude: db.gebaeude || [],
    wohnungen: db.wohnungen || [],
    mieter: db.mieter || [],
    mietvertraege: db.mietvertraege || [],
    eigentuemer: db.eigentuemer || [],
    pmVertraege: db.pmVertraege || [],
    schriftverkehr: db.schriftverkehr || [],
    kontoauszuege: db.kontoauszuege || [],
    ablage: db.ablage || [],
    systemLog: db.systemLog || [],
    pruefLaeufe: db.pruefLaeufe || [],
    agentSchedules: db.agentSchedules || [],
    buchungen: db.buchungen || [],
    konten: db.konten || [],
    abrechnungskreise: db.abrechnungskreise || [],
    aiUsageLog: db.aiUsageLog || [],
    kalenderEreignisse: db.kalenderEreignisse || [],
    teamNachrichten: db.teamNachrichten || [],
    counters: db.counters || {},
  };
}

async function readDb(): Promise<DbShape> {
  if (cache) return cache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    cache = withDefaults(JSON.parse(raw) as Partial<DbShape>);
  } catch {
    cache = withDefaults({});
    await writeDb(cache);
  }
  return cache!;
}

async function writeDb(db: DbShape) {
  cache = db;
  writeQueue = writeQueue.then(async () => {
    await ensureDataDir();
    const tmp = DB_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
    await fs.rename(tmp, DB_FILE);
  });
  await writeQueue;
}

/**
 * Erzeugt eine eindeutige, fortlaufende Nummer je Objekttyp inkl. Jahr,
 * z.B. "LG-2026-0001", "MI-2026-0007". Wird für alle Stammobjekte (Liegenschaft,
 * Gebäude, Wohnung, Mieter, Mietvertrag) sowie Akten/Dokumente/Abrechnungen vergeben.
 */
export async function nextNummer(prefix: string): Promise<string> {
  const db = await readDb();
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const count = (db.counters[key] || 0) + 1;
  db.counters[key] = count;
  await writeDb(db);
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
}

export async function listAbrechnungen(): Promise<Abrechnung[]> {
  const db = await readDb();
  return [...db.abrechnungen].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getAbrechnung(id: string): Promise<Abrechnung | undefined> {
  const db = await readDb();
  return db.abrechnungen.find((a) => a.id === id);
}

export async function createAbrechnung(a: Abrechnung): Promise<Abrechnung> {
  const db = await readDb();
  db.abrechnungen.push(a);
  await writeDb(db);
  return a;
}

export async function updateAbrechnung(
  id: string,
  patch: Partial<Abrechnung>,
  opts: { versioned?: boolean } = { versioned: true }
): Promise<Abrechnung | undefined> {
  const db = await readDb();
  const idx = db.abrechnungen.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  const current = db.abrechnungen[idx];

  const updated: Abrechnung = {
    ...current,
    ...patch,
    workspace: { ...current.workspace, ...(patch.workspace || {}) },
    updatedAt: new Date().toISOString(),
    version: opts.versioned ? current.version + 1 : current.version,
  };

  if (opts.versioned) {
    updated.history = [
      ...(current.history || []),
      {
        version: current.version,
        timestamp: current.updatedAt,
        snapshot: {
          name: current.name,
          adresse: current.adresse,
          zeitraum: current.zeitraum,
          gesamtSumme: current.gesamtSumme,
          status: current.status,
          workspace: current.workspace,
        },
      },
    ].slice(-25); // letzte 25 Versionen behalten
  }

  db.abrechnungen[idx] = updated;
  await writeDb(db);
  return updated;
}

export async function deleteAbrechnung(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.abrechnungen.length;
  db.abrechnungen = db.abrechnungen.filter((a) => a.id !== id);
  await writeDb(db);
  return db.abrechnungen.length < before;
}

// -------- Generische CRUD-Fabrik für die Liegenschaftshierarchie --------

function makeCrud<T extends { id: string; nummer?: string; createdAt: string; updatedAt: string }>(
  collection: keyof DbShape,
  prefix: string
) {
  return {
    async list(filter?: Partial<T>): Promise<T[]> {
      const db = await readDb();
      const items = db[collection] as unknown as T[];
      if (!filter) return items;
      return items.filter((item) =>
        Object.entries(filter).every(([k, v]) => (item as any)[k] === v)
      );
    },
    async get(id: string): Promise<T | undefined> {
      const db = await readDb();
      return (db[collection] as unknown as T[]).find((i) => i.id === id);
    },
    async create(item: T): Promise<T> {
      const withNummer = { ...item, nummer: item.nummer || (await nextNummer(prefix)) };
      const db = await readDb();
      (db[collection] as unknown as T[]).push(withNummer);
      await writeDb(db);
      return withNummer;
    },
    async update(id: string, patch: Partial<T>): Promise<T | undefined> {
      const db = await readDb();
      const items = db[collection] as unknown as T[];
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      const updated = { ...items[idx], ...patch, updatedAt: new Date().toISOString() } as T;
      items[idx] = updated;
      await writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<boolean> {
      const db = await readDb();
      const items = db[collection] as unknown as T[];
      const before = items.length;
      (db as any)[collection] = items.filter((i) => i.id !== id);
      await writeDb(db);
      return (db[collection] as unknown as T[]).length < before;
    },
  };
}

export const liegenschaftenDb = makeCrud<Liegenschaft>("liegenschaften", "LG");
export const gebaeudeDb = makeCrud<Gebaeude>("gebaeude", "GB");
export const wohnungenDb = makeCrud<Wohnung>("wohnungen", "EH");
export const mieterDb = makeCrud<Mieter>("mieter", "MI");
export const mietvertraegeDb = makeCrud<Mietvertrag>("mietvertraege", "MV");
export const eigentuemerDb = makeCrud<Eigentuemer>("eigentuemer", "EG");
export const pmVertraegeDb = makeCrud<PmVertrag>("pmVertraege", "PM");
export const schriftverkehrDb = makeCrud<SchriftverkehrDokument>("schriftverkehr", "SV");
export const kontoauszuegeDb = makeCrud<Kontoauszug>("kontoauszuege", "KA");
export const ablageDb = makeCrud<AblageDokument>("ablage", "AB");
export const pruefLaufDb = makeCrud<PruefLauf>("pruefLaeufe", "PL");
export const agentSchedulesDb = makeCrud<AgentSchedule>("agentSchedules", "KA-AG");
export const buchungenDb = makeCrud<Buchung>("buchungen", "BU");
export const kontenDb = makeCrud<Konto>("konten", "KT");
export const abrechnungskreiseDb = makeCrud<Abrechnungskreis>("abrechnungskreise", "AK");
export const kalenderEreignisseDb = makeCrud<KalenderEreignis>("kalenderEreignisse", "KE");
export const teamNachrichtenDb = makeCrud<TeamNachricht>("teamNachrichten", "TN");

// -------- Buchhaltung: Aggregation für Dashboard/KPI-Engine --------

/**
 * Berechnet Einnahmen/Ausgaben/Gewinn (optional im Zeitraum) sowie die
 * aktuelle Bilanz aus den Konten. Bewusst zustandslos (kein Caching) –
 * bei wachsendem Buchungsvolumen wäre hier ein Kandidat für einen
 * inkrementellen Aggregations-Layer, aktuell aber unproblematisch.
 */
export async function getBuchhaltungsUebersicht(params?: {
  von?: string;
  bis?: string;
}): Promise<BuchhaltungsUebersicht> {
  const db = await readDb();
  let buchungen = db.buchungen;
  if (params?.von) buchungen = buchungen.filter((b) => b.datum >= params.von!);
  if (params?.bis) buchungen = buchungen.filter((b) => b.datum <= params.bis!);

  const einnahmenNachKategorie: Record<string, number> = {};
  const ausgabenNachKategorie: Record<string, number> = {};
  let einnahmen = 0;
  let ausgaben = 0;

  for (const b of buchungen) {
    if (b.typ === "Einnahme") {
      einnahmen += b.betrag;
      einnahmenNachKategorie[b.kategorie] = (einnahmenNachKategorie[b.kategorie] || 0) + b.betrag;
    } else {
      ausgaben += b.betrag;
      ausgabenNachKategorie[b.kategorie] = (ausgabenNachKategorie[b.kategorie] || 0) + b.betrag;
    }
  }

  const aktiva = db.konten.filter((k) => k.art === "Aktiva");
  const passiva = db.konten.filter((k) => k.art === "Passiva");
  const summeAktiva = aktiva.reduce((s, k) => s + k.saldo, 0);
  const summePassiva = passiva.reduce((s, k) => s + k.saldo, 0);

  return {
    einnahmen,
    ausgaben,
    gewinn: einnahmen - ausgaben,
    einnahmenNachKategorie,
    ausgabenNachKategorie,
    bilanz: {
      aktiva,
      passiva,
      summeAktiva,
      summePassiva,
      imGleichgewicht: Math.abs(summeAktiva - summePassiva) < 0.01,
    },
    buchungenAnzahl: buchungen.length,
  };
}

/**
 * Legt einen einfachen Standard-Kontenrahmen an (nur wenn noch keine Konten
 * existieren) – Einstiegshilfe, damit die Bilanz nicht leer bleibt, bevor der
 * Nutzer eigene Konten pflegt. Salden starten bei 0 und müssen manuell bzw.
 * später automatisiert befüllt werden.
 */
export async function seedStandardKontenrahmen(): Promise<Konto[]> {
  const db = await readDb();
  if (db.konten.length > 0) return db.konten;

  const now = new Date().toISOString();
  const defaults: Array<Pick<Konto, "name" | "art" | "kategorie">> = [
    { name: "Bankguthaben", art: "Aktiva", kategorie: "Liquide Mittel" },
    { name: "Forderungen aus Mietverhältnissen", art: "Aktiva", kategorie: "Umlaufvermögen" },
    { name: "Immobilien / Anlagevermögen", art: "Aktiva", kategorie: "Anlagevermögen" },
    { name: "Eigenkapital", art: "Passiva", kategorie: "Eigenkapital" },
    {
      name: "Verbindlichkeiten aus Lieferungen und Leistungen",
      art: "Passiva",
      kategorie: "Verbindlichkeiten",
    },
    { name: "Rückstellungen für Instandhaltung", art: "Passiva", kategorie: "Rückstellungen" },
  ];

  const created: Konto[] = [];
  for (const d of defaults) {
    const konto = await kontenDb.create({
      id: uid(),
      saldo: 0,
      createdAt: now,
      updatedAt: now,
      ...d,
    } as Konto);
    created.push(konto);
  }
  return created;
}

// -------- Kalender / Agent-Scheduler --------

/** Alle aktiven Aufgaben, deren nextRunAt in der Vergangenheit liegt (fällig). */
export async function dueAgentSchedules(now: Date = new Date()): Promise<AgentSchedule[]> {
  const db = await readDb();
  return db.agentSchedules.filter(
    (s) => s.aktiv && new Date(s.nextRunAt).getTime() <= now.getTime()
  );
}

/**
 * Trägt das Ergebnis eines Laufs ein (Historie, letzte 20) und setzt den
 * nächsten Fälligkeitszeitpunkt. `nextRunAt` wird vom Aufrufer übergeben,
 * da die Wiederholungslogik (schedule.ts) hier bewusst nicht importiert
 * wird, um db.ts frei von Domänenlogik zu halten.
 */
export async function recordAgentScheduleRun(
  id: string,
  lauf: AgentScheduleLauf,
  nextRunAt: string
): Promise<AgentSchedule | undefined> {
  const db = await readDb();
  const idx = db.agentSchedules.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  const current = db.agentSchedules[idx];
  const updated: AgentSchedule = {
    ...current,
    lastRunAt: lauf.zeitpunkt,
    nextRunAt,
    historie: [lauf, ...(current.historie || [])].slice(0, 20),
    updatedAt: new Date().toISOString(),
  };
  db.agentSchedules[idx] = updated;
  await writeDb(db);
  return updated;
}

// -------- System-Log --------
// Bewusst einfach gehalten (kein makeCrud): Einträge werden nur angehängt und
// gelesen, nie einzeln bearbeitet. Die letzten 1000 Einträge werden behalten.

export async function logEvent(
  typ: SystemLogTyp,
  text: string,
  bezug?: { art: string; id?: string }
): Promise<SystemLogEintrag> {
  const db = await readDb();
  const eintrag: SystemLogEintrag = {
    id: uid(),
    zeitpunkt: new Date().toISOString(),
    typ,
    text,
    bezug,
  };
  db.systemLog = [eintrag, ...db.systemLog].slice(0, 1000);
  await writeDb(db);
  return eintrag;
}

export async function listLog(params?: { limit?: number; suche?: string }): Promise<SystemLogEintrag[]> {
  const db = await readDb();
  let items = db.systemLog;
  if (params?.suche?.trim()) {
    const q = params.suche.trim().toLowerCase();
    items = items.filter(
      (e) => e.text.toLowerCase().includes(q) || e.typ.toLowerCase().includes(q)
    );
  }
  return items.slice(0, params?.limit ?? 200);
}

// -------- Dashboard: aggregierte Business-Übersicht --------

/**
 * Aggregiert alle für das Dashboard relevanten Kennzahlen aus den bestehenden
 * Sammlungen. Bewusst eine einzige Funktion (statt vieler Einzel-Fetches im
 * Client), damit Formeln (z.B. Business Health Score) an einer Stelle
 * dokumentiert sind und nicht mehrfach im UI-Code landen.
 */
export async function getDashboardUebersicht(): Promise<DashboardUebersicht> {
  const db = await readDb();
  const buchhaltung = await getBuchhaltungsUebersicht();

  // -- Objekte / Belegung --
  const mieterAktiv = db.mieter.filter((m) => (m.status || "aktiv") === "aktiv").length;
  const belegungsquote = db.wohnungen.length > 0 ? mieterAktiv / db.wohnungen.length : null;

  const objekte = {
    liegenschaften: db.liegenschaften.length,
    gebaeude: db.gebaeude.length,
    wohnungen: db.wohnungen.length,
    mieterAktiv,
    belegungsquote,
  };

  // -- Abrechnungen nach Status --
  const abrechnungen = {
    gesamt: db.abrechnungen.length,
    rohdaten: db.abrechnungen.filter((a) => a.status === "Rohdaten").length,
    validierung: db.abrechnungen.filter((a) => a.status === "Validierung").length,
    fertig: db.abrechnungen.filter((a) => a.status === "Fertig").length,
  };

  // -- Letzte Plausibilitätsprüfung --
  const letzterPruefLauf = [...db.pruefLaeufe].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const offeneBefunde = letzterPruefLauf?.befunde.filter((b) => b.status === "offen") || [];
  const pruefung = {
    letzterLaufAm: letzterPruefLauf?.abgeschlossenAm || letzterPruefLauf?.gestartetAm,
    offeneBefunde: offeneBefunde.length,
    fehler: offeneBefunde.filter((b) => b.schweregrad === "fehler").length,
    warnungen: offeneBefunde.filter((b) => b.schweregrad === "warnung").length,
    hinweise: offeneBefunde.filter((b) => b.schweregrad === "hinweis").length,
  };

  // -- Abgeleitete Kennzahlen --
  const liquideMittel = db.konten
    .filter((k) => k.art === "Aktiva" && k.kategorie === "Liquide Mittel")
    .reduce((s, k) => s + k.saldo, 0);
  const verbindlichkeiten = db.konten
    .filter((k) => k.art === "Passiva" && k.kategorie === "Verbindlichkeiten")
    .reduce((s, k) => s + k.saldo, 0);
  const eigenkapital = db.konten
    .filter((k) => k.art === "Passiva" && k.kategorie === "Eigenkapital")
    .reduce((s, k) => s + k.saldo, 0);

  const liquiditaetsgradI = verbindlichkeiten > 0 ? liquideMittel / verbindlichkeiten : null;
  const eigenkapitalquote =
    buchhaltung.bilanz.summeAktiva > 0 ? eigenkapital / buchhaltung.bilanz.summeAktiva : null;
  const cashflow = buchhaltung.gewinn;

  // Business Health Score (0–100): gleich gewichteter Mittelwert aus vier
  // Teil-Scores. Jeder Teil-Score fällt auf 50 (neutral) zurück, wenn die
  // zugrunde liegenden Daten noch fehlen, statt eine falsche Präzision
  // vorzutäuschen.
  const gewinnmargeScore =
    buchhaltung.einnahmen > 0
      ? Math.max(0, Math.min(100, (buchhaltung.gewinn / buchhaltung.einnahmen) * 200))
      : 50;
  const bilanzScore = db.konten.length === 0 ? 50 : buchhaltung.bilanz.imGleichgewicht ? 100 : 40;
  const pruefScore = !letzterPruefLauf
    ? 50
    : Math.max(0, 100 - pruefung.fehler * 20 - pruefung.warnungen * 8 - pruefung.hinweise * 2);
  const belegungScore = belegungsquote === null ? 50 : belegungsquote * 100;

  const businessHealthScore = Math.round(
    (gewinnmargeScore + bilanzScore + pruefScore + belegungScore) / 4
  );

  // -- Weitere abgeleitete Kennzahlen (alle aus real vorhandenen Daten) --
  const umsatzrendite = buchhaltung.einnahmen > 0 ? buchhaltung.gewinn / buchhaltung.einnahmen : null;

  const umlaufvermoegen = db.konten
    .filter((k) => k.art === "Aktiva" && k.kategorie === "Umlaufvermögen")
    .reduce((s, k) => s + k.saldo, 0);
  const workingCapital = db.konten.length > 0 ? umlaufvermoegen - verbindlichkeiten : null;

  const automatisierteBuchungen = db.buchungen.filter((b) => b.belegTyp && b.belegTyp !== "Manuell").length;
  const automatisierungsgrad =
    db.buchungen.length > 0 ? automatisierteBuchungen / db.buchungen.length : null;

  const dreissigTageMs = 30 * 24 * 60 * 60 * 1000;
  const seit = Date.now() - dreissigTageMs;
  const ausgaben30Tage = db.buchungen
    .filter((b) => b.typ === "Ausgabe" && new Date(b.datum).getTime() >= seit)
    .reduce((s, b) => s + b.betrag, 0);
  const taeglicherBurn = ausgaben30Tage / 30;
  const cashBurnTageReichweite =
    taeglicherBurn > 0 && liquideMittel > 0 ? Math.round(liquideMittel / taeglicherBurn) : null;

  // -- Durchgang 4: verbleibende klassische Kennzahlen --
  const umsatz = buchhaltung.einnahmen;
  const zinsenAusgaben = buchhaltung.ausgabenNachKategorie["Zinsen"] || 0;
  const steuernAusgaben = buchhaltung.ausgabenNachKategorie["Steuern"] || 0;
  const abschreibungenAusgaben = buchhaltung.ausgabenNachKategorie["Abschreibungen"] || 0;
  const ebit = buchhaltung.gewinn + zinsenAusgaben + steuernAusgaben;
  const ebitda = ebit + abschreibungenAusgaben;

  const liquiditaetsgradII =
    verbindlichkeiten > 0 ? (liquideMittel + umlaufvermoegen) / verbindlichkeiten : null;
  // Ohne Vorräte/Warenlager in diesem Geschäftsmodell rechnerisch identisch mit Grad II.
  const liquiditaetsgradIII = liquiditaetsgradII;

  // -- Durchgang 4: zusätzliche moderne Kennzahlen --
  const schriftverkehrGesamt = db.schriftverkehr.length;
  const schriftverkehrAgent = db.schriftverkehr.filter((s) => s.quelle === "agent").length;
  const korrespondenzAutomatisierungsgrad =
    schriftverkehrGesamt > 0 ? schriftverkehrAgent / schriftverkehrGesamt : null;

  const automatisierungsWerte = [automatisierungsgrad, korrespondenzAutomatisierungsgrad].filter(
    (v): v is number => v !== null
  );
  const gesamtAutomatisierungsgrad =
    automatisierungsWerte.length > 0
      ? automatisierungsWerte.reduce((s, v) => s + v, 0) / automatisierungsWerte.length
      : null;

  const konfidenzWerte = db.ablage
    .map((a) => a.konfidenz)
    .filter((k): k is number => typeof k === "number");
  const kiKonfidenzScore =
    konfidenzWerte.length > 0 ? konfidenzWerte.reduce((s, k) => s + k, 0) / konfidenzWerte.length : null;

  const zugeordneteDokumente = db.ablage.filter((a) => a.status === "zugeordnet");
  const bearbeitungsdauernStunden = zugeordneteDokumente.map(
    (a) => (new Date(a.updatedAt).getTime() - new Date(a.hochgeladenAm).getTime()) / (1000 * 60 * 60)
  );
  const processingSpeedStunden =
    bearbeitungsdauernStunden.length > 0
      ? bearbeitungsdauernStunden.reduce((s, h) => s + Math.max(0, h), 0) / bearbeitungsdauernStunden.length
      : null;

  const stammdatenGesamt =
    db.liegenschaften.length +
    db.gebaeude.length +
    db.wohnungen.length +
    db.mieter.length +
    db.mietvertraege.length +
    db.abrechnungen.length +
    db.ablage.length;
  const dataQualityScore =
    stammdatenGesamt > 0
      ? Math.max(
          0,
          100 - Math.min(100, ((pruefung.fehler * 10 + pruefung.warnungen * 4 + pruefung.hinweise) / stammdatenGesamt) * 100)
        )
      : null;

  const riskExposureIndex = Math.max(
    0,
    Math.min(
      100,
      pruefung.fehler * 15 +
        pruefung.warnungen * 5 +
        (liquiditaetsgradI !== null && liquiditaetsgradI < 1 ? (1 - liquiditaetsgradI) * 30 : 0)
    )
  );

  const kennzahlen = {
    liquiditaetsgradI,
    eigenkapitalquote,
    cashflow,
    businessHealthScore,
    umsatzrendite,
    workingCapital,
    automatisierungsgrad,
    cashBurnTageReichweite,
    umsatz,
    ebit,
    ebitda,
    liquiditaetsgradII,
    liquiditaetsgradIII,
    korrespondenzAutomatisierungsgrad,
    gesamtAutomatisierungsgrad,
    kiKonfidenzScore,
    processingSpeedStunden,
    dataQualityScore,
    riskExposureIndex,
  };

  const aktivitaet = db.systemLog.slice(0, 12);

  return { buchhaltung, objekte, abrechnungen, pruefung, kennzahlen, aktivitaet };
}

/**
 * Liefert Verlaufsreihen für Sparklines/Trendcharts — ausschließlich aus
 * bereits vorhandenen, zeitgestempelten Daten aggregiert (keine Interpolation,
 * keine synthetischen Punkte). Ist die zugrunde liegende Liste leer, ist auch
 * das Ergebnis leer; die UI zeigt dann ehrlich "keine Verlaufsdaten" statt
 * einer Kurve zu erfinden.
 */
export async function getDashboardVerlauf(): Promise<DashboardVerlauf> {
  const db = await readDb();

  // -- Buchungen: Einnahmen/Ausgaben je Tag + kumulierter Gewinn --
  const tageMap = new Map<string, { einnahmen: number; ausgaben: number }>();
  for (const b of db.buchungen) {
    const tag = b.datum.slice(0, 10);
    const eintrag = tageMap.get(tag) || { einnahmen: 0, ausgaben: 0 };
    if (b.typ === "Einnahme") eintrag.einnahmen += b.betrag;
    else eintrag.ausgaben += b.betrag;
    tageMap.set(tag, eintrag);
  }
  const tage = [...tageMap.keys()].sort();
  let kumuliert = 0;
  const buchungenVerlauf: DashboardBuchungsVerlaufPunkt[] = tage.map((datum) => {
    const { einnahmen, ausgaben } = tageMap.get(datum)!;
    kumuliert += einnahmen - ausgaben;
    return { datum, einnahmen, ausgaben, gewinnKumuliert: kumuliert };
  });

  // -- Prüfläufe: offene Befunde je Lauf, chronologisch --
  const pruefVerlauf: DashboardPruefVerlaufPunkt[] = [...db.pruefLaeufe]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((lauf) => ({
      datum: (lauf.abgeschlossenAm || lauf.gestartetAm).slice(0, 10),
      offeneBefunde: lauf.befunde.filter((bf) => bf.status === "offen").length,
    }));

  // -- Systemprotokoll: Ereignisse je Tag, letzte 30 Tage --
  const grenzeMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const aktivitaetTageMap = new Map<string, number>();
  for (const e of db.systemLog) {
    if (new Date(e.zeitpunkt).getTime() < grenzeMs) continue;
    const tag = e.zeitpunkt.slice(0, 10);
    aktivitaetTageMap.set(tag, (aktivitaetTageMap.get(tag) || 0) + 1);
  }
  const aktivitaet: DashboardAktivitaetVerlaufPunkt[] = [...aktivitaetTageMap.keys()]
    .sort()
    .map((datum) => ({ datum, anzahl: aktivitaetTageMap.get(datum)! }));

  return { buchungen: buchungenVerlauf, pruefung: pruefVerlauf, aktivitaet };
}

/**
 * Regelbasierte Empfehlungen des "LLM Dashboard Agent" (Durchgang 5).
 * Bewusst deterministisch statt eines LLM-Aufrufs pro Seitenaufruf — jede
 * Regel ist nachvollziehbar an eine echte Kennzahl gekoppelt. Ein Nutzer,
 * der Rückfragen oder freitextliche Einordnung möchte, nutzt dafür den
 * ohnehin vorhandenen Chat-Agenten (der bereits vollen Datenzugriff hat).
 */
export async function getAgentHinweise(): Promise<AgentHinweis[]> {
  const uebersicht = await getDashboardUebersicht();
  const verlauf = await getDashboardVerlauf();
  const hinweise: AgentHinweis[] = [];

  if (uebersicht.pruefung.fehler > 0) {
    hinweise.push({
      id: uid(),
      schweregrad: "kritisch",
      text: `${uebersicht.pruefung.fehler} Fehlerbefund(e) aus der letzten Plausibilitätsprüfung sind noch offen.`,
      kpiId: "offeneBefunde",
    });
  }

  if (uebersicht.buchhaltung.bilanz.aktiva.length + uebersicht.buchhaltung.bilanz.passiva.length > 0 && !uebersicht.buchhaltung.bilanz.imGleichgewicht) {
    hinweise.push({
      id: uid(),
      schweregrad: "warnung",
      text: "Aktiva und Passiva sind aktuell nicht im Gleichgewicht — die Bilanz sollte geprüft werden.",
      kpiId: "bilanzsumme",
    });
  }

  if (uebersicht.kennzahlen.cashBurnTageReichweite !== null && uebersicht.kennzahlen.cashBurnTageReichweite < 60) {
    hinweise.push({
      id: uid(),
      schweregrad: uebersicht.kennzahlen.cashBurnTageReichweite < 30 ? "kritisch" : "warnung",
      text: `Bei aktuellem Ausgabentempo reichen die liquiden Mittel noch rund ${uebersicht.kennzahlen.cashBurnTageReichweite} Tage.`,
      kpiId: "cashBurnTageReichweite",
    });
  }

  // Trend: sinkt der kumulierte Gewinn an den letzten mind. 3 Buchungstagen in Folge?
  const punkte = verlauf.buchungen;
  if (punkte.length >= 3) {
    const letzte = punkte.slice(-3);
    const sinktDurchgehend = letzte.every((p, i) => i === 0 || p.gewinnKumuliert < letzte[i - 1].gewinnKumuliert);
    if (sinktDurchgehend) {
      hinweise.push({
        id: uid(),
        schweregrad: "warnung",
        text: `Der kumulierte Gewinn sinkt seit ${letzte.length} aufeinanderfolgenden Buchungstagen.`,
        kpiId: "gewinn",
      });
    }
  }

  if (uebersicht.kennzahlen.riskExposureIndex > 50) {
    hinweise.push({
      id: uid(),
      schweregrad: "warnung",
      text: `Der Risk Exposure Index liegt bei ${Math.round(uebersicht.kennzahlen.riskExposureIndex)}/100 — überdurchschnittliches Risiko aus Prüfbefunden und/oder Liquidität.`,
      kpiId: "riskExposureIndex",
    });
  }

  if (uebersicht.objekte.belegungsquote !== null && uebersicht.objekte.belegungsquote < 0.8) {
    hinweise.push({
      id: uid(),
      schweregrad: "info",
      text: `Die Belegungsquote liegt bei ${Math.round(uebersicht.objekte.belegungsquote * 100)} % — ungenutztes Ertragspotenzial in leerstehenden Wohnungen.`,
      kpiId: "belegungsquote",
    });
  }

  if (hinweise.length === 0) {
    hinweise.push({
      id: uid(),
      schweregrad: "info",
      text: "Aktuell keine Auffälligkeiten anhand der hinterlegten Regeln erkannt.",
    });
  }

  return hinweise;
}

// -------- AI Cost & Model Observatory (Durchgang 6) --------

/**
 * Referenzpreise (USD je 1 Mio. Tokens) — bewusst NUR für Modelle gepflegt,
 * die kostenpflichtig laufen könnten. Alle aktuell in groq-client.ts
 * verdrahteten Modelle (Groq/Cerebras/Cloudflare-Free-Tier/NVIDIA-Preview)
 * fehlen hier absichtlich: sie laufen auf kostenlosen Kontingenten, ein
 * Preis würde eine Abrechnung vortäuschen, die nicht stattfindet. Wird ein
 * Modell hier eingetragen, fließt sein Preis automatisch in die
 * Kostenschätzung ein.
 */
const AI_MODELL_PREISE: Record<string, { inputProMio: number; outputProMio: number }> = {};

function schaetzeKostenUsd(model: string, promptTokens: number, completionTokens: number): number {
  const preis = AI_MODELL_PREISE[model];
  if (!preis) return 0;
  return (promptTokens / 1_000_000) * preis.inputProMio + (completionTokens / 1_000_000) * preis.outputProMio;
}

/**
 * Protokolliert einen einzelnen LLM-Aufruf. Wird von createChatCompletion in
 * groq-client.ts nach jedem erfolgreichen Aufruf angestoßen — dort
 * fire-and-forget mit try/catch, damit ein Logging-Fehler nie einen
 * eigentlichen KI-Aufruf zum Scheitern bringt.
 */
export async function recordAiUsage(input: {
  provider: AiProvider;
  model: string;
  fallbackStufe: number;
  promptTokens: number;
  completionTokens: number;
  exakt: boolean;
}): Promise<void> {
  const db = await readDb();
  const eintrag: AiCallLogEintrag = {
    id: uid(),
    zeitpunkt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    fallbackStufe: input.fallbackStufe,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.promptTokens + input.completionTokens,
    exakt: input.exakt,
    geschaetzteKostenUsd: schaetzeKostenUsd(input.model, input.promptTokens, input.completionTokens),
  };
  db.aiUsageLog = [eintrag, ...db.aiUsageLog].slice(0, 2000);
  await writeDb(db);
}

/** Welche Free-Tier-Provider sind (per ENV-Variable) aktuell konfiguriert? Direkt aus process.env gelesen, keine Vermutung. */
function buildAiProviderKatalog(): AiProviderKatalogEintrag[] {
  return [
    {
      provider: "groq",
      label: "Groq (Primärkette: gpt-oss-120b/20b, qwen3.6-27b, compound-mini/compound)",
      konfiguriert: Boolean(process.env.GROQ_API_KEY),
      benoetigteEnvVars: ["GROQ_API_KEY"],
      hinweis: "Bereits aktiv genutzte Hauptkette. Modelle überschreibbar via GROQ_TEXT_MODELS=model-a,model-b,...",
    },
    {
      provider: "cerebras",
      label: "Cerebras (Preview-Fallback, eigenes Kontingent)",
      konfiguriert: Boolean(process.env.CEREBRAS_API_KEY),
      benoetigteEnvVars: ["CEREBRAS_API_KEY"],
      hinweis: "In groq-client.ts bereits verdrahtet — nur CEREBRAS_API_KEY setzen, um als zusätzliche Fallback-Stufe zu aktivieren.",
    },
    {
      provider: "cloudflare",
      label: "Cloudflare Workers AI (Free-Tier-Neurons)",
      konfiguriert: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID && (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY)
      ),
      benoetigteEnvVars: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
      hinweis: "Bereits verdrahtet — CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN setzen, um zu aktivieren.",
    },
    {
      provider: "nvidia",
      label: "NVIDIA Build / NIM (Preview-Fallback)",
      konfiguriert: Boolean(process.env.NVIDIA_API_KEY),
      benoetigteEnvVars: ["NVIDIA_API_KEY"],
      hinweis: "Bereits verdrahtet — nur NVIDIA_API_KEY (Format 'nvapi-…') setzen, um zu aktivieren.",
    },
  ];
}

export async function getAiObservatoryUebersicht(): Promise<AiObservatoryUebersicht> {
  const db = await readDb();
  const log = db.aiUsageLog;

  const proModellMap = new Map<string, { provider: AiProvider; model: string; aufrufe: number; fehlgeschlageneFallbacks: number; promptTokens: number; completionTokens: number; geschaetzteKostenUsd: number }>();
  for (const e of log) {
    const key = `${e.provider}:${e.model}`;
    const eintrag = proModellMap.get(key) || {
      provider: e.provider,
      model: e.model,
      aufrufe: 0,
      fehlgeschlageneFallbacks: 0,
      promptTokens: 0,
      completionTokens: 0,
      geschaetzteKostenUsd: 0,
    };
    eintrag.aufrufe += 1;
    if (e.fallbackStufe > 0) eintrag.fehlgeschlageneFallbacks += 1;
    eintrag.promptTokens += e.promptTokens;
    eintrag.completionTokens += e.completionTokens;
    eintrag.geschaetzteKostenUsd += e.geschaetzteKostenUsd;
    proModellMap.set(key, eintrag);
  }

  return {
    gesamtAufrufe: log.length,
    gesamtPromptTokens: log.reduce((s, e) => s + e.promptTokens, 0),
    gesamtCompletionTokens: log.reduce((s, e) => s + e.completionTokens, 0),
    gesamtKostenUsd: log.reduce((s, e) => s + e.geschaetzteKostenUsd, 0),
    proModell: [...proModellMap.values()].sort((a, b) => b.aufrufe - a.aufrufe),
    providerKatalog: buildAiProviderKatalog(),
    letzteAufrufe: log.slice(0, 20),
  };
}

// -------- Durchgang 7: Abrechnungskreise & Agent-Buchungstool --------

/**
 * Standard-Abrechnungskreiskatalog — liegenschaftsübergreifend anwendbar
 * (kein wohnungIds-Filter), je einmal per Knopfdruck anlegbar. Individuelle
 * Kreise (z.B. "nur Erdgeschoss") legt der Nutzer oder der Agent gezielt mit
 * expliziten wohnungIds an, weil sich das nicht generisch aus Stammdaten
 * ableiten lässt (Etagenangabe ist Freitext in `Wohnung.bezeichnung`).
 */
export async function seedStandardAbrechnungskreise(): Promise<Abrechnungskreis[]> {
  const db = await readDb();
  if (db.abrechnungskreise.some((k) => k.istStandard)) {
    return db.abrechnungskreise.filter((k) => k.istStandard);
  }
  const now = new Date().toISOString();
  const defaults: Array<Pick<Abrechnungskreis, "name" | "beschreibung" | "umlageschluessel">> = [
    {
      name: "Alle Mieter (Wohnfläche)",
      beschreibung: "Umlage auf alle Wohnungen der Liegenschaft, proportional zur Wohnfläche.",
      umlageschluessel: "Wohnflaeche",
    },
    {
      name: "Alle Mieter (Miteigentumsanteil)",
      beschreibung: "Umlage auf alle Wohnungen der Liegenschaft, proportional zum Miteigentumsanteil (MEA).",
      umlageschluessel: "Miteigentumsanteil",
    },
    {
      name: "Alle Mieter (gleich verteilt)",
      beschreibung: "Umlage zu gleichen Teilen auf alle Wohnungen der Liegenschaft (Kopfteile).",
      umlageschluessel: "Gleich",
    },
  ];
  const created: Abrechnungskreis[] = [];
  for (const d of defaults) {
    const k = await abrechnungskreiseDb.create({
      id: uid(),
      istStandard: true,
      createdAt: now,
      updatedAt: now,
      ...d,
    } as Abrechnungskreis);
    created.push(k);
  }
  return created;
}

/**
 * Berechnet die Aufteilung eines Betrags auf Wohnungen/Mieter gemäß
 * Abrechnungskreis. Löst den betroffenen Wohnungsbestand IMMER live gegen
 * den aktuellen Stammdatenbestand auf (nicht gegen einen gespeicherten
 * Schnappschuss) — Wohnungsbestand und Mieterwechsel ändern sich, die
 * Zuordnung soll das zum Buchungszeitpunkt korrekt widerspiegeln.
 */
export async function berechneAbrechnungskreisSplit(
  kreisId: string,
  liegenschaftId: string,
  betrag: number
): Promise<AbrechnungskreisSplitErgebnis> {
  const db = await readDb();
  const kreis = db.abrechnungskreise.find((k) => k.id === kreisId);
  if (!kreis) {
    return { positionen: [], summeVerteilt: 0, nichtZugeordneteWohnungen: [] };
  }

  const gebaeudeIds = db.gebaeude.filter((g) => g.liegenschaftId === liegenschaftId).map((g) => g.id);
  let wohnungen = db.wohnungen.filter((w) => gebaeudeIds.includes(w.gebaeudeId));
  if (kreis.wohnungIds && kreis.wohnungIds.length > 0) {
    const erlaubt = new Set(kreis.wohnungIds);
    wohnungen = wohnungen.filter((w) => erlaubt.has(w.id));
  }

  type Kandidat = { wohnung: (typeof wohnungen)[number]; mieterId: string; mieterName: string; gewicht: number };
  const kandidaten: Kandidat[] = [];
  const nichtZugeordneteWohnungen: string[] = [];

  for (const w of wohnungen) {
    // Aktiven Mietvertrag bestimmen: kein mietende ODER mietende in der Zukunft.
    const heute = new Date().toISOString().slice(0, 10);
    const vertraege = db.mietvertraege.filter((mv) => mv.wohnungId === w.id && mv.mieterId);
    const aktiverVertrag =
      vertraege.find((mv) => !mv.mietende || mv.mietende >= heute) || vertraege[vertraege.length - 1];

    if (!aktiverVertrag?.mieterId) {
      nichtZugeordneteWohnungen.push(w.bezeichnung || w.nummer || w.id);
      continue;
    }
    const mieter = db.mieter.find((m) => m.id === aktiverVertrag.mieterId);
    if (!mieter) {
      nichtZugeordneteWohnungen.push(w.bezeichnung || w.nummer || w.id);
      continue;
    }

    let gewicht: number;
    if (kreis.umlageschluessel === "Wohnflaeche") {
      gewicht = w.flaeche || aktiverVertrag.flaeche || 0;
    } else if (kreis.umlageschluessel === "Miteigentumsanteil") {
      gewicht = w.miteigentumsanteil || 0;
    } else {
      gewicht = 1; // Gleich verteilt
    }
    if (gewicht <= 0) {
      nichtZugeordneteWohnungen.push(
        `${w.bezeichnung || w.nummer || w.id} (kein ${kreis.umlageschluessel === "Wohnflaeche" ? "Flächen" : "MEA"}-Wert hinterlegt)`
      );
      continue;
    }
    kandidaten.push({ wohnung: w, mieterId: mieter.id, mieterName: mieter.name, gewicht });
  }

  const gesamtgewicht = kandidaten.reduce((s, k) => s + k.gewicht, 0);
  if (gesamtgewicht <= 0) {
    return { positionen: [], summeVerteilt: 0, nichtZugeordneteWohnungen };
  }

  const positionen: BuchungsAufteilungsPosition[] = kandidaten.map((k) => {
    const anteil = k.gewicht / gesamtgewicht;
    return {
      wohnungId: k.wohnung.id,
      wohnungBezeichnung: k.wohnung.bezeichnung || k.wohnung.nummer || k.wohnung.id,
      mieterId: k.mieterId,
      mieterName: k.mieterName,
      anteil,
      betrag: Math.round(betrag * anteil * 100) / 100,
    };
  });

  // Rundungsdifferenz auf die größte Position packen, damit Summe exakt stimmt.
  const summeVerteilt = positionen.reduce((s, p) => s + p.betrag, 0);
  const diff = Math.round((betrag - summeVerteilt) * 100) / 100;
  if (diff !== 0 && positionen.length > 0) {
    const groesste = positionen.reduce((a, b) => (b.betrag > a.betrag ? b : a));
    groesste.betrag = Math.round((groesste.betrag + diff) * 100) / 100;
  }

  return {
    positionen,
    summeVerteilt: positionen.reduce((s, p) => s + p.betrag, 0),
    nichtZugeordneteWohnungen,
  };
}

export interface BuchungErstellenInput {
  typ: "Einnahme" | "Ausgabe";
  kategorie: string;
  betrag: number;
  datum?: string;
  beschreibung?: string;
  liegenschaftId?: string;
  belegTyp?: Buchung["belegTyp"];
  belegId?: string;
  belegFreitext?: string;
  rechnungsdaten?: Buchung["rechnungsdaten"];
  abrechnungskreisId?: string;
}

export type BuchungErstellenErgebnis =
  | { ok: true; buchung: Buchung; split?: AbrechnungskreisSplitErgebnis }
  | { ok: false; fehler: string };

/**
 * Zentrale, einzige Stelle, an der Buchungen entstehen — genutzt sowohl vom
 * manuellen Formular (API-Route) als auch vom Agenten (Tool-Call), damit
 * Belegpflicht und Splitting-Logik nicht zweimal gepflegt werden müssen.
 *
 * Belegpflicht: JEDE Buchung braucht entweder eine Referenz auf ein
 * existierendes Ablage-Dokument (`belegId`, z.B. ein Kaufvertrag oder eine
 * Rechnung) ODER — falls (noch) kein digitalisiertes Dokument vorliegt —
 * mindestens `belegFreitext` als nachvollziehbare Referenz. Ganz ohne
 * Beleg-Angabe wird die Buchung abgelehnt.
 */
export async function buchungErstellen(input: BuchungErstellenInput): Promise<BuchungErstellenErgebnis> {
  if (!input.kategorie || typeof input.betrag !== "number" || input.betrag <= 0) {
    return { ok: false, fehler: "kategorie und ein positiver betrag sind erforderlich." };
  }

  const db = await readDb();

  if (input.belegId) {
    const beleg = db.ablage.find((a) => a.id === input.belegId);
    if (!beleg) {
      return { ok: false, fehler: `Beleg-Dokument ${input.belegId} wurde nicht gefunden.` };
    }
  } else if (!input.belegFreitext?.trim()) {
    return {
      ok: false,
      fehler:
        "Keine Buchung ohne Beleg: bitte entweder belegId (vorhandenes Ablage-Dokument, z.B. Kaufvertrag/Rechnung) oder belegFreitext (Referenz, falls noch kein Dokument digitalisiert ist) angeben.",
    };
  }

  let split: AbrechnungskreisSplitErgebnis | undefined;
  if (input.abrechnungskreisId) {
    if (!input.liegenschaftId) {
      return { ok: false, fehler: "Für eine Umlage auf einen Abrechnungskreis ist liegenschaftId erforderlich." };
    }
    const kreis = db.abrechnungskreise.find((k) => k.id === input.abrechnungskreisId);
    if (!kreis) return { ok: false, fehler: `Abrechnungskreis ${input.abrechnungskreisId} wurde nicht gefunden.` };
    split = await berechneAbrechnungskreisSplit(input.abrechnungskreisId, input.liegenschaftId, input.betrag);
    if (split.positionen.length === 0) {
      return {
        ok: false,
        fehler:
          "Der Abrechnungskreis konnte keiner Wohnung mit aktivem Mieter zugeordnet werden — bitte Stammdaten (Mietverträge, Flächen/MEA) prüfen.",
      };
    }
  }

  const now = new Date().toISOString();
  const buchung: Buchung = {
    id: uid(),
    datum: input.datum || now,
    typ: input.typ,
    kategorie: input.kategorie,
    betrag: Math.abs(input.betrag),
    beschreibung: input.beschreibung,
    liegenschaftId: input.liegenschaftId,
    belegTyp: input.belegId ? input.belegTyp || "Rechnung" : input.belegTyp || "Manuell",
    belegId: input.belegId,
    belegFreitext: input.belegFreitext,
    rechnungsdaten: input.rechnungsdaten,
    abrechnungskreisId: input.abrechnungskreisId,
    aufteilung: split?.positionen,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await buchungenDb.create(buchung);
  const aufteilungsHinweis = split
    ? ` und auf ${split.positionen.length} Mieter umgelegt (${split.nichtZugeordneteWohnungen.length > 0 ? `${split.nichtZugeordneteWohnungen.length} Wohnung(en) ohne Zuordnung übersprungen` : "vollständig zugeordnet"})`
    : "";
  await logEvent(
    "anlage",
    `${saved.typ} „${saved.kategorie}" über ${saved.betrag.toFixed(2)} € gebucht${aufteilungsHinweis}.`,
    { art: "Buchung", id: saved.id }
  );

  return { ok: true, buchung: saved, split };
}

/**
 * Storniert eine Buchung NICHT durch Löschen, sondern durch eine
 * Gegenbuchung (Buchhaltungs-Prinzip: der ursprüngliche Vorgang bleibt
 * nachvollziehbar, inkl. eigener Aufteilung, falls vorhanden). Die
 * Original-Buchung wird als `storniert` markiert und bleibt erhalten.
 */
export async function buchungStornieren(
  buchungId: string,
  grund?: string
): Promise<{ ok: true; storno: Buchung } | { ok: false; fehler: string }> {
  const original = await buchungenDb.get(buchungId);
  if (!original) return { ok: false, fehler: "Buchung nicht gefunden." };
  if (original.storniert) return { ok: false, fehler: "Buchung ist bereits storniert." };
  if (original.istStornoBuchung) return { ok: false, fehler: "Eine Storno-Buchung kann nicht selbst storniert werden." };

  const now = new Date().toISOString();
  const gegenTyp: BuchungsTyp = original.typ === "Einnahme" ? "Ausgabe" : "Einnahme";
  const storno: Buchung = {
    id: uid(),
    datum: now,
    typ: gegenTyp,
    kategorie: original.kategorie,
    betrag: original.betrag,
    beschreibung: `Stornierung von Buchung ${original.nummer || original.id}${grund ? `: ${grund}` : ""}`,
    liegenschaftId: original.liegenschaftId,
    belegTyp: original.belegTyp,
    belegId: original.belegId,
    belegFreitext: original.belegFreitext || `Storno zu ${original.nummer || original.id}`,
    abrechnungskreisId: original.abrechnungskreisId,
    aufteilung: original.aufteilung,
    istStornoBuchung: true,
    storniertVonBuchungId: original.id,
    createdAt: now,
    updatedAt: now,
  };
  const savedStorno = await buchungenDb.create(storno);
  await buchungenDb.update(original.id, { storniert: true, storniertDurchBuchungId: savedStorno.id } as Partial<Buchung>);

  await logEvent(
    "aenderung",
    `Buchung „${original.kategorie}" über ${original.betrag.toFixed(2)} € storniert (Gegenbuchung ${savedStorno.nummer || savedStorno.id}).`,
    { art: "Buchung", id: original.id }
  );

  return { ok: true, storno: savedStorno };
}

// -------- Mein Kalender: aus echten App-Daten abgeleitete Termine --------

/**
 * Liest read-only Termine aus bereits vorhandenen Daten der App — Mietbeginn/
 * -ende, nächste Agent-Routinen-Läufe, letzte Prüfläufe, größere Buchungen
 * (Kaufverträge). Das ist die "100% Synchronisation mit der App": keine
 * eigene Terminverwaltung dupliziert Daten, sondern zeigt sie zusätzlich zu
 * den manuell angelegten `KalenderEreignis`-Einträgen an.
 */
export async function getAbgeleiteteKalenderEreignisse(): Promise<AbgeleitetesKalenderEreignis[]> {
  const db = await readDb();
  const ereignisse: AbgeleitetesKalenderEreignis[] = [];

  for (const mv of db.mietvertraege) {
    if (mv.mietbeginn) {
      ereignisse.push({
        id: `mv-start-${mv.id}`,
        titel: `Mietbeginn: ${mv.wohnungId}`,
        datum: mv.mietbeginn,
        kategorie: "Termin",
        quelle: "Mietvertrag",
        link: "/mieter",
      });
    }
    if (mv.mietende) {
      ereignisse.push({
        id: `mv-ende-${mv.id}`,
        titel: `Mietende: ${mv.wohnungId}`,
        datum: mv.mietende,
        kategorie: "Frist",
        quelle: "Mietvertrag",
        link: "/mieter",
      });
    }
  }

  for (const s of db.agentSchedules) {
    if (!s.aktiv) continue;
    ereignisse.push({
      id: `routine-${s.id}`,
      titel: `Routine: ${s.name}`,
      datum: s.nextRunAt,
      kategorie: "Aufgabe",
      quelle: "Routine",
      link: "/kalender?tab=routinen",
    });
  }

  for (const lauf of db.pruefLaeufe) {
    ereignisse.push({
      id: `pruef-${lauf.id}`,
      titel: `Plausibilitätsprüfung (${lauf.befunde.length} Befund(e))`,
      datum: lauf.gestartetAm,
      kategorie: "Erinnerung",
      quelle: "Pruefung",
      link: "/pruefung",
    });
  }

  // Nur bedeutsame Buchungen (Kaufverträge) als Kalendertermin — sonst würde
  // jede Alltagsbuchung den Kalender überfluten.
  for (const b of db.buchungen) {
    if (b.belegTyp === "Kaufvertrag") {
      ereignisse.push({
        id: `buchung-${b.id}`,
        titel: `${b.kategorie}: ${b.betrag.toFixed(2)} €`,
        datum: b.datum,
        kategorie: "Termin",
        quelle: "Buchung",
        link: "/buchhaltung",
      });
    }
  }

  return ereignisse;
}
