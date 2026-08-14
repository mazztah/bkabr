import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase dient AUSSCHLIESSLICH als persistentes Gedächtnis für den Agenten
 * (Goal/Plan/Steps/Reflection über einzelne Chat-Turns hinaus) — nicht als
 * Ersatz für die bestehende JSON-Datei-Persistenz der Geschäftsdaten
 * (Liegenschaften, Buchungen etc.). Das hält die Migration risikofrei und
 * den Supabase-Verbrauch auf das Nötigste beschränkt:
 *
 * - GENAU 2 Schreibzugriffe pro Agent-Lauf (ein INSERT beim Start, ein
 *   UPDATE am Ende) statt eines Inserts pro Tool-Schritt — das hält den
 *   Verbrauch im kostenlosen Supabase-Tier auch bei intensiver Nutzung klein.
 * - Reflection (ein zusätzlicher, kleiner LLM-Call) läuft NUR bei Läufen,
 *   die auffällig waren (Max-Steps erreicht, Fehler) — nicht bei jedem
 *   erfolgreichen Lauf. Das spart Tokens, ohne auf die Fähigkeit zu
 *   verzichten, aus Problemen zu lernen.
 * - Läuft die App ohne SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (z.B. lokal
 *   ohne Setup), verhält sich der Agent unverändert wie zuvor — kein Absturz,
 *   nur kein Langzeitgedächtnis. So bleibt "100 % optimal läuft" auch ohne
 *   Supabase-Setup gewährleistet.
 */

let client: SupabaseClient | null | undefined;
let warnedOnce = false;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warnedOnce) {
      console.warn(
        "[supabase] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nicht gesetzt — Agent läuft ohne persistentes Langzeitgedächtnis weiter."
      );
      warnedOnce = true;
    }
    client = null;
    return null;
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}

/** Für andere Module (z.B. db-supabase.ts), die denselben Client-Singleton brauchen. */
export function getSupabaseClient(): SupabaseClient | null {
  return getClient();
}

export type AgentRunStatus = "running" | "success" | "max_steps_reached" | "error";

export interface AgentRunStep {
  tool: string;
  capability: string;
  success: boolean;
  durationMs: number;
  /** Risikoeinstufung des Tools (Decision/Policy-Audit, Durchgang 10) */
  risk: "low" | "medium" | "high";
  /** true = Tool wurde aufgerufen, hat aber wegen fehlender user_confirmed nur einen Vorschlag zurückgegeben */
  awaitingConfirmation?: boolean;
}

export interface AgentRunRecord {
  id: string;
  goal: string;
  path?: string;
  status: AgentRunStatus;
  steps: AgentRunStep[];
  reflection?: string;
  reply?: string;
  createdAt: string;
  updatedAt: string;
}

/** INSERT #1 von 2 — legt den Lauf mit Ziel an. Gibt null zurück, wenn Supabase nicht konfiguriert ist oder der Insert fehlschlägt. */
export async function createAgentRun(goal: string, path?: string): Promise<string | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("agent_runs")
      .insert({ goal, path, status: "running", steps: [] })
      .select("id")
      .single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    console.warn("[supabase] createAgentRun fehlgeschlagen:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** UPDATE #2 von 2 — schreibt Endzustand, Steps und ggf. Reflection in einem einzigen Call. No-op ohne runId. */
export async function completeAgentRun(
  runId: string | null,
  data: { status: AgentRunStatus; steps: AgentRunStep[]; reflection?: string; reply?: string }
): Promise<void> {
  if (!runId) return;
  const sb = getClient();
  if (!sb) return;
  try {
    const { error } = await sb
      .from("agent_runs")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) throw error;
  } catch (err) {
    console.warn("[supabase] completeAgentRun fehlgeschlagen:", err instanceof Error ? err.message : err);
  }
}

/** Für Observability/Dashboard: letzte Läufe lesen (read-only, kein Schreibzugriff). */
export async function listRecentAgentRuns(limit = 20): Promise<AgentRunRecord[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      goal: r.goal,
      path: r.path ?? undefined,
      status: r.status,
      steps: r.steps || [],
      reflection: r.reflection ?? undefined,
      reply: r.reply ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (err) {
    console.warn("[supabase] listRecentAgentRuns fehlgeschlagen:", err instanceof Error ? err.message : err);
    return [];
  }
}
