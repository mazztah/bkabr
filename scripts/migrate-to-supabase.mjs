#!/usr/bin/env node
// ============================================================================
// Migration: data/db.json (bzw. $DATA_DIR/db.json) → Supabase Postgres
// ============================================================================
// Voraussetzung: supabase/schema.sql UND supabase/schema_business.sql wurden
// bereits im Supabase SQL Editor ausgeführt.
//
// Aufruf:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs
//   # oder mit .env.local (Node 20.6+):
//   node --env-file=.env.local scripts/migrate-to-supabase.mjs
//
// Flags:
//   --dry-run   Nur zählen/validieren, nichts schreiben
//
// Idempotent: nutzt upsert (onConflict: "id"), kann beliebig oft erneut
// laufen (z.B. nach erneutem Export), ohne Duplikate zu erzeugen. IDs werden
// 1:1 aus der JSON-Datei übernommen (App nutzt bereits crypto.randomUUID()).
//
// Fehlerverhalten: bricht NICHT beim ersten kaputten Datensatz ab. Jeder
// Batch, der fehlschlägt, wird zeilenweise wiederholt; Zeilen, die auch
// einzeln fehlschlagen (z.B. verwaiste Foreign Keys durch inkonsistente
// Alt-Daten), werden übersprungen und am Ende gesammelt ausgegeben.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (Service-Role-Key, NICHT der anon key)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/** '' und undefined -> null, sonst Wert durchreichen (Postgres mag keine leeren Strings in numeric/date-Spalten). */
function clean(v) {
  if (v === undefined || v === "") return null;
  return v;
}

function mapRows(rows, mapper) {
  return (rows || []).map(mapper).filter(Boolean);
}

const report = { migrated: {}, skipped: [], errors: [] };

/**
 * Upsert in Batches; bei Batch-Fehler zeilenweise Fallback, damit einzelne
 * kaputte Datensätze nicht die ganze Migration stoppen.
 */
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
    // Batch fehlgeschlagen -> zeilenweise, um die kaputte(n) Zeile(n) zu isolieren
    for (const row of batch) {
      const { error: rowError } = await supabase.from(table).upsert([row], { onConflict: "id" });
      if (rowError) {
        report.errors.push({ table, id: row.id, message: rowError.message });
      } else {
        ok += 1;
      }
    }
  }
  report.migrated[table] = ok;
  console.log(`✅ ${table}: ${ok}/${rows.length} Zeilen migriert`);
}

async function main() {
  console.log(`Lese ${DB_FILE} …`);
  const raw = await readFile(DB_FILE, "utf-8");
  const db = JSON.parse(raw);

  // -------------------- 1. Stammdaten-Hierarchie --------------------

  await upsertBatch(
    "liegenschaften",
    mapRows(db.liegenschaften, (l) => ({
      id: l.id,
      nummer: clean(l.nummer),
      name: l.name,
      strasse: l.strasse,
      hausnummer: l.hausnummer,
      plz: l.plz,
      ort: l.ort,
      grundstuecksflaeche: clean(l.grundstuecksflaeche),
      flurstueck: clean(l.flurstueck),
      notizen: clean(l.notizen),
      status: l.status || "aktiv",
      created_at: l.createdAt,
      updated_at: l.updatedAt,
    }))
  );

  await upsertBatch(
    "gebaeude",
    mapRows(db.gebaeude, (g) => ({
      id: g.id,
      nummer: clean(g.nummer),
      liegenschaft_id: g.liegenschaftId,
      name: g.name,
      baujahr: clean(g.baujahr),
      anzahl_einheiten: clean(g.anzahlEinheiten),
      heizungsart: clean(g.heizungsart),
      notizen: clean(g.notizen),
      status: g.status || "aktiv",
      created_at: g.createdAt,
      updated_at: g.updatedAt,
    }))
  );

  await upsertBatch(
    "wohnungen",
    mapRows(db.wohnungen, (w) => ({
      id: w.id,
      nummer: clean(w.nummer),
      gebaeude_id: w.gebaeudeId,
      bezeichnung: w.bezeichnung,
      typ: w.typ,
      flaeche: clean(w.flaeche),
      zimmer: clean(w.zimmer),
      miteigentumsanteil: clean(w.miteigentumsanteil),
      notizen: clean(w.notizen),
      status: w.status || "aktiv",
      created_at: w.createdAt,
      updated_at: w.updatedAt,
    }))
  );

  await upsertBatch(
    "mieter",
    mapRows(db.mieter, (m) => ({
      id: m.id,
      nummer: clean(m.nummer),
      wohnung_id: m.wohnungId,
      name: m.name,
      email: clean(m.email),
      telefon: clean(m.telefon),
      mietbeginn: clean(m.mietbeginn),
      mietende: clean(m.mietende),
      kaltmiete: clean(m.kaltmiete),
      nebenkosten_vorauszahlung: clean(m.nebenkostenVorauszahlung),
      notizen: clean(m.notizen),
      status: m.status || "aktiv",
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    }))
  );

  const sollIstRows = [];
  const mietkontoRows = [];
  for (const m of db.mieter || []) {
    for (const s of m.sollIst || []) {
      sollIstRows.push({
        id: s.id,
        mieter_id: m.id,
        jahr: s.jahr,
        soll_vorauszahlung: s.sollVorauszahlung,
        ist_zahlungen: s.istZahlungen,
        notiz: clean(s.notiz),
      });
    }
    for (const k of m.mietkonto || []) {
      mietkontoRows.push({
        id: k.id,
        mieter_id: m.id,
        datum: k.datum,
        typ: k.typ,
        soll: k.soll,
        ist: k.ist,
        text: clean(k.text),
      });
    }
  }
  await upsertBatch("mieter_soll_ist", sollIstRows);
  await upsertBatch("mieter_mietkonto", mietkontoRows);

  await upsertBatch(
    "mietvertraege",
    mapRows(db.mietvertraege, (v) => ({
      id: v.id,
      nummer: clean(v.nummer),
      wohnung_id: v.wohnungId,
      mieter_id: clean(v.mieterId),
      datei_name: v.dateiName,
      stored_file_name: clean(v.storedFileName),
      mime_type: v.mimeType,
      hochgeladen_am: v.hochgeladenAm,
      soll_miete: clean(v.sollMiete),
      nebenkosten_vorauszahlung: clean(v.nebenkostenVorauszahlung),
      bk_vorauszahlung: clean(v.bkVorauszahlung),
      hk_vorauszahlung: clean(v.hkVorauszahlung),
      warmmiete: clean(v.warmmiete),
      kaution: clean(v.kaution),
      mietbeginn: clean(v.mietbeginn),
      mietende: clean(v.mietende),
      flaeche: clean(v.flaeche),
      zimmer: clean(v.zimmer),
      status: v.status,
      extrakt_text: clean(v.extraktText),
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    }))
  );

  // -------------------- 2. Eigentümer & PM-Verträge --------------------

  await upsertBatch(
    "eigentuemer",
    mapRows(db.eigentuemer, (e) => ({
      id: e.id,
      nummer: clean(e.nummer),
      liegenschaft_id: e.liegenschaftId,
      name: e.name,
      anschrift: clean(e.anschrift),
      email: clean(e.email),
      telefon: clean(e.telefon),
      miteigentumsanteil: clean(e.miteigentumsanteil),
      vollmacht_von: clean(e.vollmachtVon),
      vollmacht_bis: clean(e.vollmachtBis),
      datei_name: clean(e.dateiName),
      stored_file_name: clean(e.storedFileName),
      mime_type: clean(e.mimeType),
      extrakt_text: clean(e.extraktText),
      notizen: clean(e.notizen),
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    }))
  );

  await upsertBatch(
    "pm_vertraege",
    mapRows(db.pmVertraege, (p) => ({
      id: p.id,
      nummer: clean(p.nummer),
      liegenschaft_id: p.liegenschaftId,
      datei_name: p.dateiName,
      stored_file_name: clean(p.storedFileName),
      mime_type: p.mimeType,
      hochgeladen_am: p.hochgeladenAm,
      verwalter_name: clean(p.verwalterName),
      auftraggeber_name: clean(p.auftraggeberName),
      honorar_modell: clean(p.honorarModell),
      honorar_satz: clean(p.honorarSatz),
      leistungsumfang: clean(p.leistungsumfang),
      laufzeit_beginn: clean(p.laufzeitBeginn),
      laufzeit_ende: clean(p.laufzeitEnde),
      kuendigungsfrist: clean(p.kuendigungsfrist),
      status: p.status,
      extrakt_text: clean(p.extraktText),
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }))
  );

  const anhaengeRows = [];
  const collectAnhaenge = (parentTyp, items) => {
    for (const parent of items || []) {
      for (const a of parent.anhaenge || []) {
        anhaengeRows.push({
          id: a.id,
          parent_typ: parentTyp,
          parent_id: parent.id,
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
  };
  collectAnhaenge("mietvertrag", db.mietvertraege);
  collectAnhaenge("eigentuemer", db.eigentuemer);
  collectAnhaenge("pm_vertrag", db.pmVertraege);
  await upsertBatch("anhaenge", anhaengeRows);

  // -------------------- 3. Abrechnungen --------------------

  await upsertBatch(
    "abrechnungen",
    mapRows(db.abrechnungen, (a) => ({
      id: a.id,
      nummer: clean(a.nummer),
      name: a.name,
      adresse: a.adresse,
      objekt_typ: a.objektTyp,
      zeitraum: a.zeitraum,
      gesamt_summe: a.gesamtSumme || 0,
      status: a.status,
      version: a.version || 1,
      liegenschaft_id: clean(a.liegenschaftId),
      gebaeude_id: clean(a.gebaeudeId),
      wohnung_id: clean(a.wohnungId),
      vermieter_name: clean(a.vermieterName),
      vermieter_anschrift: clean(a.vermieterAnschrift),
      verwalter_kontakt: clean(a.verwalterKontakt),
      mieter_name: clean(a.mieterName),
      mieter_anschrift: clean(a.mieterAnschrift),
      nutzungszeitraum: clean(a.nutzungszeitraum),
      mieteinnahmen: a.workspace?.mieteinnahmen || 0,
      nebenkosten: a.workspace?.nebenkosten || 0,
      vorauszahlungen: clean(a.workspace?.vorauszahlungen),
      abrechnungstext: clean(a.workspace?.abrechnungstext),
      anschreiben: clean(a.workspace?.anschreiben),
      chat: a.chat || [],
      history: a.history || [],
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }))
  );

  const positionenRows = [];
  const dokumenteRows = [];
  for (const a of db.abrechnungen || []) {
    (a.workspace?.positionen || []).forEach((pos, idx) => {
      positionenRows.push({
        id: pos.id,
        abrechnung_id: a.id,
        name: pos.name,
        betrag: pos.betrag || 0,
        beschreibung: clean(pos.beschreibung),
        gesamtkosten: clean(pos.gesamtkosten),
        umlageschluessel: clean(pos.umlageschluessel),
        sortierung: idx,
      });
    });
    for (const d of a.dokumente || []) {
      dokumenteRows.push({
        id: d.id,
        abrechnung_id: a.id,
        nummer: clean(d.nummer),
        name: d.name,
        mime_type: d.mimeType,
        size: d.size || 0,
        uploaded_at: d.uploadedAt,
        extrakt_text: clean(d.extraktText),
        stored_file_name: clean(d.storedFileName),
        rechnungsnummer: clean(d.rechnungsnummer),
        rechnungsdatum: clean(d.rechnungsdatum),
        betrag: clean(d.betrag),
        leistungsart: clean(d.leistungsart),
        leistungsort: clean(d.leistungsort),
        auftraggeber: clean(d.auftraggeber),
        auftragnehmer: clean(d.auftragnehmer),
        firma: clean(d.firma),
        rechnungsadresse: clean(d.rechnungsadresse),
        pruefung: d.pruefung || null,
      });
    }
  }
  await upsertBatch("abrechnung_positionen", positionenRows);
  await upsertBatch("abrechnung_dokumente", dokumenteRows);

  // -------------------- 4. Kontoauszüge & Ablage --------------------

  await upsertBatch(
    "kontoauszuege",
    mapRows(db.kontoauszuege, (k) => ({
      id: k.id,
      nummer: clean(k.nummer),
      liegenschaft_id: clean(k.liegenschaftId),
      datei_name: k.dateiName,
      stored_file_name: clean(k.storedFileName),
      mime_type: k.mimeType,
      hochgeladen_am: k.hochgeladenAm,
      zeitraum: clean(k.zeitraum),
      anzahl_transaktionen: k.anzahlTransaktionen || 0,
      gebuchte_transaktionen: k.gebuchteTransaktionen || 0,
      extrakt_text: clean(k.extraktText),
      created_at: k.createdAt,
      updated_at: k.updatedAt,
    }))
  );

  await upsertBatch(
    "ablage",
    mapRows(db.ablage, (d) => ({
      id: d.id,
      nummer: clean(d.nummer),
      datei_name: d.dateiName,
      stored_file_name: d.storedFileName,
      mime_type: d.mimeType,
      groesse: d.groesse || 0,
      hochgeladen_am: d.hochgeladenAm,
      status: d.status,
      erkannter_typ: clean(d.erkannterTyp),
      konfidenz: clean(d.konfidenz),
      zugeordnet_an: d.zugeordnetAn || null,
      extrakt_text: clean(d.extraktText),
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    }))
  );

  // -------------------- 5. System-Log & Prüfung --------------------

  await upsertBatch(
    "system_log",
    mapRows(db.systemLog, (s) => ({
      id: s.id,
      zeitpunkt: s.zeitpunkt,
      typ: s.typ,
      text: s.text,
      bezug: s.bezug || null,
    }))
  );

  await upsertBatch(
    "pruef_laeufe",
    mapRows(db.pruefLaeufe, (p) => ({
      id: p.id,
      nummer: clean(p.nummer),
      gestartet_am: p.gestartetAm,
      abgeschlossen_am: clean(p.abgeschlossenAm),
      modul_status: p.modulStatus || {},
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }))
  );

  const befundeRows = [];
  for (const p of db.pruefLaeufe || []) {
    for (const b of p.befunde || []) {
      befundeRows.push({
        id: b.id,
        pruef_lauf_id: p.id,
        modul: b.modul,
        schweregrad: b.schweregrad,
        titel: b.titel,
        beschreibung: b.beschreibung,
        betroffene: b.betroffene || [],
        link_href: clean(b.linkHref),
        kontext: b.kontext || null,
        vorschlag: b.vorschlag || null,
        status: b.status || "offen",
      });
    }
  }
  await upsertBatch("pruef_befunde", befundeRows);

  // -------------------- 6. Agent-Schedules --------------------

  await upsertBatch(
    "agent_schedules",
    mapRows(db.agentSchedules, (a) => ({
      id: a.id,
      nummer: clean(a.nummer),
      name: a.name,
      prompt: a.prompt,
      recurrence: a.recurrence,
      aktiv: a.aktiv !== false,
      liegenschaft_id: clean(a.liegenschaftId),
      liegenschaft_name: clean(a.liegenschaftName),
      next_run_at: a.nextRunAt,
      last_run_at: clean(a.lastRunAt),
      historie: a.historie || [],
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }))
  );

  // -------------------- 7. Buchhaltung --------------------

  await upsertBatch(
    "konten",
    mapRows(db.konten, (k) => ({
      id: k.id,
      nummer: clean(k.nummer),
      name: k.name,
      art: k.art,
      kategorie: k.kategorie,
      saldo: k.saldo || 0,
      notizen: clean(k.notizen),
      created_at: k.createdAt,
      updated_at: k.updatedAt,
    }))
  );

  await upsertBatch(
    "abrechnungskreise",
    mapRows(db.abrechnungskreise, (a) => ({
      id: a.id,
      nummer: clean(a.nummer),
      name: a.name,
      beschreibung: clean(a.beschreibung),
      umlageschluessel: a.umlageschluessel,
      liegenschaft_id: clean(a.liegenschaftId),
      wohnung_ids: a.wohnungIds || null,
      ist_standard: !!a.istStandard,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }))
  );

  // Buchungen: erst ohne die selbstreferenzierenden Storno-Felder (Pass 1),
  // damit die FK-Reihenfolge egal ist, dann per Update nachziehen (Pass 2).
  await upsertBatch(
    "buchungen",
    mapRows(db.buchungen, (b) => ({
      id: b.id,
      nummer: clean(b.nummer),
      datum: b.datum,
      typ: b.typ,
      kategorie: b.kategorie,
      betrag: b.betrag,
      beschreibung: clean(b.beschreibung),
      liegenschaft_id: clean(b.liegenschaftId),
      beleg_typ: clean(b.belegTyp),
      beleg_id: clean(b.belegId),
      beleg_freitext: clean(b.belegFreitext),
      rechnungsdaten: b.rechnungsdaten || null,
      abrechnungskreis_id: clean(b.abrechnungskreisId),
      storniert: !!b.storniert,
      ist_storno_buchung: !!b.istStornoBuchung,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
    }))
  );
  if (!DRY_RUN) {
    for (const b of db.buchungen || []) {
      if (!b.storniertDurchBuchungId && !b.storniertVonBuchungId) continue;
      await supabase
        .from("buchungen")
        .update({
          storniert_durch_buchung_id: clean(b.storniertDurchBuchungId),
          storniert_von_buchung_id: clean(b.storniertVonBuchungId),
        })
        .eq("id", b.id);
    }
  }

  const aufteilungRows = [];
  for (const b of db.buchungen || []) {
    for (const pos of b.aufteilung || []) {
      aufteilungRows.push({
        buchung_id: b.id,
        wohnung_id: pos.wohnungId,
        wohnung_bezeichnung: clean(pos.wohnungBezeichnung),
        mieter_id: clean(pos.mieterId),
        mieter_name: clean(pos.mieterName),
        anteil: pos.anteil,
        betrag: pos.betrag,
      });
    }
  }
  // Aufteilungspositionen haben keine stabile id in der JSON-Struktur -> reines Insert (nicht idempotent bei mehrfachem Lauf)
  if (aufteilungRows.length && !DRY_RUN) {
    await supabase.from("buchung_aufteilung").delete().neq("buchung_id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("buchung_aufteilung").insert(aufteilungRows);
    if (error) report.errors.push({ table: "buchung_aufteilung", id: "batch", message: error.message });
    else report.migrated["buchung_aufteilung"] = aufteilungRows.length;
  }

  // -------------------- 8. Schriftverkehr --------------------

  await upsertBatch(
    "schriftverkehr",
    mapRows(db.schriftverkehr, (s) => ({
      id: s.id,
      nummer: clean(s.nummer),
      template_id: s.templateId,
      template_label: s.templateLabel,
      mieter_id: s.mieterId,
      mieter_name: s.mieterName,
      wohnung_id: clean(s.wohnungId),
      gebaeude_id: clean(s.gebaeudeId),
      liegenschaft_id: clean(s.liegenschaftId),
      liegenschaft_name: clean(s.liegenschaftName),
      betreff: s.betreff,
      text: s.text,
      werte: s.werte || {},
      status: s.status,
      quelle: s.quelle,
      final_stored_file_name: clean(s.finalStoredFileName),
      final_datei_name: clean(s.finalDateiName),
      finalisiert_am: clean(s.finalisiertAm),
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    }))
  );

  // -------------------- 9. Investoren --------------------

  await upsertBatch(
    "investoren",
    mapRows(db.investoren, (i) => ({
      id: i.id,
      nummer: clean(i.nummer),
      firma: i.firma,
      ansprechpartner_name: clean(i.ansprechpartnerName),
      ansprechpartner_rolle: clean(i.ansprechpartnerRolle),
      email: clean(i.email),
      telefon: clean(i.telefon),
      webseite: clean(i.webseite),
      linkedin_url: clean(i.linkedinUrl),
      xing_url: clean(i.xingUrl),
      land: i.land,
      hub: clean(i.hub),
      sektoren: i.sektoren || [],
      kurzprofil: clean(i.kurzprofil),
      ticke_groesse: clean(i.tickeGroesse),
      sprache: clean(i.sprache),
      quelle: clean(i.quelle),
      quelle_datum: clean(i.quelleDatum),
      status: i.status,
      score: clean(i.score),
      kriterien_ergebnis: i.kriterienErgebnis || [],
      notizen: clean(i.notizen),
      created_at: i.createdAt,
      updated_at: i.updatedAt,
    }))
  );

  await upsertBatch(
    "investor_anschreiben",
    mapRows(db.investorAnschreiben, (a) => ({
      id: a.id,
      nummer: clean(a.nummer),
      investor_id: a.investorId,
      investor_firma: a.investorFirma,
      betreff: a.betreff,
      text: a.text,
      status: a.status,
      quelle: a.quelle,
      final_stored_file_name: clean(a.finalStoredFileName),
      final_datei_name: clean(a.finalDateiName),
      finalisiert_am: clean(a.finalisiertAm),
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }))
  );

  await upsertBatch(
    "investor_strategie_berichte",
    mapRows(db.investorStrategieBerichte, (b) => ({
      id: b.id,
      nummer: clean(b.nummer),
      investor_id: b.investorId,
      investor_firma: b.investorFirma,
      wirtschaftliche_ziele: clean(b.wirtschaftlicheZiele),
      zusammenfassung: b.zusammenfassung,
      punkte: b.punkte || [],
      created_at: b.createdAt,
      updated_at: b.updatedAt,
    }))
  );

  // -------------------- 10. Kalender & Team --------------------

  await upsertBatch(
    "kalender_ereignisse",
    mapRows(db.kalenderEreignisse, (k) => ({
      id: k.id,
      titel: k.titel,
      beschreibung: clean(k.beschreibung),
      datum: k.datum,
      datum_ende: clean(k.datumEnde),
      ganztaegig: !!k.ganztaegig,
      kategorie: k.kategorie,
      liegenschaft_id: clean(k.liegenschaftId),
      dokument_ids: k.dokumentIds || [],
      erstellt_von: clean(k.erstelltVon),
      created_at: k.createdAt,
      updated_at: k.updatedAt,
    }))
  );

  await upsertBatch(
    "team_nachrichten",
    mapRows(db.teamNachrichten, (t) => ({
      id: t.id,
      autor_name: t.autorName,
      text: t.text,
      emoji: clean(t.emoji),
      liegenschaft_id: clean(t.liegenschaftId),
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }))
  );

  // -------------------- 11. Zähler & Settings --------------------

  const counterRows = Object.entries(db.counters || {}).map(([key, value]) => ({ key, value }));
  await upsertBatch("counters", counterRows);

  if (db.observabilityMeta && !DRY_RUN) {
    await supabase
      .from("app_settings")
      .upsert([{ key: "observability_meta", value: db.observabilityMeta }], { onConflict: "key" });
  }

  // -------------------- 12. Observability --------------------

  await upsertBatch(
    "ai_usage_log",
    mapRows(db.aiUsageLog, (l) => ({
      id: l.id,
      zeitpunkt: l.zeitpunkt,
      provider: l.provider,
      model: l.model,
      fallback_stufe: l.fallbackStufe || 0,
      prompt_tokens: l.promptTokens || 0,
      completion_tokens: l.completionTokens || 0,
      total_tokens: l.totalTokens || 0,
      exakt: l.exakt !== false,
      geschaetzte_kosten_usd: l.geschaetzteKostenUsd || 0,
    }))
  );

  await upsertBatch(
    "rate_limit_events",
    mapRows(db.rateLimitEvents, (r) => ({
      id: r.id,
      zeitpunkt: r.zeitpunkt,
      provider: r.provider,
      model: r.model,
      kategorie: r.kategorie,
      limit_wert: clean(r.limit),
      used: clean(r.used),
      requested: clean(r.requested),
      warte_sekunden: clean(r.warteSekunden),
      fallback_to: clean(r.fallbackTo),
      fallback_stufe: clean(r.fallbackStufe),
      gesamte_kette: clean(r.gesamteKette),
    }))
  );

  await upsertBatch(
    "agent_audit",
    mapRows(db.agentAudit, (a) => ({
      id: a.id,
      zeitpunkt: a.zeitpunkt,
      aktion: a.aktion,
      detail: clean(a.detail),
      ergebnis: a.ergebnis,
      kontext: a.kontext || null,
    }))
  );

  const modelHealthRows = Object.entries(db.modelHealth || {}).map(([catalog_id, health]) => ({
    catalog_id,
    health,
  }));
  await upsertBatch("model_health", modelHealthRows);

  // -------------------- Zusammenfassung --------------------

  console.log("\n=== Migration abgeschlossen ===");
  console.log(JSON.stringify(report.migrated, null, 2));
  if (report.errors.length) {
    console.log(`\n⚠️  ${report.errors.length} Zeilen konnten NICHT migriert werden:`);
    console.table(report.errors.slice(0, 50));
    const reportPath = path.join(process.cwd(), "migration-errors.json");
    await writeFile(reportPath, JSON.stringify(report.errors, null, 2), "utf-8");
    console.log(`Vollständige Liste: ${reportPath}`);
  } else {
    console.log("\n✅ Keine Fehler.");
  }
}

main().catch((err) => {
  console.error("❌ Migration fehlgeschlagen:", err);
  process.exit(1);
});
