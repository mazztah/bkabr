import { NextRequest, NextResponse } from "next/server";
import { generateAnschreiben } from "@/lib/ai";
import { getAbrechnung, updateAbrechnung } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { id, anlass } = await req.json();
    const abr = await getAbrechnung(id);
    if (!abr) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const text = await generateAnschreiben(abr, anlass || "Übersendung der Betriebskostenabrechnung");

    const updated = await updateAbrechnung(id, {
      workspace: { ...abr.workspace, anschreiben: text },
    });

    return NextResponse.json({ abrechnung: updated });
  } catch (e: any) {
    console.error("Generate anschreiben error:", e);
    return NextResponse.json({ error: e.message || "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
