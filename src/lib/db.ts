import { promises as fs } from "fs";
import path from "path";
import { Abrechnung } from "./types";

// DATA_DIR kann per ENV überschrieben werden (z.B. für ein Fly.io Volume unter /data)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DbShape {
  abrechnungen: Abrechnung[];
}

let cache: DbShape | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readDb(): Promise<DbShape> {
  if (cache) return cache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    cache = JSON.parse(raw) as DbShape;
  } catch {
    cache = { abrechnungen: [] };
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
