import { handwerkerDb, ticketsDb } from "./db";
import { Handwerker, HandwerkerTrackrecordEintrag, Ticket, TicketHistorieEintrag, TicketStatus } from "./types";
import { uid } from "./utils";

/**
 * Hängt einen Eintrag an die Ticket-Historie an (Audit-Trail) und persistiert
 * das Ticket. Wird von allen Status-verändernden Aktionen (Freigabe, Ablehnung,
 * Zuweisung, manuelle Statusänderung) genutzt, damit im Ticket immer lückenlos
 * nachvollziehbar ist, wer wann was gemacht hat.
 */
export async function appendTicketHistorie(
  ticket: Ticket,
  text: string,
  opts: { status?: TicketStatus; von?: string } = {}
): Promise<Ticket> {
  const eintrag: TicketHistorieEintrag = {
    id: uid(),
    zeitpunkt: new Date().toISOString(),
    status: opts.status,
    text,
    von: opts.von,
  };
  const historie = [...(ticket.historie || []), eintrag];
  const patch: Partial<Ticket> = { historie };
  if (opts.status) patch.status = opts.status;
  // SLA-Reaktionszeit: der erste Vorgang NACH der Ticket-Anlage gilt als
  // "erste Reaktion" der Verwaltung (Freigabe, Zuweisung, Statuswechsel, ...).
  if (!ticket.ersteReaktionAm && (ticket.historie || []).length >= 1) {
    patch.ersteReaktionAm = eintrag.zeitpunkt;
  }
  const updated = await ticketsDb.update(ticket.id, patch);
  return updated || { ...ticket, ...patch };
}

/**
 * Spiegelt den aktuellen Stand eines Tickets als "interner" Trackrecord-Eintrag
 * beim zugewiesenen Handwerker – so entsteht automatisch ein Protokoll aller
 * offenen/erledigten Aufträge je Handwerker, ohne dass irgendwo doppelt gepflegt
 * werden muss. Ein bereits vorhandener Eintrag für dasselbe Ticket wird aktualisiert
 * statt dupliziert (Abgleich über ticketId).
 */
export async function syncHandwerkerTrackrecord(ticket: Ticket): Promise<void> {
  if (!ticket.handwerkerId) return;
  const hw = await handwerkerDb.get(ticket.handwerkerId);
  if (!hw) return;

  const trackStatus: HandwerkerTrackrecordEintrag["status"] =
    ticket.status === "Erledigt" ? "erledigt" : ticket.status === "Abgelehnt" ? "abgelehnt" : "offen";

  const bestehende = hw.trackrecord || [];
  const idx = bestehende.findIndex((t) => t.ticketId === ticket.id);
  const eintrag: HandwerkerTrackrecordEintrag = {
    id: idx >= 0 ? bestehende[idx].id : uid(),
    quelle: "intern",
    ticketId: ticket.id,
    ticketNummer: ticket.nummer,
    titel: ticket.titel,
    beschreibung: ticket.beschreibung,
    status: trackStatus,
    datum: idx >= 0 ? bestehende[idx].datum : new Date().toISOString(),
    createdAt: idx >= 0 ? bestehende[idx].createdAt : new Date().toISOString(),
  };

  const trackrecord =
    idx >= 0
      ? bestehende.map((t, i) => (i === idx ? eintrag : t))
      : [...bestehende, eintrag];

  await handwerkerDb.update(hw.id, { trackrecord });
}

/** Weist ein Ticket einem Handwerker zu (manuelle Weiterleitung ans Ticketsystem inklusive). */
export async function assignTicket(
  ticket: Ticket,
  handwerkerId: string,
  von?: string
): Promise<Ticket> {
  const hw = await handwerkerDb.get(handwerkerId);
  const now = new Date().toISOString();
  const updated =
    (await ticketsDb.update(ticket.id, {
      handwerkerId,
      zugewiesenAm: now,
      status: "Zugewiesen",
    })) || ticket;
  const withHistorie = await appendTicketHistorie(
    updated,
    `An Handwerker „${hw?.name || handwerkerId}" (${hw?.gewerk || "?"}) weitergeleitet.`,
    { status: "Zugewiesen", von }
  );
  await syncHandwerkerTrackrecord(withHistorie);
  return withHistorie;
}

/** Gibt ein Ticket frei (Freigabe-Workflow, z.B. vor Beauftragung eines externen Handwerkers). */
export async function approveTicket(
  ticket: Ticket,
  von: string,
  kommentar?: string
): Promise<Ticket> {
  const now = new Date().toISOString();
  const updated =
    (await ticketsDb.update(ticket.id, {
      status: "Freigegeben",
      freigegebenVon: von,
      freigegebenAm: now,
      freigabeKommentar: kommentar,
    })) || ticket;
  return appendTicketHistorie(
    updated,
    `Freigegeben von ${von}${kommentar ? ` – „${kommentar}"` : ""}.`,
    { status: "Freigegeben", von }
  );
}

/** Lehnt ein Ticket ab (mit Pflicht-Begründung) und synchronisiert ggf. den Trackrecord. */
export async function rejectTicket(ticket: Ticket, von: string, grund: string): Promise<Ticket> {
  const now = new Date().toISOString();
  const updated =
    (await ticketsDb.update(ticket.id, {
      status: "Abgelehnt",
      abgelehntVon: von,
      abgelehntAm: now,
      ablehnungsgrund: grund,
    })) || ticket;
  const withHistorie = await appendTicketHistorie(updated, `Abgelehnt von ${von}: „${grund}"`, {
    status: "Abgelehnt",
    von,
  });
  await syncHandwerkerTrackrecord(withHistorie);
  return withHistorie;
}

export async function setTicketStatus(
  ticket: Ticket,
  status: TicketStatus,
  von?: string,
  kommentar?: string
): Promise<Ticket> {
  const withHistorie = await appendTicketHistorie(
    ticket,
    `Status geändert auf „${status}"${kommentar ? ` – ${kommentar}` : ""}.`,
    { status, von }
  );
  await syncHandwerkerTrackrecord(withHistorie);
  return withHistorie;
}
