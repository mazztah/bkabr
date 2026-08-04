import { promises as fs } from "fs";
import path from "path";
import {
  AblageDokument,
  Abrechnung,
  AgentSchedule,
  AgentScheduleLauf,
  Buchung,
  BuchhaltungsUebersicht,
  DashboardUebersicht,
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

  const kennzahlen = {
    liquiditaetsgradI,
    eigenkapitalquote,
    cashflow,
    businessHealthScore,
  };

  const aktivitaet = db.systemLog.slice(0, 12);

  return { buchhaltung, objekte, abrechnungen, pruefung, kennzahlen, aktivitaet };
}
