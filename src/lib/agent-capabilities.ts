/**
 * Capability-Layer v1 (schlank).
 *
 * Aus dem Agent-Brainstorming (Kapitel 7): "Ein Tool ist Software, eine
 * Capability ist Wissen" — der Planner soll langfristig in Fähigkeiten
 * denken, nicht in konkreten Tool-Namen, damit Tools austauschbar werden.
 *
 * Für diesen Durchgang bewusst NICHT die volle Architektur (Capability
 * Registry, dynamische Tool-Auswahl, Health-Scoring, Fallback-Ketten) —
 * das wäre ein Rewrite des gesamten Planners mit hohem Risiko für die
 * bestehenden 50+ produktiv genutzten Tools. Stattdessen: jeder Tool-Aufruf
 * wird nachträglich mit einer Capability-ID getaggt (Domäne + Aktion), rein
 * additiv für Observability/Audit im AI Observatory. Das ist die Grundlage,
 * auf der ein späterer Durchgang die echte Abstraktion aufbauen kann, ohne
 * dass hier schon etwas kaputtgehen kann.
 */

const AKTIONS_PRAEFIXE: Array<[RegExp, string]> = [
  [/^list_/, "read"],
  [/^find_/, "read"],
  [/^get_/, "read"],
  [/^create_/, "create"],
  [/^update_/, "update"],
  [/^delete_/, "delete"],
  [/^run_/, "execute"],
  [/^apply_/, "apply"],
  [/^mark_/, "update"],
  [/^analyze_/, "analyze"],
  [/^execute_/, "execute"],
  [/^sync_/, "sync"],
  [/^reassign_/, "update"],
  [/^merge_/, "merge"],
  [/^beende_/, "terminate"],
  [/^vorschau_/, "preview"],
];

const DOMAENEN_STICHWORTE: Array<[RegExp, string]> = [
  [/liegenschaft/, "property"],
  [/gebaeude/, "building"],
  [/wohnung/, "unit"],
  [/mieter/, "tenant"],
  [/mietvertrag/, "lease"],
  [/eigentuemer/, "owner"],
  [/pm_vertrag/, "management_contract"],
  [/brief|schriftverkehr/, "correspondence"],
  [/pruef|befund/, "audit"],
  [/ablage|dokument/, "document"],
  [/abrechnungskreis/, "cost_allocation"],
  [/buchung/, "accounting"],
  [/abrechnung/, "statement"],
  [/cleanup/, "data_quality"],
];

/** Leitet aus einem Tool-Namen eine grobe Capability-ID her (Domäne.Aktion). Rein heuristisch, kein Anspruch auf Vollständigkeit. */
export function inferCapability(toolName: string): string {
  let aktion = "other";
  for (const [re, a] of AKTIONS_PRAEFIXE) {
    if (re.test(toolName)) {
      aktion = a;
      break;
    }
  }
  let domaene = "misc";
  for (const [re, d] of DOMAENEN_STICHWORTE) {
    if (re.test(toolName)) {
      domaene = d;
      break;
    }
  }
  return `${domaene}.${aktion}`;
}
