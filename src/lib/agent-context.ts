// ============================================================================
// Rechteprüfung für den KI-Agenten (Sicherheitsbericht 21.09.2026, Punkt 2)
// ============================================================================
// Der Agent führt Lese-, Schreib- und Löschaktionen direkt auf der Datenbank aus
// und umging bisher Modulrechte. Jetzt läuft jeder Agent-Aufruf im Kontext des
// angemeldeten Nutzers (AsyncLocalStorage); executeTool() prüft je Tool das
// passende Modulrecht.
//
// Ohne Kontext (z. B. vom Server ausgelöste Zeitpläne des Agenten) bleibt das
// Verhalten unverändert: keine Prüfung. Diese Läufe sind serverseitig
// gestartet, nicht durch eine Anfrage von außen.
//
// Unbekannte Tools werden verweigert (Modul „systemadministration“, admin).

import { AsyncLocalStorage } from "node:async_hooks";
import type { Aktion, AuthUser, Modul } from "./auth";

const store = new AsyncLocalStorage<AuthUser>();

export function runWithAgentUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  return store.run(user, fn);
}

export function currentAgentUser(): AuthUser | undefined {
  return store.getStore();
}

function has(user: AuthUser, modul: Modul, aktion: Aktion): boolean {
  return user.rechte.has(`${modul}:${aktion}`) || user.rechte.has(`${modul}:admin`);
}

/** true, wenn der Agent im aktuellen Kontext die Aktion ausführen darf (ohne Nutzerkontext: true). */
export function agentUserCan(modul: Modul, aktion: Aktion): boolean {
  const u = store.getStore();
  return !u || has(u, modul, aktion);
}

// Reihenfolge zählt: spezifische Begriffe vor allgemeinen.
const DOMAIN_RULES: [RegExp, Modul][] = [
  [/flurstueck|grundbuch/, "liegenschaften"],
  [/zaehler/, "zaehler"],
  [/anlagen/, "anlagen"],
  [/(^|_)vertraege($|_)/, "vertraege"],
  [/kalender|schedule/, "kalender"],
  [/ablage|dokument/, "dokumente"],
  [/investor|abrechnung|buchung|befund|pruef|brief|rueckstaend|rueckstand/, "finanzen"],
  [/liegenschaft|gebaeude|wohnung|mieter|mietvertr|pm_vertrag|reassign|merge|cleanup/, "immobilien"],
];

/** Modul + Aktion, die ein Agent-Tool benötigt. */
export function toolPermission(name: string): { modul: Modul; aktion: Aktion } {
  let aktion: Aktion = "write";
  if (/^(list|get|find|vorschau|search|evaluate|analyze)_/.test(name)) aktion = "read";
  else if (/^delete_/.test(name) || /^(merge_|execute_safe_cleanup)/.test(name)) aktion = "delete";
  const hit = DOMAIN_RULES.find(([re]) => re.test(name));
  if (!hit) return { modul: "systemadministration", aktion: "admin" };
  return { modul: hit[1], aktion };
}

/** Fehlertext, wenn das Tool nicht erlaubt ist, sonst null. */
export function agentToolDenied(name: string): string | null {
  const u = store.getStore();
  if (!u) return null;
  const { modul, aktion } = toolPermission(name);
  if (has(u, modul, aktion)) return null;
  return `Keine Berechtigung für ${modul}:${aktion} (Tool ${name}). Die Aktion wurde nicht ausgeführt.`;
}
