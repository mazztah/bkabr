// Ergänzt auth.ts um: (a) die Objekt-Scope-Prüfung (§3: "...und
// Objekt-/Datenbereich steuerbar"), (b) Konstanten für UI-Zwecke
// (Rollen-/Modul-Labels), damit Admin-Oberflächen (Nutzerverwaltung) nicht
// jedes Mal die SQL-Seed-Werte von Hand abtippen müssen.

import type { AuthUser, Modul } from "./auth";

/** true, wenn der Nutzer auf eine konkrete Liegenschaft zugreifen darf
 *  (Modul-Recht wird HIER NICHT geprüft — das macht requirePermission()). */
export function hasObjectAccess(user: AuthUser, liegenschaftId: string | null | undefined): boolean {
  if (!liegenschaftId) return true; // Objekt ohne Liegenschaftsbezug: Scope greift nicht
  if (user.liegenschaftScope === null) return true; // kein Scope hinterlegt = unbeschränkt
  return user.liegenschaftScope.includes(liegenschaftId);
}

export const MODULE_LABELS: Record<Modul, string> = {
  systemadministration: "Systemadministration",
  immobilien: "Immobilienverwaltung",
  liegenschaften: "Liegenschaftsverwaltung",
  pacht_nutzung: "Pacht & Nutzung",
  veranstaltungen: "Kurzzeitvermietung/Veranstaltungen",
  vertraege: "Vertragsmanagement",
  kalender: "Kalender",
  anlagen: "Anlagenmanagement",
  ticketsystem: "Ticketsystem",
  zaehler: "Zählermanagement",
  dokumente: "Dokumente",
  finanzen: "Finanzen/Kostenstellen",
};

/** Muss exakt den Slugs aus supabase/schema_auth.sql entsprechen. */
export const ROLE_LABELS: Record<string, string> = {
  systemadministration: "Systemadministration",
  immobilienverwaltung: "Immobilienverwaltung",
  liegenschaftsverwaltung: "Liegenschaftsverwaltung",
  vertragsmanagement: "Vertragsmanagement",
  veranstaltungsmanagement: "Veranstaltungsmanagement",
  haustechnik: "Haustechnik",
  finanzen: "Finanzen/Kostenstellen",
  lesebrechtigte: "Leseberechtigte",
  ticketbearbeiter: "Ticketbearbeiter",
};
