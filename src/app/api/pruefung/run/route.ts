import { NextResponse } from "next/server";
import { runPlausibilitaetspruefung } from "@/lib/pruefung";
import { requirePermission } from "@/lib/auth";

export async function POST() {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  try {
    const lauf = await runPlausibilitaetspruefung();
    return NextResponse.json({ lauf });
  } catch (e: any) {
    console.error("Plausibilitätsprüfung fehlgeschlagen:", e);
    return NextResponse.json({ error: e.message || "Prüfung fehlgeschlagen" }, { status: 500 });
  }
}
