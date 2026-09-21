// ============================================================================
// Supabase-Backend für die Fachmodule des Pflichtenhefts — Slice 1:
// Flurstücke (LIE-001..005) und Grundbuch (LIE-006/007).
// ============================================================================
// Gleiche Schnittstelle wie makeCrud<T>() in db.ts ({ list, get, create,
// update, remove }); Aktivierung modulweise über DB_SUPABASE_MODULES
// ("flurstuecke", "grundbuch"), Tabellen aus supabase/schema_fachmodule.sql.
//
// Unterschiede zu db-supabase.ts (bewusst):
// - list() paginiert. PostgREST liefert standardmäßig max. 1.000 Zeilen;
//   bei 3.000+ Flurstücken (LIE-001) würde ein einfaches select("*") still
//   abschneiden.
// - Anhänge liegen in fach_anhaenge (parent_typ = 'flurstueck') und werden
//   in Blöcken geladen (.in() mit tausenden IDs sprengt die URL-Länge).
// - Anhänge werden per Diff gespeichert (nicht löschen + neu einfügen), damit
//   Spalten wie version/sensibel/vorgaenger_id erhalten bleiben.
// - Fehler werden geworfen (kein stilles Leerergebnis), wie in db-supabase.ts.

import { requireClient, nextNummerSupabase, set } from "./db-supabase";
import type { Anhang, Flurstueck, GrundbuchEintrag } from "./types";

const PAGE = 1000; // PostgREST-Standardlimit
const IN_CHUNK = 150; // UUIDs je .in()-Abfrage (~5,5 KB URL)

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFn = (q: any) => any;

interface Crud<T> {
  list(filter?: Partial<T>): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  remove(id: string): Promise<boolean>;
}

/** Liest alle Zeilen einer Tabelle seitenweise (stabile Sortierung). */
async function fetchAll(table: string, filters: QueryFn, orderCols: string[]): Promise<Row[]> {
  const sb = requireClient();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = filters(sb.from(table).select("*"));
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`[db-supabase-fach] ${table}.list fehlgeschlagen: ${error.message}`);
    const rows = (data || []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const dateOnly = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : v);

// ---------------------------------------------------------------------------
// Anhänge (fach_anhaenge)
// ---------------------------------------------------------------------------

function anhangFromRow(r: Row): Anhang {
  return {
    id: r.id as string,
    typ: r.typ as Anhang["typ"],
    dateiName: r.datei_name as string,
    storedFileName: r.stored_file_name as string,
    mimeType: r.mime_type as string,
    hochgeladenAm: r.hochgeladen_am as string,
    extraktText: (r.extrakt_text as string) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
  };
}

/** Lädt Anhänge zu einem Elterntyp; ohne parentIds alle (paginiert), sonst blockweise. */
async function fetchAnhaenge(parentTyp: string, parentIds?: string[]): Promise<Map<string, Anhang[]>> {
  const byParent = new Map<string, Anhang[]>();
  const add = (rows: Row[]) => {
    for (const r of rows) {
      const list = byParent.get(r.parent_id as string) || [];
      list.push(anhangFromRow(r));
      byParent.set(r.parent_id as string, list);
    }
  };
  if (parentIds === undefined) {
    add(await fetchAll("fach_anhaenge", (q) => q.eq("parent_typ", parentTyp), ["hochgeladen_am", "id"]));
    return byParent;
  }
  const chunks: string[][] = [];
  for (let i = 0; i < parentIds.length; i += IN_CHUNK) chunks.push(parentIds.slice(i, i + IN_CHUNK));
  const results = await Promise.all(
    chunks.map((ids) =>
      fetchAll("fach_anhaenge", (q) => q.eq("parent_typ", parentTyp).in("parent_id", ids), ["hochgeladen_am", "id"])
    )
  );
  results.forEach(add);
  return byParent;
}

/** Gleicht die Anhänge eines Objekts per Diff ab: Entferntes löschen, Neues/Geändertes upserten. */
async function syncAnhaenge(parentTyp: string, parentId: string, anhaenge: Anhang[]) {
  const sb = requireClient();
  const { data: bestehend, error: readErr } = await sb
    .from("fach_anhaenge")
    .select("id")
    .eq("parent_typ", parentTyp)
    .eq("parent_id", parentId);
  if (readErr) throw new Error(`[db-supabase-fach] fach_anhaenge lesen fehlgeschlagen: ${readErr.message}`);
  const neu = new Set(anhaenge.map((a) => a.id));
  const entfernen = (bestehend || []).map((r) => r.id as string).filter((id) => !neu.has(id));
  if (entfernen.length) {
    const { error } = await sb.from("fach_anhaenge").delete().in("id", entfernen);
    if (error) throw new Error(`[db-supabase-fach] fach_anhaenge löschen fehlgeschlagen: ${error.message}`);
  }
  if (!anhaenge.length) return;
  const rows = anhaenge.map((a) => ({
    id: a.id,
    parent_typ: parentTyp,
    parent_id: parentId,
    typ: a.typ,
    datei_name: a.dateiName,
    stored_file_name: a.storedFileName,
    mime_type: a.mimeType,
    hochgeladen_am: a.hochgeladenAm,
    extrakt_text: a.extraktText ?? null,
    notizen: a.notizen ?? null,
  }));
  const { error } = await sb.from("fach_anhaenge").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`[db-supabase-fach] fach_anhaenge schreiben fehlgeschlagen: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Flurstücke
// ---------------------------------------------------------------------------

const FLURSTUECK_FILTER: Record<string, string> = {
  liegenschaftId: "liegenschaft_id",
  gemarkung: "gemarkung",
  flur: "flur",
  flurstueckNummer: "flurstueck_nummer",
  wirtschaftsart: "wirtschaftsart",
  nummer: "nummer",
};

function flurstueckToRow(f: Partial<Flurstueck>): Row {
  const row: Row = {};
  const o = f as Row;
  if (f.id !== undefined) row.id = f.id;
  set(row, o, "nummer", "nummer");
  set(row, o, "liegenschaftId", "liegenschaft_id");
  set(row, o, "gemarkung", "gemarkung");
  set(row, o, "flur", "flur");
  set(row, o, "flurstueckNummer", "flurstueck_nummer");
  set(row, o, "wirtschaftsart", "wirtschaftsart");
  set(row, o, "flaecheQm", "flaeche_qm");
  set(row, o, "grundbuchblatt", "grundbuchblatt");
  set(row, o, "grundbuchamt", "grundbuchamt");
  set(row, o, "lage", "lage");
  // NOT NULL default false: undefined darf nicht als null geschrieben werden
  if (Object.prototype.hasOwnProperty.call(o, "veranstaltungsfreigabe")) {
    row.veranstaltungsfreigabe = !!f.veranstaltungsfreigabe;
  }
  set(row, o, "kostenstelle", "kostenstelle");
  set(row, o, "innenauftrag", "innenauftrag");
  set(row, o, "notizen", "notizen");
  set(row, o, "createdAt", "created_at");
  set(row, o, "updatedAt", "updated_at");
  return row;
}

function flurstueckFromRow(r: Row, anhaenge: Anhang[]): Flurstueck {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    liegenschaftId: r.liegenschaft_id as string,
    gemarkung: r.gemarkung as string,
    flur: r.flur as string,
    flurstueckNummer: r.flurstueck_nummer as string,
    wirtschaftsart: r.wirtschaftsart as Flurstueck["wirtschaftsart"],
    flaecheQm: (r.flaeche_qm as number) ?? undefined,
    grundbuchblatt: (r.grundbuchblatt as string) ?? undefined,
    grundbuchamt: (r.grundbuchamt as string) ?? undefined,
    lage: (r.lage as string) ?? undefined,
    veranstaltungsfreigabe: (r.veranstaltungsfreigabe as boolean) ?? false,
    kostenstelle: (r.kostenstelle as string) ?? undefined,
    innenauftrag: (r.innenauftrag as string) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    anhaenge: anhaenge.length ? anhaenge : undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export const flurstueckeDb: Crud<Flurstueck> = {
  async list(filter) {
    const rows = await fetchAll(
      "flurstuecke",
      (q) => {
        for (const [k, v] of Object.entries(filter || {})) {
          q = q.eq(FLURSTUECK_FILTER[k] || k, v as string | number | boolean);
        }
        return q;
      },
      ["created_at", "id"]
    );
    // Ohne Filter (oder bei vielen Treffern) alle Flurstück-Anhänge paginiert lesen,
    // sonst blockweise nach ID — beides umgeht das URL-Längenlimit.
    const anhaenge = await fetchAnhaenge("flurstueck", filter && rows.length < PAGE ? rows.map((r) => r.id as string) : undefined);
    return rows.map((r) => flurstueckFromRow(r, anhaenge.get(r.id as string) || []));
  },
  async get(id) {
    const sb = requireClient();
    const { data, error } = await sb.from("flurstuecke").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[db-supabase-fach] flurstuecke.get fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    const anhaenge = await fetchAnhaenge("flurstueck", [id]);
    return flurstueckFromRow(data, anhaenge.get(id) || []);
  },
  async create(item) {
    const nummer = item.nummer || (await nextNummerSupabase("FL"));
    const sb = requireClient();
    const { data, error } = await sb.from("flurstuecke").insert(flurstueckToRow({ ...item, nummer })).select().single();
    if (error) throw new Error(`[db-supabase-fach] flurstuecke.create fehlgeschlagen: ${error.message}`);
    if (item.anhaenge?.length) await syncAnhaenge("flurstueck", data.id, item.anhaenge);
    const anhaenge = await fetchAnhaenge("flurstueck", [data.id]);
    return flurstueckFromRow(data, anhaenge.get(data.id) || []);
  },
  async update(id, patch) {
    const row = flurstueckToRow(patch);
    row.updated_at = new Date().toISOString();
    const sb = requireClient();
    const { data, error } = await sb.from("flurstuecke").update(row).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`[db-supabase-fach] flurstuecke.update fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    if (patch.anhaenge !== undefined) await syncAnhaenge("flurstueck", id, patch.anhaenge);
    const anhaenge = await fetchAnhaenge("flurstueck", [id]);
    return flurstueckFromRow(data, anhaenge.get(id) || []);
  },
  async remove(id) {
    const sb = requireClient();
    // Grundbuch-Historie darf nicht mit dem Flurstück verschwinden (LIE-007): FK ist RESTRICT,
    // hier vorab prüfen, damit die Meldung verständlich ist.
    const { count: gbAnzahl, error: gbErr } = await sb
      .from("grundbuch_eintraege")
      .select("id", { count: "exact", head: true })
      .eq("flurstueck_id", id);
    if (gbErr) throw new Error(`[db-supabase-fach] flurstuecke.remove (Grundbuch-Prüfung) fehlgeschlagen: ${gbErr.message}`);
    if (gbAnzahl) {
      throw new Error(`Flurstück hat ${gbAnzahl} Grundbuch-Einträge und kann nicht gelöscht werden (Historie bleibt erhalten).`);
    }
    // Anhänge haben keinen FK auf das Elternobjekt (parent_typ/parent_id ist generisch) → hier mitlöschen.
    const { error: aErr } = await sb.from("fach_anhaenge").delete().eq("parent_typ", "flurstueck").eq("parent_id", id);
    if (aErr) throw new Error(`[db-supabase-fach] flurstuecke.remove (Anhänge) fehlgeschlagen: ${aErr.message}`);
    const { error, count } = await sb.from("flurstuecke").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(`[db-supabase-fach] flurstuecke.remove fehlgeschlagen: ${error.message}`);
    return (count ?? 0) > 0;
  },
};

// ---------------------------------------------------------------------------
// Grundbuch-Einträge (Abt. I/II/III, mit „Röten“ statt Löschen)
// ---------------------------------------------------------------------------

const GRUNDBUCH_FILTER: Record<string, string> = {
  flurstueckId: "flurstueck_id",
  abteilung: "abteilung",
  art: "art",
};

function grundbuchToRow(e: Partial<GrundbuchEintrag>): Row {
  const row: Row = {};
  const o = e as Row;
  if (e.id !== undefined) row.id = e.id;
  set(row, o, "flurstueckId", "flurstueck_id");
  set(row, o, "abteilung", "abteilung");
  set(row, o, "lfdNummer", "lfd_nummer");
  set(row, o, "art", "art");
  set(row, o, "berechtigter", "berechtigter");
  set(row, o, "betrag", "betrag");
  set(row, o, "waehrung", "waehrung");
  set(row, o, "beschreibung", "beschreibung");
  set(row, o, "eingetragenAm", "eingetragen_am", dateOnly);
  set(row, o, "quelle", "quelle");
  set(row, o, "geloeschtAm", "geloescht_am", dateOnly);
  set(row, o, "geloeschtGrund", "geloescht_grund");
  set(row, o, "notizen", "notizen");
  set(row, o, "createdAt", "created_at");
  set(row, o, "updatedAt", "updated_at");
  return row;
}

function grundbuchFromRow(r: Row): GrundbuchEintrag {
  return {
    id: r.id as string,
    flurstueckId: r.flurstueck_id as string,
    abteilung: r.abteilung as GrundbuchEintrag["abteilung"],
    lfdNummer: (r.lfd_nummer as string) ?? "",
    art: r.art as string,
    berechtigter: r.berechtigter as string,
    betrag: (r.betrag as number) ?? undefined,
    waehrung: (r.waehrung as string) ?? undefined,
    beschreibung: (r.beschreibung as string) ?? undefined,
    eingetragenAm: r.eingetragen_am as string,
    quelle: (r.quelle as string) ?? undefined,
    geloeschtAm: (r.geloescht_am as string) ?? undefined,
    geloeschtGrund: (r.geloescht_grund as string) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export const grundbuchDb: Crud<GrundbuchEintrag> = {
  async list(filter) {
    const rows = await fetchAll(
      "grundbuch_eintraege",
      (q) => {
        for (const [k, v] of Object.entries(filter || {})) {
          q = q.eq(GRUNDBUCH_FILTER[k] || k, v as string | number | boolean);
        }
        return q;
      },
      ["created_at", "id"]
    );
    return rows.map(grundbuchFromRow);
  },
  async get(id) {
    const sb = requireClient();
    const { data, error } = await sb.from("grundbuch_eintraege").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[db-supabase-fach] grundbuch_eintraege.get fehlgeschlagen: ${error.message}`);
    return data ? grundbuchFromRow(data) : undefined;
  },
  async create(item) {
    const sb = requireClient();
    const { data, error } = await sb.from("grundbuch_eintraege").insert(grundbuchToRow(item)).select().single();
    if (error) throw new Error(`[db-supabase-fach] grundbuch_eintraege.create fehlgeschlagen: ${error.message}`);
    return grundbuchFromRow(data);
  },
  async update(id, patch) {
    const row = grundbuchToRow(patch);
    row.updated_at = new Date().toISOString();
    const sb = requireClient();
    const { data, error } = await sb.from("grundbuch_eintraege").update(row).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`[db-supabase-fach] grundbuch_eintraege.update fehlgeschlagen: ${error.message}`);
    return data ? grundbuchFromRow(data) : undefined;
  },
  async remove(id) {
    const sb = requireClient();
    const { error, count } = await sb.from("grundbuch_eintraege").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(`[db-supabase-fach] grundbuch_eintraege.remove fehlgeschlagen: ${error.message}`);
    return (count ?? 0) > 0;
  },
};
