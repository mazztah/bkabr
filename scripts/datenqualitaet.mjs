#!/usr/bin/env node
// ============================================================================
// Datenqualitätsprüfung für data/db.json (Testmigration und Abnahme, MIG-004)
// ============================================================================
// Aufruf:  node scripts/datenqualitaet.mjs [Pfad/zur/db.json]   (Standard: $DATA_DIR/db.json)
// Ausgabe: Zählwerte je Sammlung und eine Liste der Auffälligkeiten. Exit-Code 1, wenn Fehler gefunden wurden.
// Geprüft werden Referenzen (verwaiste Datensätze), Dubletten (Nummern, Flurstück, Zählernummer) und Zeiträume.

import { readFile } from "fs/promises";
import path from "path";

const datei = process.argv[2] || path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "db.json");
const db = JSON.parse(await readFile(datei, "utf-8"));
const liste = (k) => (Array.isArray(db[k]) ? db[k] : []);
const ids = (k) => new Set(liste(k).map((x) => x.id));
const fehler = [];
const hinweise = [];

function referenz(sammlung, feld, ziel, { optional = false } = {}) {
  const gueltig = ids(ziel);
  for (const x of liste(sammlung)) {
    const v = x[feld];
    if (v === undefined || v === null || v === "") {
      if (!optional) fehler.push(`${sammlung} ${x.nummer || x.id}: ${feld} fehlt`);
      continue;
    }
    if (!gueltig.has(v)) fehler.push(`${sammlung} ${x.nummer || x.id}: ${feld} verweist auf nicht vorhandenes ${ziel} (${v})`);
  }
}

function dubletten(sammlung, schluessel, beschreibung) {
  const gesehen = new Map();
  for (const x of liste(sammlung)) {
    const k = schluessel(x);
    if (k === null) continue;
    if (gesehen.has(k)) fehler.push(`${sammlung}: Dublette ${beschreibung(x)} (${gesehen.get(k)} und ${x.nummer || x.id})`);
    else gesehen.set(k, x.nummer || x.id);
  }
}

// Referenzen
referenz("gebaeude", "liegenschaftId", "liegenschaften");
referenz("wohnungen", "gebaeudeId", "gebaeude");
referenz("mieter", "wohnungId", "wohnungen");
referenz("mietvertraege", "wohnungId", "wohnungen");
referenz("mietvertraege", "mieterId", "mieter", { optional: true });
referenz("flurstuecke", "liegenschaftId", "liegenschaften");
referenz("grundbuchEintraege", "flurstueckId", "flurstuecke");
referenz("vertraege", "liegenschaftId", "liegenschaften", { optional: true });
referenz("vertraege", "flurstueckId", "flurstuecke", { optional: true });
referenz("anlagen", "liegenschaftId", "liegenschaften");
referenz("anlagen", "gebaeudeId", "gebaeude", { optional: true });
referenz("anlagenWartungen", "anlageId", "anlagen");
referenz("raeume", "gebaeudeId", "gebaeude");
referenz("zaehler", "liegenschaftId", "liegenschaften");
referenz("zaehler", "gebaeudeId", "gebaeude", { optional: true });
referenz("zaehler", "wohnungId", "wohnungen", { optional: true });
referenz("zaehlerAblesungen", "zaehlerId", "zaehler");
referenz("veranstaltungsflaechen", "liegenschaftId", "liegenschaften");
referenz("reservierungen", "veranstaltungsflaecheId", "veranstaltungsflaechen");
referenz("tickets", "liegenschaftId", "liegenschaften", { optional: true });
referenz("tickets", "gebaeudeId", "gebaeude", { optional: true });
referenz("tickets", "wohnungId", "wohnungen", { optional: true });
referenz("tickets", "handwerkerId", "handwerker", { optional: true });

// Dubletten
for (const s of ["liegenschaften", "gebaeude", "wohnungen", "mieter", "flurstuecke", "vertraege", "anlagen", "zaehler", "raeume", "tickets"]) {
  dubletten(s, (x) => x.nummer || null, (x) => `Nummer ${x.nummer}`);
}
dubletten("flurstuecke", (x) => `${x.liegenschaftId}|${x.gemarkung}|${x.flur}|${x.flurstueckNummer}`.toLowerCase(), (x) => `Flurstück ${x.gemarkung} Flur ${x.flur} Nr. ${x.flurstueckNummer}`);
dubletten("zaehler", (x) => `${x.art}|${String(x.zaehlernummer || "").trim().toLowerCase()}`, (x) => `Zähler ${x.art} ${x.zaehlernummer}`);
dubletten("zaehlerAblesungen", (x) => `${x.zaehlerId}|${String(x.ablesedatum || "").slice(0, 10)}`, (x) => `Ablesung ${x.ablesedatum}`);

// Zeiträume und Pflichtangaben
for (const v of liste("vertraege")) {
  if (!v.unbefristet && v.ende && v.beginn && new Date(v.ende) < new Date(v.beginn)) fehler.push(`vertraege ${v.nummer || v.id}: Ende liegt vor Beginn`);
}
for (const r of liste("reservierungen")) {
  if (new Date(r.ende) <= new Date(r.beginn)) fehler.push(`reservierungen ${r.nummer || r.id}: Ende liegt nicht nach Beginn`);
}
for (const f of liste("flurstuecke")) {
  if (typeof f.flaecheQm === "number" && f.flaecheQm < 0) fehler.push(`flurstuecke ${f.nummer || f.id}: negative Fläche`);
}
for (const g of liste("grundbuchEintraege")) {
  if (!g.eingetragenAm) fehler.push(`grundbuchEintraege ${g.id}: eingetragenAm fehlt`);
}
// Zählerstände dürfen nicht sinken (Hinweis, kein Fehler: Zählerwechsel)
const nachZaehler = new Map();
for (const a of liste("zaehlerAblesungen")) nachZaehler.set(a.zaehlerId, [...(nachZaehler.get(a.zaehlerId) || []), a]);
for (const [zid, arr] of nachZaehler) {
  arr.sort((a, b) => String(a.ablesedatum).localeCompare(String(b.ablesedatum)));
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].stand < arr[i - 1].stand) hinweise.push(`zaehlerAblesungen: Zähler ${zid}: Stand sinkt am ${String(arr[i].ablesedatum).slice(0, 10)}`);
  }
}

console.log(`Datenqualität: ${datei}\n`);
console.log("Datensätze je Sammlung:");
for (const [k, v] of Object.entries(db)) if (Array.isArray(v)) console.log(`  ${k.padEnd(24)} ${v.length}`);
console.log(`\n${fehler.length} Fehler, ${hinweise.length} Hinweise`);
for (const f of fehler.slice(0, 200)) console.log(`  FEHLER  ${f}`);
for (const h of hinweise.slice(0, 100)) console.log(`  HINWEIS ${h}`);
if (fehler.length > 200) console.log(`  … ${fehler.length - 200} weitere Fehler`);
process.exit(fehler.length ? 1 : 0);
