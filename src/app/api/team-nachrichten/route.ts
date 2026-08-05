import { NextRequest, NextResponse } from "next/server";
import { teamNachrichtenDb } from "@/lib/db";
import { TeamNachricht } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET() {
  const nachrichten = await teamNachrichtenDb.list();
  return NextResponse.json({
    nachrichten: [...nachrichten].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).slice(-200),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.autorName?.trim() || !body.text?.trim()) {
    return NextResponse.json({ error: "autorName und text sind erforderlich" }, { status: 400 });
  }
  const nachricht: TeamNachricht = {
    id: uid(),
    autorName: body.autorName.trim(),
    text: body.text.trim(),
    emoji: body.emoji || undefined,
    liegenschaftId: body.liegenschaftId || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const saved = await teamNachrichtenDb.create(nachricht);
  return NextResponse.json({ nachricht: saved });
}
