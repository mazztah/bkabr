import { NextRequest, NextResponse } from "next/server";
import { agentSchedulesDb } from "@/lib/db";
import { executeAgentSchedule } from "@/lib/scheduler";

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schedule = await agentSchedulesDb.get(id);
  if (!schedule) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const lauf = await executeAgentSchedule(schedule);
  const updated = await agentSchedulesDb.get(id);
  return NextResponse.json({ lauf, schedule: updated });
}
