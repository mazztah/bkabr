import { promises as fs } from "fs";
import path from "path";
import { Abrechnung, Gebaeude, Liegenschaft, Mieter, Mietvertrag, Wohnung } from "./types";

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
