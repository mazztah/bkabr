#!/usr/bin/env node
// ============================================================================
// Wiederherstellung einer Sicherung von scripts/backup.mjs
// ============================================================================
// Aufruf:  node scripts/restore.mjs <Sicherungsverzeichnis> [--yes]
// Ohne --yes wird nur geprüft (Prüfsummen laut MANIFEST.json) und angezeigt, was passieren würde.
// Vor dem Überschreiben wird der aktuelle Stand nach <DATA_DIR>.pre-restore-<Zeitstempel> kopiert.
// Die App vorher stoppen (Fly: `fly scale count 0`, danach wieder `fly scale count 1`).

import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

const quelle = process.argv[2] && !process.argv[2].startsWith("--") ? path.resolve(process.argv[2]) : null;
const JA = process.argv.includes("--yes");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));

if (!quelle) {
  console.error("Aufruf: node scripts/restore.mjs <Sicherungsverzeichnis> [--yes]");
  process.exit(1);
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(quelle, "MANIFEST.json"), "utf-8"));
  let fehler = 0;
  for (const f of manifest.files) {
    const p = path.join(quelle, f.path);
    try {
      const h = crypto.createHash("sha256").update(await fs.readFile(p)).digest("hex");
      if (h !== f.sha256) {
        console.error(`❌ Prüfsumme stimmt nicht: ${f.path}`);
        fehler++;
      }
    } catch {
      console.error(`❌ Datei fehlt: ${f.path}`);
      fehler++;
    }
  }
  if (fehler) {
    console.error(`Sicherung ist unvollständig oder verändert (${fehler} Abweichungen) — abgebrochen.`);
    process.exit(1);
  }
  console.log(`✅ Sicherung vom ${manifest.createdAt} ist vollständig (${manifest.files.length} Dateien).`);
  console.log("Datensätze laut Sicherung:", JSON.stringify(manifest.counts));
  if (!JA) {
    console.log(`\nTrockenlauf. Zum Wiederherstellen nach ${DATA_DIR}: erneut mit --yes aufrufen.`);
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const vorher = `${DATA_DIR}.pre-restore-${stamp}`;
  let gesichert = true;
  await fs.cp(DATA_DIR, vorher, { recursive: true }).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    gesichert = false; // Datenverzeichnis existierte noch nicht: nichts zu sichern
  });
  console.log(gesichert ? `Aktueller Stand gesichert nach ${vorher}` : "Kein bestehender Datenstand vorhanden (nichts vorab zu sichern).");
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.copyFile(path.join(quelle, "db.json"), path.join(DATA_DIR, "db.json"));
  await fs.rm(path.join(DATA_DIR, "uploads"), { recursive: true, force: true });
  await fs.cp(path.join(quelle, "uploads"), path.join(DATA_DIR, "uploads"), { recursive: true }).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  console.log("✅ Wiederherstellung abgeschlossen. App neu starten und Stichproben prüfen.");
}

main().catch((err) => {
  console.error("❌ Wiederherstellung fehlgeschlagen:", err.message);
  process.exit(1);
});
