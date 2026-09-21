#!/usr/bin/env node
// ============================================================================
// Migration Fachmodule: data/db.json → Supabase (Slice 1: Flurstücke + Grundbuch)
// ============================================================================
// Voraussetzung:
//   1. schema.sql, schema_business.sql, schema_auth.sql, schema_fachmodule.sql ausgeführt
//   2. `npm run migrate:supabase` gelaufen (Liegenschaften müssen in Supabase
//      existieren — sie sind per Fremdschlüssel referenziert)
//
// Aufruf:
//   node --env-file=.env.local scripts/migrate-fachmodule.mjs [--dry-run] [--only=flurstuecke,grundbuch]
//
// Verhalten:
//   - Idempotent (upsert auf id), beliebig wiederholbar.
//   - Datensätze mit verwaisten Referenzen (Liegenschaft/Flurstück fehlt in
//     Supabase) werden VOR dem Schreiben erkannt und mit Grund gemeldet.
//   - Dubletten (gleiche Liegenschaft/Gemarkung/Flur/Nummer) verletzen den
//     UNIQUE-Constraint und landen in der Fehlerliste, statt die Migration zu stoppen.
//   - Zähler FL-*/GB-* werden nur angehoben, nie abgesenkt.
//   - Fehlerbericht: migration-fachmodule-errors.json im Projektroot.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",")) : new Set(["flurstuecke", "grundbuch"]);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (Service-Role-Key).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const clean = (v) => (v === undefined || v === "" ? null : v);
const dateOnly = (v) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const report = { migrated: {}, skipped: [], errors: [] };

async function upsertBatch(table, rows, batchSize = 200) {
  if (!rows.length) {
    report.migrated[table] = 0;
    return;
  }
  if (DRY_RUN) {
    console.log(`[dry-run] ${table}: ${rows.length} Zeilen würden geschrieben`);
    report.migrated[table] = rows.length;
    return;
  }
  let ok = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (!error) {
      ok += batch.length;
      continue;
    }
    for (const row of batch) {
      const { error: rowError } = await supabase.from(table).upsert([row], { onConflict: "id" });
      if (rowError) report.errors.push({ table, id: row.id, message: rowError.message });
      else ok += 1;
    }
  }
  report.migrated[table] = ok;
  console.log(`✅ ${table}: ${ok}/${rows.length} Zeilen migriert`);
}

/** Welche der IDs existieren in Supabase? (blockweise, URL-Länge) */
async function existingIds(table, ids) {
  const found = new Set();
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 150) {
    const chunk = uniq.slice(i, i + 150);
    const { data, error } = await supabase.from(table).select("id").in("id", chunk);
    if (error) throw new Error(`${table} lesen fehlgeschlagen: ${error.message}`);
    for (const r of data || []) found.add(r.id);
  }
  return found;
}

async function raiseCounters(counters, prefixes) {
  const rows = Object.entries(counters || {}).filter(([k]) => prefixes.some((p) => k.startsWith(p)));
  if (!rows.length) return;
  for (const [key, value] of rows) {
    if (DRY_RUN) {
      console.log(`[dry-run] counter ${key} → mind. ${value}`);
      continue;
    }
    const { data } = await supabase.from("counters").select("value").eq("key", key).maybeSingle();
    if (!data || data.value < value) {
      const { error } = await supabase.from("counters").upsert([{ key, value }], { onConflict: "key" });
      if (error) report.errors.push({ table: "counters", id: key, message: error.message });
    }
  }
}

async function main() {
  console.log(`Lese ${DB_FILE} …${DRY_RUN ? " (dry-run)" : ""}`);
  const db = JSON.parse(await readFile(DB_FILE, "utf-8"));

  const geplanteFlurstuecke = new Set(); // für den Dry-Run: was würde nach Supabase gelangen
  const flurstuecke = db.flurstuecke || [];
  if (ONLY.has("flurstuecke")) {
    const lgIds = await existingIds("liegenschaften", flurstuecke.map((f) => f.liegenschaftId));
    const gueltig = [];
    for (const f of flurstuecke) {
      if (!lgIds.has(f.liegenschaftId)) {
        report.skipped.push({ table: "flurstuecke", id: f.id, grund: `Liegenschaft ${f.liegenschaftId} fehlt in Supabase` });
      } else gueltig.push(f);
    }
    gueltig.forEach((f) => geplanteFlurstuecke.add(f.id));
    await upsertBatch(
      "flurstuecke",
      gueltig.map((f) => ({
        id: f.id,
        nummer: clean(f.nummer),
        liegenschaft_id: f.liegenschaftId,
        gemarkung: f.gemarkung,
        flur: f.flur,
        flurstueck_nummer: f.flurstueckNummer,
        wirtschaftsart: f.wirtschaftsart || "Gebäude- und Freifläche",
        flaeche_qm: clean(f.flaecheQm),
        grundbuchblatt: clean(f.grundbuchblatt),
        grundbuchamt: clean(f.grundbuchamt),
        lage: clean(f.lage),
        veranstaltungsfreigabe: !!f.veranstaltungsfreigabe,
        kostenstelle: clean(f.kostenstelle),
        innenauftrag: clean(f.innenauftrag),
        notizen: clean(f.notizen),
        created_at: f.createdAt,
        updated_at: f.updatedAt,
      }))
    );

    const anhaenge = [];
    for (const f of gueltig) {
      for (const a of f.anhaenge || []) {
        anhaenge.push({
          id: a.id,
          parent_typ: "flurstueck",
          parent_id: f.id,
          typ: a.typ,
          datei_name: a.dateiName,
          stored_file_name: a.storedFileName,
          mime_type: a.mimeType,
          hochgeladen_am: a.hochgeladenAm,
          extrakt_text: clean(a.extraktText),
          notizen: clean(a.notizen),
        });
      }
    }
    await upsertBatch("fach_anhaenge", anhaenge);
    await raiseCounters(db.counters, ["FL-"]);
  }

  if (ONLY.has("grundbuch")) {
    const eintraege = db.grundbuchEintraege || [];
    // Flurstücke, die (jetzt) in Supabase liegen
    const fsIds = await existingIds("flurstuecke", eintraege.map((e) => e.flurstueckId));
    if (DRY_RUN) geplanteFlurstuecke.forEach((id) => fsIds.add(id));
    const gueltig = [];
    for (const e of eintraege) {
      if (!fsIds.has(e.flurstueckId)) {
        report.skipped.push({ table: "grundbuch_eintraege", id: e.id, grund: `Flurstück ${e.flurstueckId} fehlt in Supabase` });
      } else gueltig.push(e);
    }
    await upsertBatch(
      "grundbuch_eintraege",
      gueltig.map((e) => ({
        id: e.id,
        flurstueck_id: e.flurstueckId,
        abteilung: e.abteilung,
        lfd_nummer: e.lfdNummer || "",
        art: e.art,
        berechtigter: e.berechtigter,
        betrag: clean(e.betrag),
        waehrung: clean(e.waehrung),
        beschreibung: clean(e.beschreibung),
        eingetragen_am: dateOnly(e.eingetragenAm),
        quelle: clean(e.quelle),
        geloescht_am: dateOnly(e.geloeschtAm),
        geloescht_grund: clean(e.geloeschtGrund),
        notizen: clean(e.notizen),
        created_at: e.createdAt,
        updated_at: e.updatedAt,
      }))
    );
    await raiseCounters(db.counters, ["GB-"]);
  }

  console.log("\n=== Migration Fachmodule abgeschlossen ===");
  console.log(JSON.stringify(report.migrated, null, 2));
  if (report.skipped.length) console.log(`\n⚠️  ${report.skipped.length} Datensätze übersprungen (verwaiste Referenz).`);
  if (report.errors.length) console.log(`⚠️  ${report.errors.length} Zeilen mit Fehler (z. B. Dubletten).`);
  if (report.skipped.length || report.errors.length) {
    const p = path.join(process.cwd(), "migration-fachmodule-errors.json");
    await writeFile(p, JSON.stringify({ skipped: report.skipped, errors: report.errors }, null, 2), "utf-8");
    console.log(`Vollständige Liste: ${p}`);
  } else {
    console.log("\n✅ Keine Fehler.");
  }
}

main().catch((err) => {
  console.error("❌ Migration fehlgeschlagen:", err);
  process.exit(1);
});
