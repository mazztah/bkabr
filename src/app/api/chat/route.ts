import { NextRequest, NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai";
import {
  getAbrechnung,
  listAbrechnungen,
  liegenschaftenDb,
  gebaeudeDb,
  wohnungenDb,
  mieterDb,
  mietvertraegeDb,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { message, id, path, history } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
    }

    const [all, current, liegenschaften, gebaeude, wohnungen, mieter, mietvertraege] =
      await Promise.all([
        listAbrechnungen(),
        id ? getAbrechnung(id) : Promise.resolve(null),
        liegenschaftenDb.list(),
        gebaeudeDb.list(),
        wohnungenDb.list(),
        mieterDb.list(),
        mietvertraegeDb.list(),
      ]);

    const safeHistory = Array.isArray(history)
      ? history
          .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-10)
      : [];

    const reply = await chatWithContext({
      message,
      current: current ?? null,
      all,
      liegenschaften,
      gebaeude,
      wohnungen,
      mieter,
      mietvertraege,
      history: safeHistory,
      path: typeof path === "string" ? path : "/",
    });

    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error("Chat error:", e);
    return NextResponse.json({ error: e.message || "Chat fehlgeschlagen" }, { status: 500 });
  }
}
