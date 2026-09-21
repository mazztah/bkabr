import { NextRequest, NextResponse } from "next/server";
import {
  liegenschaftenDb,
  gebaeudeDb,
  wohnungenDb,
  mieterDb,
  eigentuemerDb,
  mietvertraegeDb,
  pmVertraegeDb,
  flurstueckeDb,
  vertraegeDb,
  anlagenDb,
  zaehlerDb,
  veranstaltungsflaechenDb,
  ticketsDb,
  ablageDb,
  raeumeDb,
  handwerkerDb,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

interface Treffer {
  typ: string;
  id: string;
  titel: string;
  untertitel?: string;
  link: string;
}

function enthaelt(haystack: string | undefined | null, q: string): boolean {
  return Boolean(haystack && haystack.toLowerCase().includes(q));
}

/**
 * Modulübergreifende Suche (UX-001/002). Durchsucht nur die Module, für
 * die der Nutzer mindestens Lese-Recht hat — kein Modul-Check pro Treffer
 * einzeln (wie requirePermission es täte), sondern einmalig vorab, damit
 * fehlende Rechte in EINEM Modul nicht die gesamte Suche blockieren,
 * sondern nur dessen Treffer ausblenden.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ treffer: [] });

  const darf = (modul: string) => user.rechte.has(`${modul}:read`) || user.rechte.has(`${modul}:admin`);
  const treffer: Treffer[] = [];

  if (darf("immobilien")) {
    const [gebaeude, wohnungen, mieter, eigentuemer] = await Promise.all([
      gebaeudeDb.list(),
      wohnungenDb.list(),
      mieterDb.list(),
      eigentuemerDb.list(),
    ]);
    for (const g of gebaeude) {
      if (enthaelt(g.name, q)) treffer.push({ typ: "Gebäude", id: g.id, titel: g.name, link: `/gebaeude?select=gebaeude:${g.id}` });
    }
    for (const w of wohnungen) {
      if (enthaelt(w.bezeichnung, q)) {
        treffer.push({ typ: "Wohnung", id: w.id, titel: w.bezeichnung, link: `/wohnungen?select=wohnung:${w.id}` });
      }
    }
    for (const m of mieter) {
      if (enthaelt(m.name, q) || enthaelt(m.email, q)) {
        treffer.push({ typ: "Mieter", id: m.id, titel: m.name, untertitel: m.email, link: `/mieter?select=mieter:${m.id}` });
      }
    }
    for (const e of eigentuemer) {
      if (enthaelt(e.name, q)) treffer.push({ typ: "Eigentümer", id: e.id, titel: e.name, link: `/eigentuemer?select=eigentuemer:${e.id}` });
    }
  }

  if (darf("liegenschaften")) {
    const [liegenschaften, flurstuecke] = await Promise.all([liegenschaftenDb.list(), flurstueckeDb.list()]);
    for (const l of liegenschaften) {
      if (enthaelt(l.name, q) || enthaelt(l.ort, q) || enthaelt(l.strasse, q)) {
        treffer.push({
          typ: "Liegenschaft",
          id: l.id,
          titel: l.name,
          untertitel: [l.strasse, l.ort].filter(Boolean).join(", "),
          link: `/liegenschaften?select=liegenschaft:${l.id}`,
        });
      }
    }
    for (const f of flurstuecke) {
      const bez = `${f.gemarkung} Flur ${f.flur} Nr. ${f.flurstueckNummer}`;
      if (enthaelt(bez, q) || enthaelt(f.gemarkung, q)) {
        treffer.push({ typ: "Flurstück", id: f.id, titel: bez, link: `/flurstuecke` });
      }
    }
  }

  if (darf("vertraege")) {
    const [mietvertraege, pmVertraege, vertraege] = await Promise.all([
      mietvertraegeDb.list(),
      pmVertraegeDb.list(),
      vertraegeDb.list(),
    ]);
    for (const mv of mietvertraege) {
      if (enthaelt(mv.dateiName, q)) {
        treffer.push({ typ: "Mietvertrag", id: mv.id, titel: mv.dateiName || "Mietvertrag", link: `/mietvertraege` });
      }
    }
    for (const pv of pmVertraege) {
      if (enthaelt(pv.verwalterName, q) || enthaelt(pv.dateiName, q)) {
        treffer.push({ typ: "PM-Vertrag", id: pv.id, titel: pv.verwalterName || pv.dateiName || "PM-Vertrag", link: `/pm-vertraege` });
      }
    }
    for (const v of vertraege) {
      if (enthaelt(v.bezeichnung, q) || enthaelt(v.vertragspartner, q)) {
        treffer.push({
          typ: "Vertrag",
          id: v.id,
          titel: v.bezeichnung,
          untertitel: `${v.art} · ${v.vertragspartner}`,
          link: `/vertraege`,
        });
      }
    }
  }

  if (darf("immobilien")) {
    // UX-001: Räume (Bezeichnung, Nutzung, Nummer) inkl. Gebäude als Untertitel
    const [raeume, gebaeudeListe] = await Promise.all([raeumeDb.list(), gebaeudeDb.list()]);
    const gebaeudeName = new Map(gebaeudeListe.map((g) => [g.id, g.name]));
    for (const r of raeume) {
      if (enthaelt(r.bezeichnung, q) || enthaelt(r.nutzung, q) || enthaelt(r.nummer, q)) {
        treffer.push({
          typ: "Raum",
          id: r.id,
          titel: r.bezeichnung,
          untertitel: [gebaeudeName.get(r.gebaeudeId), r.etage].filter(Boolean).join(" · "),
          link: `/raeume`,
        });
      }
    }
  }

  if (darf("anlagen")) {
    const anlagen = await anlagenDb.list();
    for (const a of anlagen) {
      if (enthaelt(a.bezeichnung, q) || enthaelt(a.typ, q)) {
        treffer.push({ typ: "Anlage", id: a.id, titel: a.bezeichnung, untertitel: a.typ, link: `/anlagen` });
      }
    }
  }

  if (darf("zaehler")) {
    const zaehler = await zaehlerDb.list();
    for (const z of zaehler) {
      if (enthaelt(z.zaehlernummer, q)) {
        treffer.push({ typ: "Zähler", id: z.id, titel: z.zaehlernummer, untertitel: z.art, link: `/zaehler` });
      }
    }
  }

  if (darf("veranstaltungen")) {
    const flaechen = await veranstaltungsflaechenDb.list();
    for (const f of flaechen) {
      if (enthaelt(f.bezeichnung, q)) {
        treffer.push({ typ: "Veranstaltungsfläche", id: f.id, titel: f.bezeichnung, link: `/veranstaltungsflaechen` });
      }
    }
  }

  if (darf("ticketsystem")) {
    const [tickets, handwerker] = await Promise.all([ticketsDb.list(), handwerkerDb.list()]);
    for (const t of tickets) {
      if (enthaelt(t.titel, q)) {
        treffer.push({ typ: "Ticket", id: t.id, titel: t.titel, untertitel: t.status, link: `/ticketsystem?select=ticket:${t.id}` });
      }
    }
    for (const h of handwerker) {
      if (enthaelt(h.name, q) || enthaelt(h.gewerk, q)) {
        treffer.push({ typ: "Handwerker", id: h.id, titel: h.name, untertitel: h.gewerk, link: `/handwerker` });
      }
    }
  }

  if (darf("dokumente")) {
    const ablage = await ablageDb.list();
    for (const d of ablage) {
      // Volltextsuche (DOK-Ausbau): nicht nur der Dateiname, auch der
      // extrahierte Textinhalt zählt als Treffer — genau das, was bisher
      // fehlte, um z.B. eine "Investoren-Vorschlagsliste.md" über ihren
      // Inhalt statt nur über den exakten Dateinamen zu finden.
      if (enthaelt(d.dateiName, q) || enthaelt(d.extraktText, q)) {
        treffer.push({ typ: "Dokument", id: d.id, titel: d.dateiName, untertitel: d.erkannterTyp, link: `/ablage` });
      }
    }
  }

  return NextResponse.json({ treffer: treffer.slice(0, 60) });
}
