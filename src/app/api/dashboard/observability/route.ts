import { NextRequest, NextResponse } from "next/server";
import {
  getObservabilityOverview,
  pingModel,
  runMonthlyModelUpdate,
  setFunMode,
} from "@/lib/db";

/**
 * GET /api/dashboard/observability
 * Liefert die vollständige Observability-Übersicht (LLM Mission Control):
 * Modell-Katalog mit Health, Rate-Limits, LED-Wall, Agent-Audit, Summary.
 */
export async function GET() {
  try {
    const overview = await getObservabilityOverview();
    return NextResponse.json({ overview });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/observability]", message);
    return NextResponse.json({ overview: null, _error: message }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/observability
 * Aktionen des Agents/Dashboards:
 *  - { action: "ping", modelId }          → ein Modell pingen
 *  - { action: "monthly_update" }         → monatliches Update anstoßen
 *  - { action: "set_fun_mode", enabled }  → Spaßmodus umschalten
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      modelId?: string;
      enabled?: boolean;
    };

    if (body.action === "ping" && body.modelId) {
      const result = await pingModel(body.modelId);
      return NextResponse.json({ ok: true, result });
    }

    if (body.action === "monthly_update") {
      const result = await runMonthlyModelUpdate();
      return NextResponse.json({ ok: true, result });
    }

    if (body.action === "set_fun_mode") {
      await setFunMode(Boolean(body.enabled));
      return NextResponse.json({ ok: true, funMode: Boolean(body.enabled) });
    }

    return NextResponse.json({ ok: false, fehler: "Unbekannte Aktion." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/observability]", message);
    return NextResponse.json({ ok: false, fehler: message }, { status: 500 });
  }
}
