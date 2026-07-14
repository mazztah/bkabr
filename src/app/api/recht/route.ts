import { NextRequest, NextResponse } from "next/server";
import { rechtCheck } from "@/lib/ai";
import { getAbrechnung } from "@/lib/db";
import { RECHT_CONTENT } from "@/lib/recht-content";

export async function GET() {
  return NextResponse.json({ content: RECHT_CONTENT });
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json().catch(() => ({ id: null }));
    const abrechnung = id ? await getAbrechnung(id) : null;

    const analysis = await rechtCheck(abrechnung ?? null, RECHT_CONTENT);

    return NextResponse.json({
      analysis,
      sources: "gesetze-im-internet.de, bundesgerichtshof.de",
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Recht error:", e);
    return NextResponse.json({ error: e.message || "Rechtsprüfung fehlgeschlagen" }, { status: 500 });
  }
}
