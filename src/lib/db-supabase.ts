// ============================================================================
// Supabase-Backend für die Stammdaten-Hierarchie (Phase 2, Durchgang 13)
// ============================================================================
// Bildet EXAKT dieselbe Schnittstelle nach wie makeCrud<T>() in db.ts
// ({ list, get, create, update, remove }), damit db.ts die Implementierung
// pro Modul austauschen kann, ohne dass API-Routen oder agent.ts irgendetwas
// davon merken. Aktivierung modulweise über die Env-Variable
// DB_SUPABASE_MODULES (siehe db.ts), Default = aus (JSON bleibt aktiv).
//
// Umfang dieser Phase: Liegenschaft, Gebäude, Wohnung, Mieter, Mietvertrag
// (die Kern-Hierarchie aus Durchgang 12). Weitere Module folgen nach
// demselben Muster — siehe Kommentar am Ende der Datei.
//
// Fehlerverhalten: wirft (throw), statt still leere Werte zurückzugeben.
// Ein Backend-Fehler soll sichtbar werden (API-Route/Agent-Tool bekommt
// einen 500er statt fälschlich "keine Daten"), nicht lautlos verschluckt
// werden wie es bei fehlender Supabase-Konfiguration in supabase.ts (Agent-
// Gedächtnis, bewusst optional) der Fall ist — hier ist Supabase, wenn ein
// Modul dafür aktiviert ist, die einzige Datenquelle für dieses Modul.

import { getSupabaseClient } from "./supabase";
import type { Liegenschaft, Gebaeude, Wohnung, Mieter, Mietvertrag, SollIstEintrag, MietkontoBuchung, Anhang } from "./types";

function requireClient() {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error(
      "[db-supabase] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen, aber ein Modul ist per DB_SUPABASE_MODULES auf Supabase geschaltet."
    );
  }
  return sb;
}

async function nextNummerSupabase(prefix: string): Promise<string> {
  const sb = requireClient();
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const { data, error } = await sb.rpc("increment_counter", { p_key: key });
  if (error) throw new Error(`[db-supabase] nextNummer(${prefix}) fehlgeschlagen: ${error.message}`);
  return `${prefix}-${year}-${String(data).padStart(4, "0")}`;
}

/** Setzt row[dbKey] nur, wenn tsKey im Quellobjekt vorhanden ist — macht toRow() für
 *  volle Objekte (create) UND Partial-Patches (update) gleichermaßen korrekt. */
function set(row: Record<string, unknown>, obj: Record<string, unknown>, tsKey: string, dbKey: string, transform: (v: unknown) => unknown = (v) => v) {
  if (Object.prototype.hasOwnProperty.call(obj, tsKey)) {
    const v = obj[tsKey];
    row[dbKey] = v === undefined ? null : transform(v);
  }
}

// ---------------------------------------------------------------------------
// Generische Fabrik für Entitäten OHNE Kind-Tabellen (Liegenschaft, Gebäude, Wohnung)
// ---------------------------------------------------------------------------

interface SimpleCrud<T> {
  list(filter?: Partial<T>): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  remove(id: string): Promise<boolean>;
}

function makeSimpleSupabaseCrud<T extends { id: string; nummer?: string }>(
  table: string,
  prefix: string,
  filterColumns: Record<string, string>,
  toRow: (obj: Partial<T>) => Record<string, unknown>,
  fromRow: (row: Record<string, unknown>) => T
): SimpleCrud<T> {
  return {
    async list(filter) {
      const sb = requireClient();
      let q = sb.from(table).select("*").order("created_at", { ascending: true });
      if (filter) {
        for (const [k, v] of Object.entries(filter)) {
          q = q.eq(filterColumns[k] || k, v as string | number | boolean);
        }
      }
      const { data, error } = await q;
      if (error) throw new Error(`[db-supabase] ${table}.list fehlgeschlagen: ${error.message}`);
      return (data || []).map(fromRow);
    },
    async get(id) {
      const sb = requireClient();
      const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`[db-supabase] ${table}.get fehlgeschlagen: ${error.message}`);
      return data ? fromRow(data) : undefined;
    },
    async create(item) {
      const nummer = item.nummer || (await nextNummerSupabase(prefix));
      const row = toRow({ ...item, nummer } as Partial<T>);
      const sb = requireClient();
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) throw new Error(`[db-supabase] ${table}.create fehlgeschlagen: ${error.message}`);
      return fromRow(data);
    },
    async update(id, patch) {
      const row = toRow(patch);
      row.updated_at = new Date().toISOString();
      const sb = requireClient();
      const { data, error } = await sb.from(table).update(row).eq("id", id).select().maybeSingle();
      if (error) throw new Error(`[db-supabase] ${table}.update fehlgeschlagen: ${error.message}`);
      return data ? fromRow(data) : undefined;
    },
    async remove(id) {
      const sb = requireClient();
      const { error, count } = await sb.from(table).delete({ count: "exact" }).eq("id", id);
      if (error) throw new Error(`[db-supabase] ${table}.remove fehlgeschlagen: ${error.message}`);
      return (count ?? 0) > 0;
    },
  };
}

// -------- Liegenschaft --------

function liegenschaftToRow(l: Partial<Liegenschaft>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.id !== undefined) row.id = l.id;
  set(row, l, "nummer", "nummer");
  set(row, l, "name", "name");
  set(row, l, "strasse", "strasse");
  set(row, l, "hausnummer", "hausnummer");
  set(row, l, "plz", "plz");
  set(row, l, "ort", "ort");
  set(row, l, "grundstuecksflaeche", "grundstuecksflaeche");
  set(row, l, "flurstueck", "flurstueck");
  set(row, l, "notizen", "notizen");
  set(row, l, "status", "status");
  set(row, l, "createdAt", "created_at");
  set(row, l, "updatedAt", "updated_at");
  return row;
}
function liegenschaftFromRow(r: Record<string, unknown>): Liegenschaft {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    name: r.name as string,
    strasse: r.strasse as string,
    hausnummer: r.hausnummer as string,
    plz: r.plz as string,
    ort: r.ort as string,
    grundstuecksflaeche: (r.grundstuecksflaeche as number) ?? undefined,
    flurstueck: (r.flurstueck as string) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    status: r.status as Liegenschaft["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
export const liegenschaftenDb = makeSimpleSupabaseCrud<Liegenschaft>(
  "liegenschaften",
  "LG",
  {},
  liegenschaftToRow,
  liegenschaftFromRow
);

// -------- Gebäude --------

function gebaeudeToRow(g: Partial<Gebaeude>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (g.id !== undefined) row.id = g.id;
  set(row, g, "nummer", "nummer");
  set(row, g, "liegenschaftId", "liegenschaft_id");
  set(row, g, "name", "name");
  set(row, g, "baujahr", "baujahr");
  set(row, g, "anzahlEinheiten", "anzahl_einheiten");
  set(row, g, "heizungsart", "heizungsart");
  set(row, g, "notizen", "notizen");
  set(row, g, "status", "status");
  set(row, g, "createdAt", "created_at");
  set(row, g, "updatedAt", "updated_at");
  return row;
}
function gebaeudeFromRow(r: Record<string, unknown>): Gebaeude {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    liegenschaftId: r.liegenschaft_id as string,
    name: r.name as string,
    baujahr: (r.baujahr as number) ?? undefined,
    anzahlEinheiten: (r.anzahl_einheiten as number) ?? undefined,
    heizungsart: (r.heizungsart as string) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    status: r.status as Gebaeude["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
export const gebaeudeDb = makeSimpleSupabaseCrud<Gebaeude>(
  "gebaeude",
  "GB",
  { liegenschaftId: "liegenschaft_id" },
  gebaeudeToRow,
  gebaeudeFromRow
);

// -------- Wohnung --------

function wohnungToRow(w: Partial<Wohnung>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (w.id !== undefined) row.id = w.id;
  set(row, w, "nummer", "nummer");
  set(row, w, "gebaeudeId", "gebaeude_id");
  set(row, w, "bezeichnung", "bezeichnung");
  set(row, w, "typ", "typ");
  set(row, w, "flaeche", "flaeche");
  set(row, w, "zimmer", "zimmer");
  set(row, w, "miteigentumsanteil", "miteigentumsanteil");
  set(row, w, "notizen", "notizen");
  set(row, w, "status", "status");
  set(row, w, "createdAt", "created_at");
  set(row, w, "updatedAt", "updated_at");
  return row;
}
function wohnungFromRow(r: Record<string, unknown>): Wohnung {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    gebaeudeId: r.gebaeude_id as string,
    bezeichnung: r.bezeichnung as string,
    typ: r.typ as Wohnung["typ"],
    flaeche: (r.flaeche as number) ?? undefined,
    zimmer: (r.zimmer as number) ?? undefined,
    miteigentumsanteil: (r.miteigentumsanteil as number) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    status: r.status as Wohnung["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
export const wohnungenDb = makeSimpleSupabaseCrud<Wohnung>(
  "wohnungen",
  "EH",
  { gebaeudeId: "gebaeude_id" },
  wohnungToRow,
  wohnungFromRow
);

// ---------------------------------------------------------------------------
// Mieter — hat zwei Kind-Tabellen (sollIst, mietkonto), die im JSON-Backend
// inline im Objekt liegen. "Replace-all"-Semantik beim Schreiben: wird
// sollIst/mietkonto mitgeschickt, ersetzt das die komplette bisherige Liste
// (identisch zum Verhalten der JSON-Variante, die das Feld einfach überschreibt).
// ---------------------------------------------------------------------------

function mieterToRow(m: Partial<Mieter>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (m.id !== undefined) row.id = m.id;
  set(row, m, "nummer", "nummer");
  set(row, m, "wohnungId", "wohnung_id");
  set(row, m, "name", "name");
  set(row, m, "email", "email");
  set(row, m, "telefon", "telefon");
  set(row, m, "mietbeginn", "mietbeginn");
  set(row, m, "mietende", "mietende");
  set(row, m, "kaltmiete", "kaltmiete");
  set(row, m, "nebenkostenVorauszahlung", "nebenkosten_vorauszahlung");
  set(row, m, "notizen", "notizen");
  set(row, m, "status", "status");
  set(row, m, "createdAt", "created_at");
  set(row, m, "updatedAt", "updated_at");
  return row;
}
function mieterFromRow(r: Record<string, unknown>, sollIst: SollIstEintrag[], mietkonto: MietkontoBuchung[]): Mieter {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    wohnungId: r.wohnung_id as string,
    name: r.name as string,
    email: (r.email as string) ?? undefined,
    telefon: (r.telefon as string) ?? undefined,
    mietbeginn: (r.mietbeginn as string) ?? undefined,
    mietende: (r.mietende as string) ?? undefined,
    kaltmiete: (r.kaltmiete as number) ?? undefined,
    nebenkostenVorauszahlung: (r.nebenkosten_vorauszahlung as number) ?? undefined,
    notizen: (r.notizen as string) ?? undefined,
    status: r.status as Mieter["status"],
    sollIst: sollIst.length ? sollIst : undefined,
    mietkonto: mietkonto.length ? mietkonto : undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

async function fetchMieterChildren(mieterIds: string[]) {
  const sb = requireClient();
  const sollIstByMieter = new Map<string, SollIstEintrag[]>();
  const mietkontoByMieter = new Map<string, MietkontoBuchung[]>();
  if (!mieterIds.length) return { sollIstByMieter, mietkontoByMieter };

  const [sollIstRes, mietkontoRes] = await Promise.all([
    sb.from("mieter_soll_ist").select("*").in("mieter_id", mieterIds),
    sb.from("mieter_mietkonto").select("*").in("mieter_id", mieterIds),
  ]);
  if (sollIstRes.error) throw new Error(`[db-supabase] mieter_soll_ist fehlgeschlagen: ${sollIstRes.error.message}`);
  if (mietkontoRes.error) throw new Error(`[db-supabase] mieter_mietkonto fehlgeschlagen: ${mietkontoRes.error.message}`);

  for (const row of sollIstRes.data || []) {
    const list = sollIstByMieter.get(row.mieter_id) || [];
    list.push({ id: row.id, jahr: row.jahr, sollVorauszahlung: row.soll_vorauszahlung, istZahlungen: row.ist_zahlungen, notiz: row.notiz ?? undefined });
    sollIstByMieter.set(row.mieter_id, list);
  }
  for (const row of mietkontoRes.data || []) {
    const list = mietkontoByMieter.get(row.mieter_id) || [];
    list.push({ id: row.id, datum: row.datum, typ: row.typ, soll: row.soll, ist: row.ist, text: row.text ?? undefined });
    mietkontoByMieter.set(row.mieter_id, list);
  }
  return { sollIstByMieter, mietkontoByMieter };
}

async function replaceMieterChildren(mieterId: string, sollIst?: SollIstEintrag[], mietkonto?: MietkontoBuchung[]) {
  const sb = requireClient();
  if (sollIst !== undefined) {
    const { error: delErr } = await sb.from("mieter_soll_ist").delete().eq("mieter_id", mieterId);
    if (delErr) throw new Error(`[db-supabase] mieter_soll_ist löschen fehlgeschlagen: ${delErr.message}`);
    if (sollIst.length) {
      const rows = sollIst.map((s) => ({
        id: s.id, mieter_id: mieterId, jahr: s.jahr, soll_vorauszahlung: s.sollVorauszahlung, ist_zahlungen: s.istZahlungen, notiz: s.notiz ?? null,
      }));
      const { error } = await sb.from("mieter_soll_ist").insert(rows);
      if (error) throw new Error(`[db-supabase] mieter_soll_ist schreiben fehlgeschlagen: ${error.message}`);
    }
  }
  if (mietkonto !== undefined) {
    const { error: delErr } = await sb.from("mieter_mietkonto").delete().eq("mieter_id", mieterId);
    if (delErr) throw new Error(`[db-supabase] mieter_mietkonto löschen fehlgeschlagen: ${delErr.message}`);
    if (mietkonto.length) {
      const rows = mietkonto.map((k) => ({
        id: k.id, mieter_id: mieterId, datum: k.datum, typ: k.typ, soll: k.soll, ist: k.ist, text: k.text ?? null,
      }));
      const { error } = await sb.from("mieter_mietkonto").insert(rows);
      if (error) throw new Error(`[db-supabase] mieter_mietkonto schreiben fehlgeschlagen: ${error.message}`);
    }
  }
}

export const mieterDb: SimpleCrud<Mieter> = {
  async list(filter) {
    const sb = requireClient();
    let q = sb.from("mieter").select("*").order("created_at", { ascending: true });
    if (filter?.wohnungId) q = q.eq("wohnung_id", filter.wohnungId);
    const { data, error } = await q;
    if (error) throw new Error(`[db-supabase] mieter.list fehlgeschlagen: ${error.message}`);
    const rows = data || [];
    const { sollIstByMieter, mietkontoByMieter } = await fetchMieterChildren(rows.map((r) => r.id));
    return rows.map((r) => mieterFromRow(r, sollIstByMieter.get(r.id) || [], mietkontoByMieter.get(r.id) || []));
  },
  async get(id) {
    const sb = requireClient();
    const { data, error } = await sb.from("mieter").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[db-supabase] mieter.get fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    const { sollIstByMieter, mietkontoByMieter } = await fetchMieterChildren([data.id]);
    return mieterFromRow(data, sollIstByMieter.get(data.id) || [], mietkontoByMieter.get(data.id) || []);
  },
  async create(item) {
    const nummer = item.nummer || (await nextNummerSupabase("MI"));
    const row = mieterToRow({ ...item, nummer });
    const sb = requireClient();
    const { data, error } = await sb.from("mieter").insert(row).select().single();
    if (error) throw new Error(`[db-supabase] mieter.create fehlgeschlagen: ${error.message}`);
    if (item.sollIst?.length || item.mietkonto?.length) {
      await replaceMieterChildren(data.id, item.sollIst, item.mietkonto);
    }
    const { sollIstByMieter, mietkontoByMieter } = await fetchMieterChildren([data.id]);
    return mieterFromRow(data, sollIstByMieter.get(data.id) || [], mietkontoByMieter.get(data.id) || []);
  },
  async update(id, patch) {
    const row = mieterToRow(patch);
    row.updated_at = new Date().toISOString();
    const sb = requireClient();
    const { data, error } = await sb.from("mieter").update(row).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`[db-supabase] mieter.update fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    await replaceMieterChildren(id, patch.sollIst, patch.mietkonto);
    const { sollIstByMieter, mietkontoByMieter } = await fetchMieterChildren([id]);
    return mieterFromRow(data, sollIstByMieter.get(id) || [], mietkontoByMieter.get(id) || []);
  },
  async remove(id) {
    const sb = requireClient();
    const { error, count } = await sb.from("mieter").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(`[db-supabase] mieter.remove fehlgeschlagen: ${error.message}`);
    return (count ?? 0) > 0;
  },
};

// ---------------------------------------------------------------------------
// Mietvertrag — hat eine Kind-Tabelle (anhaenge, geteilt mit Eigentümer/PM-
// Vertrag über parent_typ). Gleiches Replace-all-Prinzip wie bei Mieter.
// ---------------------------------------------------------------------------

function mietvertragToRow(v: Partial<Mietvertrag>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (v.id !== undefined) row.id = v.id;
  set(row, v, "nummer", "nummer");
  set(row, v, "wohnungId", "wohnung_id");
  set(row, v, "mieterId", "mieter_id");
  set(row, v, "dateiName", "datei_name");
  set(row, v, "storedFileName", "stored_file_name");
  set(row, v, "mimeType", "mime_type");
  set(row, v, "hochgeladenAm", "hochgeladen_am");
  set(row, v, "sollMiete", "soll_miete");
  set(row, v, "nebenkostenVorauszahlung", "nebenkosten_vorauszahlung");
  set(row, v, "bkVorauszahlung", "bk_vorauszahlung");
  set(row, v, "hkVorauszahlung", "hk_vorauszahlung");
  set(row, v, "warmmiete", "warmmiete");
  set(row, v, "kaution", "kaution");
  set(row, v, "mietbeginn", "mietbeginn");
  set(row, v, "mietende", "mietende");
  set(row, v, "flaeche", "flaeche");
  set(row, v, "zimmer", "zimmer");
  set(row, v, "status", "status");
  set(row, v, "extraktText", "extrakt_text");
  set(row, v, "createdAt", "created_at");
  set(row, v, "updatedAt", "updated_at");
  return row;
}
function mietvertragFromRow(r: Record<string, unknown>, anhaenge: Anhang[]): Mietvertrag {
  return {
    id: r.id as string,
    nummer: (r.nummer as string) ?? undefined,
    wohnungId: r.wohnung_id as string,
    mieterId: (r.mieter_id as string) ?? undefined,
    dateiName: r.datei_name as string,
    storedFileName: (r.stored_file_name as string) ?? undefined,
    mimeType: r.mime_type as string,
    hochgeladenAm: r.hochgeladen_am as string,
    sollMiete: (r.soll_miete as number) ?? undefined,
    nebenkostenVorauszahlung: (r.nebenkosten_vorauszahlung as number) ?? undefined,
    bkVorauszahlung: (r.bk_vorauszahlung as number) ?? undefined,
    hkVorauszahlung: (r.hk_vorauszahlung as number) ?? undefined,
    warmmiete: (r.warmmiete as number) ?? undefined,
    kaution: (r.kaution as number) ?? undefined,
    mietbeginn: (r.mietbeginn as string) ?? undefined,
    mietende: (r.mietende as string) ?? undefined,
    flaeche: (r.flaeche as number) ?? undefined,
    zimmer: (r.zimmer as number) ?? undefined,
    status: r.status as Mietvertrag["status"],
    extraktText: (r.extrakt_text as string) ?? undefined,
    anhaenge: anhaenge.length ? anhaenge : undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function anhangFromRow(row: Record<string, unknown>): Anhang {
  return {
    id: row.id as string,
    typ: row.typ as Anhang["typ"],
    dateiName: row.datei_name as string,
    storedFileName: row.stored_file_name as string,
    mimeType: row.mime_type as string,
    hochgeladenAm: row.hochgeladen_am as string,
    extraktText: (row.extrakt_text as string) ?? undefined,
    notizen: (row.notizen as string) ?? undefined,
  };
}

async function fetchAnhaenge(parentTyp: "mietvertrag" | "eigentuemer" | "pm_vertrag", parentIds: string[]) {
  const byParent = new Map<string, Anhang[]>();
  if (!parentIds.length) return byParent;
  const sb = requireClient();
  const { data, error } = await sb.from("anhaenge").select("*").eq("parent_typ", parentTyp).in("parent_id", parentIds);
  if (error) throw new Error(`[db-supabase] anhaenge lesen fehlgeschlagen: ${error.message}`);
  for (const row of data || []) {
    const list = byParent.get(row.parent_id) || [];
    list.push(anhangFromRow(row));
    byParent.set(row.parent_id, list);
  }
  return byParent;
}

async function replaceAnhaenge(parentTyp: "mietvertrag" | "eigentuemer" | "pm_vertrag", parentId: string, anhaenge: Anhang[]) {
  const sb = requireClient();
  const { error: delErr } = await sb.from("anhaenge").delete().eq("parent_typ", parentTyp).eq("parent_id", parentId);
  if (delErr) throw new Error(`[db-supabase] anhaenge löschen fehlgeschlagen: ${delErr.message}`);
  if (!anhaenge.length) return;
  const rows = anhaenge.map((a) => ({
    id: a.id, parent_typ: parentTyp, parent_id: parentId, typ: a.typ, datei_name: a.dateiName,
    stored_file_name: a.storedFileName, mime_type: a.mimeType, hochgeladen_am: a.hochgeladenAm,
    extrakt_text: a.extraktText ?? null, notizen: a.notizen ?? null,
  }));
  const { error } = await sb.from("anhaenge").insert(rows);
  if (error) throw new Error(`[db-supabase] anhaenge schreiben fehlgeschlagen: ${error.message}`);
}

export const mietvertraegeDb: SimpleCrud<Mietvertrag> = {
  async list(filter) {
    const sb = requireClient();
    let q = sb.from("mietvertraege").select("*").order("created_at", { ascending: true });
    if (filter?.wohnungId) q = q.eq("wohnung_id", filter.wohnungId);
    if (filter?.mieterId) q = q.eq("mieter_id", filter.mieterId);
    const { data, error } = await q;
    if (error) throw new Error(`[db-supabase] mietvertraege.list fehlgeschlagen: ${error.message}`);
    const rows = data || [];
    const anhaengeByParent = await fetchAnhaenge("mietvertrag", rows.map((r) => r.id));
    return rows.map((r) => mietvertragFromRow(r, anhaengeByParent.get(r.id) || []));
  },
  async get(id) {
    const sb = requireClient();
    const { data, error } = await sb.from("mietvertraege").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[db-supabase] mietvertraege.get fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    const anhaengeByParent = await fetchAnhaenge("mietvertrag", [data.id]);
    return mietvertragFromRow(data, anhaengeByParent.get(data.id) || []);
  },
  async create(item) {
    const nummer = item.nummer || (await nextNummerSupabase("MV"));
    const row = mietvertragToRow({ ...item, nummer });
    const sb = requireClient();
    const { data, error } = await sb.from("mietvertraege").insert(row).select().single();
    if (error) throw new Error(`[db-supabase] mietvertraege.create fehlgeschlagen: ${error.message}`);
    if (item.anhaenge?.length) await replaceAnhaenge("mietvertrag", data.id, item.anhaenge);
    const anhaengeByParent = await fetchAnhaenge("mietvertrag", [data.id]);
    return mietvertragFromRow(data, anhaengeByParent.get(data.id) || []);
  },
  async update(id, patch) {
    const row = mietvertragToRow(patch);
    row.updated_at = new Date().toISOString();
    const sb = requireClient();
    const { data, error } = await sb.from("mietvertraege").update(row).eq("id", id).select().maybeSingle();
    if (error) throw new Error(`[db-supabase] mietvertraege.update fehlgeschlagen: ${error.message}`);
    if (!data) return undefined;
    if (patch.anhaenge !== undefined) await replaceAnhaenge("mietvertrag", id, patch.anhaenge);
    const anhaengeByParent = await fetchAnhaenge("mietvertrag", [id]);
    return mietvertragFromRow(data, anhaengeByParent.get(id) || []);
  },
  async remove(id) {
    const sb = requireClient();
    const { error, count } = await sb.from("mietvertraege").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(`[db-supabase] mietvertraege.remove fehlgeschlagen: ${error.message}`);
    return (count ?? 0) > 0;
  },
};

// ---------------------------------------------------------------------------
// Nächste Slices (gleiches Muster, noch nicht implementiert):
// Eigentümer/PM-Vertrag (nutzen dieselbe anhaenge-Tabelle wie Mietvertrag,
// s.o. fetchAnhaenge/replaceAnhaenge sind bereits parent_typ-generisch),
// Abrechnung (workspace/dokumente/chat/history — komplexester Fall wegen
// Versionierung), Buchhaltung, Schriftverkehr, Investoren.
// ---------------------------------------------------------------------------
