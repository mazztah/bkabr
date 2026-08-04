import { NextRequest, NextResponse } from "next/server";
import { agentSchedulesDb, logEvent } from "@/lib/db";
import { AgentScheduleRecurrence } from "@/lib/types";
import { computeNextRun, validateRecurrence } from "@/lib/schedule";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schedule = await agentSchedulesDb.get(id);
  if (!schedule) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ schedule });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await agentSchedulesDb.get(id);
    if (!existing) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.prompt === "string" && body.prompt.trim()) patch.prompt = body.prompt.trim();
    if (typeof body.aktiv === "boolean") patch.aktiv = body.aktiv;
    if (body.liegenschaftId !== undefined) patch.liegenschaftId = body.liegenschaftId || undefined;
    if (body.liegenschaftName !== undefined) patch.liegenschaftName = body.liegenschaftName || undefined;

    if (body.recurrence) {
      const recurrence = body.recurrence as AgentScheduleRecurrence;
      const validationError = validateRecurrence(recurrence);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
      patch.recurrence = recurrence;
      // Neue Regel -> nächste Fälligkeit neu berechnen (ab jetzt, nicht ab altem Lauf)
      patch.nextRunAt = computeNextRun(recurrence).toISOString();
    }

    const updated = await agentSchedulesDb.update(id, patch);
    if (!updated) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ schedule: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Aktualisieren fehlgeschlagen" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await agentSchedulesDb.get(id);
  if (!existing) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const ok = await agentSchedulesDb.remove(id);
  if (ok) {
    await logEvent("loeschung", `Kalender-Aufgabe „${existing.name}" gelöscht.`, {
      art: "AgentSchedule",
      id,
    });
  }
  return NextResponse.json({ ok });
}
