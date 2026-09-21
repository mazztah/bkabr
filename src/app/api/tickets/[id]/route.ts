import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { appendTicketHistorie, syncHandwerkerTrackrecord } from "@/lib/tickets";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { pickAllowed } from "@/lib/patch-whitelist";
import type { Ticket } from "@/lib/types";

// Nicht überschreibbar per PATCH: id, nummer, createdAt, updatedAt, historie (nur über Workflow-Endpunkte),
// erledigtAm/erledigtVon (setzt der Server beim Statuswechsel).
const TICKET_PATCH_FELDER = [
  "titel", "beschreibung", "status", "prioritaet", "quelle", "kategorie", "ticketArt", "schadensart",
  "liegenschaftId", "gebaeudeId", "wohnungId", "mieterId", "handwerkerId", "zugewiesenAm", "erstelltVon",
  "melderTyp", "zustaendigerMitarbeiter", "freigabeErforderlich", "freigegebenVon", "freigegebenAm",
  "freigabeKommentar", "ablehnungsgrund", "abgelehntVon", "abgelehntAm", "slaReaktionBis", "slaLoesungBis",
  "ersteReaktionAm", "kostenstelle", "kostenart", "bestellnummer", "kostenSchaetzung", "rechnungssumme",
  "rechnungsstatus", "vereinbarterTermin", "mieterVerfuegbarkeit", "schluesselstatus",
  "betriebsunterbrechungRisiko", "sicherheitsfreigabeErforderlich", "wartungsvertragVorhanden",
  "wartungspartner", "faelligkeitsdatum", "arbeitszeitMinuten", "dokumente",
] as const satisfies ReadonlyArray<keyof Ticket>;

// Felder, deren Änderung in die Historie geschrieben wird (TKT-011)
const HISTORIE_FELDER: ReadonlyArray<readonly [keyof Ticket, string]> = [
  ["prioritaet", "Priorität"],
  ["faelligkeitsdatum", "Fälligkeit"],
  ["zustaendigerMitarbeiter", "Zuständig"],
  ["kategorie", "Kategorie"],
  ["kostenstelle", "Kostenstelle"],
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ticket });
}

/**
 * Generisches Update (Titel, Priorität, Fälligkeit, Kategorie, Objektbezug, ...).
 * Statuswechsel und Handwerker-Zuweisung laufen zwar auch hier durch (patch.status
 * / patch.handwerkerId), erzeugen aber – anders als /freigeben, /ablehnen und
 * /zuweisen – KEINEN eigenen Historien-Eintrag mit Begründung. Für den vollen
 * Workflow (Freigabe-Kommentar, Ablehnungsgrund, Zuweisung mit Protokoll) bitte
 * die dedizierten Endpunkte verwenden.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch = pickAllowed<Ticket>(body, TICKET_PATCH_FELDER);
  const bestehend = await ticketsDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  if (patch.arbeitszeitMinuten !== undefined && patch.arbeitszeitMinuten !== null) {
    const az = Number(patch.arbeitszeitMinuten);
    if (!Number.isFinite(az) || az < 0) {
      return NextResponse.json({ error: "arbeitszeitMinuten muss eine Zahl ≥ 0 sein." }, { status: 400 });
    }
    patch.arbeitszeitMinuten = Math.round(az);
  }

  // Wer hat geändert? Explizit übergebener Name, sonst der angemeldete Nutzer.
  const von: string | undefined =
    (typeof body.von === "string" && body.von) || auth.displayName || auth.email || undefined;

  const statusChanged = patch.status && patch.status !== bestehend.status;
  // TKT-009: Erledigungsdatum setzen bzw. beim Wiedereröffnen zurücknehmen
  if (statusChanged && patch.status === "Erledigt") {
    patch.erledigtAm = new Date().toISOString();
    patch.erledigtVon = von;
  } else if (statusChanged && bestehend.erledigtAm) {
    patch.erledigtAm = undefined;
    patch.erledigtVon = undefined;
  }

  // TKT-011: Änderungen an Priorität, Fälligkeit, Zuständigem, Kategorie und Kostenstelle protokollieren
  const aenderungen: string[] = [];
  for (const [feld, label] of HISTORIE_FELDER) {
    if (feld in patch) {
      // Datumsfelder: nur den Tag vergleichen (Eingabefelder senden YYYY-MM-DD, gespeichert kann ein ISO-Zeitstempel sein)
      const norm = (v: unknown) => (feld === "faelligkeitsdatum" ? String(v ?? "").slice(0, 10) : String(v ?? ""));
      const alt = norm(bestehend[feld]);
      const neu = norm((patch as Record<string, unknown>)[feld]);
      if (alt !== neu) aenderungen.push(`${label} geändert: ${alt || "–"} → ${neu || "–"}.`);
    }
  }

  let ticket = (await ticketsDb.update(id, patch)) || bestehend;

  if (statusChanged) {
    ticket = await appendTicketHistorie(ticket, `Status geändert auf „${patch.status}".`, {
      status: patch.status,
      von,
    });
    await syncHandwerkerTrackrecord(ticket);
  }
  for (const text of aenderungen) {
    ticket = await appendTicketHistorie(ticket, text, { von });
  }

  await logEvent("aenderung", `Ticket „${ticket.titel}" aktualisiert.`, { art: "Ticket", id });
  await logAudit({ table: "tickets", recordId: id, aktion: "update", changedBy: auth.id, oldData: bestehend, newData: ticket });
  return NextResponse.json({ ticket });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await ticketsDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await ticketsDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Ticket „${bestehend.titel}" gelöscht.`, { art: "Ticket", id });
    await logAudit({ table: "tickets", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
