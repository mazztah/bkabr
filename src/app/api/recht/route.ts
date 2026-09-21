import { NextRequest, NextResponse } from "next/server";
import { rechtCheck } from "@/lib/ai";
import { getAbrechnung } from "@/lib/db";
import { RECHT_CONTENT } from "@/lib/recht-content";
import { requirePermission, requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ content: RECHT_CONTENT });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

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
