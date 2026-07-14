import { NextRequest, NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai";
import { getAbrechnung, listAbrechnungen, updateAbrechnung } from "@/lib/db";
import { uid } from "@/lib/utils";
import { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { message, id } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
    }

    const all = await listAbrechnungen();
    const current = id ? (await getAbrechnung(id)) ?? null : null;

    const history = (current?.chat || []).slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: uid(), role: "user", content: message, timestamp: now };

    const reply = await chatWithContext({ message, current, all, history });

    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    };

    if (current) {
      const abrechnung = await updateAbrechnung(
        current.id,
        { chat: [...current.chat, userMsg, assistantMsg] },
        { versioned: false }
      );
      return NextResponse.json({ abrechnung, reply });
    }

    return NextResponse.json({ abrechnung: null, reply });
  } catch (e: any) {
    console.error("Chat error:", e);
    return NextResponse.json({ error: e.message || "Chat fehlgeschlagen" }, { status: 500 });
  }
}
