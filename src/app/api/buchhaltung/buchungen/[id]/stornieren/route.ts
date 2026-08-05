import { NextRequest, NextResponse } from "next/server";
import { buchungStornieren } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await buchungStornieren(id, body.grund);
  if (!result.ok) return NextResponse.json({ error: result.fehler }, { status: 400 });
  return NextResponse.json({ storno: result.storno });
}
