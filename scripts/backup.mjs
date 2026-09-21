#!/usr/bin/env node
// ============================================================================
// Sicherung der Datenablage (db.json + uploads/) — nur Node, keine Zusatzwerkzeuge
// ============================================================================
// Aufruf:  node scripts/backup.mjs [--dir=backups] [--keep=14]
//   DATA_DIR  Datenverzeichnis (Standard ./data, auf Fly /data)
//   --dir     Zielverzeichnis für Sicherungen (Standard ./backups)
//   --keep    Anzahl der Sicherungen, die behalten werden (Standard 14, älteste werden gelöscht)
//
// Ablauf: db.json wird auf gültiges JSON geprüft (defekte Dateien werden NICHT gesichert), dann werden
// db.json und uploads/ in ein Verzeichnis backups/bkabr-<Zeitstempel>/ kopiert. MANIFEST.json enthält
// Größe und SHA-256 je Datei sowie die Anzahl der Datensätze je Sammlung (Vergleichswerte für die
// Datenqualitätsabnahme). Wiederherstellung: scripts/restore.mjs.

import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

const arg = (name, fallback) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const BACKUP_ROOT = path.resolve(arg("dir", "backups"));
const KEEP = Math.max(1, Number(arg("keep", "14")) || 14);

async function sha256(file) {
  const h = crypto.createHash("sha256");
  h.update(await fs.readFile(file));
  return h.digest("hex");
}

async function listFiles(dir, base = dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

async function main() {
  const dbFile = path.join(DATA_DIR, "db.json");
  let db;
  try {
    db = JSON.parse(await fs.readFile(dbFile, "utf-8"));
  } catch (err) {
    console.error(`❌ ${dbFile} fehlt oder ist kein gültiges JSON — keine Sicherung angelegt. (${err.message})`);
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const target = path.join(BACKUP_ROOT, `bkabr-${stamp}`);
  await fs.mkdir(target, { recursive: true });

  await fs.copyFile(dbFile, path.join(target, "db.json"));
  const uploadsSrc = path.join(DATA_DIR, "uploads");
  await fs.cp(uploadsSrc, path.join(target, "uploads"), { recursive: true }).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });

  const files = await listFiles(target);
  const manifest = {
    createdAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    counts: Object.fromEntries(Object.entries(db).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])),
    files: [],
  };
  for (const rel of files) {
    const p = path.join(target, rel);
    manifest.files.push({ path: rel.split(path.sep).join("/"), size: (await fs.stat(p)).size, sha256: await sha256(p) });
  }
  await fs.writeFile(path.join(target, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`✅ Sicherung: ${target} (${manifest.files.length} Dateien)`);

  // Rotation: nur die letzten KEEP Sicherungen behalten
  const alle = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith("bkabr-"))
    .map((e) => e.name)
    .sort();
  for (const alt of alle.slice(0, Math.max(0, alle.length - KEEP))) {
    await fs.rm(path.join(BACKUP_ROOT, alt), { recursive: true, force: true });
    console.log(`🗑️  Alte Sicherung entfernt: ${alt}`);
  }
}

main().catch((err) => {
  console.error("❌ Sicherung fehlgeschlagen:", err);
  process.exit(1);
});
