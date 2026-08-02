import { NextResponse } from "next/server";
import { runPlausibilitaetspruefung } from "@/lib/pruefung";

export async function POST() {
  try {
    const lauf = await runPlausibilitaetspruefung();
    return NextResponse.json({ lauf });
  } catch (e: any) {
    console.error("Plausibilitätsprüfung fehlgeschlagen:", e);
    return NextResponse.json({ error: e.message || "Prüfung fehlgeschlagen" }, { status: 500 });
  }
}
