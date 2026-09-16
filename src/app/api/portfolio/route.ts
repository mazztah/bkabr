import { NextRequest, NextResponse } from "next/server";
import {
  liegenschaftenDb,
  gebaeudeDb,
  wohnungenDb,
  flurstueckeDb,
  vertraegeDb,
  anlagenDb,
  zaehlerDb,
  veranstaltungsflaechenDb,
  reservierungenDb,
  ticketsDb,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Modulübergreifende Portfolio-Auswertung (UX-003/004). Aggregiert den
 * Bestand je Liegenschaft und liefert zusätzlich Handlungsbedarf
 * (überfällige Prüfungen, auslaufende Verträge, offene Tickets).
 *
 * Wie bei /api/suche wird pro Modul geprüft, ob der Nutzer Leserechte hat —
 * fehlende Rechte blenden die jeweiligen Kennzahlen aus, statt die ganze
 * Auswertung zu blockieren.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const darf = (modul: string) => user.rechte.has(`${modul}:read`) || user.rechte.has(`${modul}:admin`);
  const nurLiegenschaft = req.nextUrl.searchParams.get("liegenschaftId") || undefined;

  const liegenschaften = darf("liegenschaften") || darf("immobilien") ? await liegenschaftenDb.list() : [];
  const relevante = nurLiegenschaft ? liegenschaften.filter((l) => l.id === nurLiegenschaft) : liegenschaften;

  const [gebaeude, wohnungen, flurstuecke, vertraege, anlagen, zaehler, flaechen, reservierungen, tickets] =
    await Promise.all([
      darf("immobilien") ? gebaeudeDb.list() : [],
      darf("immobilien") ? wohnungenDb.list() : [],
      darf("liegenschaften") ? flurstueckeDb.list() : [],
      darf("vertraege") ? vertraegeDb.list() : [],
      darf("anlagen") ? anlagenDb.list() : [],
      darf("zaehler") ? zaehlerDb.list() : [],
      darf("veranstaltungen") ? veranstaltungsflaechenDb.list() : [],
      darf("veranstaltungen") ? reservierungenDb.list() : [],
      darf("ticketsystem") ? ticketsDb.list() : [],
    ]);

  const heute = new Date().toISOString().slice(0, 10);
  const in90Tagen = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Wohnungen hängen über Gebäude an der Liegenschaft, nicht direkt —
  // daher Zuordnung über die Gebäude-Ebene auflösen.
  const gebaeudeZuLiegenschaft = new Map(gebaeude.map((g) => [g.id, g.liegenschaftId]));
  const wohnungenJeLiegenschaft = new Map<string, number>();
  for (const w of wohnungen) {
    const lid = gebaeudeZuLiegenschaft.get(w.gebaeudeId);
    if (lid) wohnungenJeLiegenschaft.set(lid, (wohnungenJeLiegenschaft.get(lid) || 0) + 1);
  }

  const proLiegenschaft = relevante.map((l) => {
    const anlagenHier = anlagen.filter((a) => a.liegenschaftId === l.id);
    const vertraegeHier = vertraege.filter((v) => v.liegenschaftId === l.id);
    return {
      id: l.id,
      name: l.name,
      ort: l.ort,
      gebaeude: gebaeude.filter((g) => g.liegenschaftId === l.id).length,
      wohnungen: wohnungenJeLiegenschaft.get(l.id) || 0,
      flurstuecke: flurstuecke.filter((f) => f.liegenschaftId === l.id).length,
      vertraege: vertraegeHier.filter((v) => v.status === "Aktiv").length,
      anlagen: anlagenHier.length,
      zaehler: zaehler.filter((z) => z.liegenschaftId === l.id).length,
      veranstaltungsflaechen: flaechen.filter((f) => f.liegenschaftId === l.id).length,
      offeneTickets: tickets.filter(
        (t) =>
          t.liegenschaftId === l.id &&
          t.status !== "Erledigt" &&
          t.status !== "Abgelehnt" &&
          t.status !== "Storniert"
      ).length,
      pruefungenUeberfaellig: anlagenHier.filter(
        (a) => a.status !== "Außer Betrieb" && a.naechstePruefung && a.naechstePruefung < heute
      ).length,
    };
  });

  // Handlungsbedarf bewusst portfolioweit (nicht je Liegenschaft), damit er
  // auch ohne Liegenschafts-Filter sofort sichtbar ist.
  const ueberfaelligePruefungen = anlagen
    .filter((a) => a.status !== "Außer Betrieb" && a.naechstePruefung && a.naechstePruefung < heute)
    .map((a) => ({ id: a.id, bezeichnung: a.bezeichnung, typ: a.typ, faellig: a.naechstePruefung }));

  const auslaufendeVertraege = vertraege
    .filter((v) => v.status === "Aktiv" && !v.unbefristet && v.ende && v.ende >= heute && v.ende <= in90Tagen)
    .map((v) => ({ id: v.id, bezeichnung: v.bezeichnung, art: v.art, ende: v.ende }));

  const kommendeReservierungen = reservierungen
    .filter((r) => r.status !== "Storniert" && r.beginn.slice(0, 10) >= heute)
    .sort((a, b) => (a.beginn < b.beginn ? -1 : 1))
    .slice(0, 10)
    .map((r) => ({ id: r.id, titel: r.titel, beginn: r.beginn, status: r.status }));

  return NextResponse.json({
    gesamt: {
      liegenschaften: relevante.length,
      gebaeude: proLiegenschaft.reduce((s, p) => s + p.gebaeude, 0),
      wohnungen: proLiegenschaft.reduce((s, p) => s + p.wohnungen, 0),
      flurstuecke: proLiegenschaft.reduce((s, p) => s + p.flurstuecke, 0),
      vertraege: proLiegenschaft.reduce((s, p) => s + p.vertraege, 0),
      anlagen: proLiegenschaft.reduce((s, p) => s + p.anlagen, 0),
      zaehler: proLiegenschaft.reduce((s, p) => s + p.zaehler, 0),
      veranstaltungsflaechen: proLiegenschaft.reduce((s, p) => s + p.veranstaltungsflaechen, 0),
      offeneTickets: proLiegenschaft.reduce((s, p) => s + p.offeneTickets, 0),
    },
    proLiegenschaft,
    handlungsbedarf: {
      ueberfaelligePruefungen,
      auslaufendeVertraege,
      kommendeReservierungen,
    },
  });
}
