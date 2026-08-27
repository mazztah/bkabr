// ============================================================================
// Audit-Log-Helper (SEC-003) für Module, die (noch) NICHT über
// DB_SUPABASE_MODULES auf Postgres laufen.
// ============================================================================
// Für die bereits per Postgres-Trigger protokollierten Tabellen
// (liegenschaften, gebaeude, wohnungen, mieter, mietvertraege — siehe
// log_audit_change() in schema_auth.sql) ist dieser Helper NICHT nötig, der
// Trigger erledigt es automatisch. Für alle anderen, noch JSON-basierten
// Module (Tickets, Verträge, Ablage, …) ruft die jeweilige API-Route diese
// Funktion explizit auf, bis das Modul selbst auf Postgres umgestellt ist.
//
// Schreibt IMMER nach Supabase (unabhängig vom DB_BACKEND des jeweiligen
// Moduls) — genau wie das bestehende Agent-Gedächtnis in supabase.ts ist
// dies eine separate, eigenständige Aufzeichnung, kein Teil der
// JSON-Datei. Fehlerverhalten bewusst wie bei supabase.ts: warnen, nicht
// werfen, damit ein Audit-Log-Ausfall nie einen eigentlichen
// Schreibvorgang blockiert. Für produktiven SEC-003-Nachweis sollte dieses
// "fail open"-Verhalten vor Abnahme bewusst nochmal bewertet werden (siehe
// AUTH_AND_RBAC.md).

import { getSupabaseClient } from "./supabase";

export type AuditAktion = "insert" | "update" | "delete";

export async function logAudit(params: {
  table: string;
  recordId: string | null;
  aktion: AuditAktion;
  changedBy: string | null; // AuthUser.id, oder null falls Auth nicht konfiguriert
  oldData?: unknown;
  newData?: unknown;
}): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return; // Supabase nicht konfiguriert → kein Audit-Log möglich, still übersprungen
  // "system"-Fallback-User (siehe auth.ts) ist kein echter profiles-Eintrag
  // und darf nicht als FK-Wert geschrieben werden.
  const changedBy = params.changedBy && params.changedBy !== "system" ? params.changedBy : null;
  try {
    const { error } = await sb.from("audit_log").insert({
      table_name: params.table,
      record_id: params.recordId,
      aktion: params.aktion,
      changed_by: changedBy,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.warn("[audit] logAudit fehlgeschlagen:", err instanceof Error ? err.message : err);
  }
}
