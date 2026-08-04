import { NextRequest, NextResponse } from "next/server";
import { agentSchedulesDb, logEvent } from "@/lib/db";
import { AgentSchedule, AgentScheduleRecurrence } from "@/lib/types";
import { computeNextRun, validateRecurrence } from "@/lib/schedule";
import { uid } from "@/lib/utils";

export async function GET() {
  const items = await agentSchedulesDb.list();
  items.sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());
  return NextResponse.json({ schedules: items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const recurrence = body.recurrence as AgentScheduleRecurrence;

    if (!name) return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Auftrag/Prompt fehlt." }, { status: 400 });
    if (!recurrence || !["intervall", "taeglich", "woechentlich"].includes(recurrence.art)) {
      return NextResponse.json({ error: "Ungültige Wiederholungsregel." }, { status: 400 });
    }
    const validationError = validateRecurrence(recurrence);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const now = new Date().toISOString();
    const schedule: AgentSchedule = {
      id: uid(),
      name,
      prompt,
      recurrence,
      aktiv: body.aktiv !== false,
      liegenschaftId: body.liegenschaftId || undefined,
      liegenschaftName: body.liegenschaftName || undefined,
      nextRunAt: computeNextRun(recurrence).toISOString(),
      historie: [],
      createdAt: now,
      updatedAt: now,
    };

    const saved = await agentSchedulesDb.create(schedule);
    await logEvent("anlage", `Kalender-Aufgabe „${saved.name}" angelegt.`, {
      art: "AgentSchedule",
      id: saved.id,
    });
    return NextResponse.json({ schedule: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Anlegen fehlgeschlagen" }, { status: 500 });
  }
}
