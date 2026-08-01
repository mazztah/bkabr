import { NextRequest, NextResponse } from "next/server";
import { isAgentIntent, runAgent } from "@/lib/agent";

/**
 * POST /api/agent
 * Lässt den LLM-Agenten einen Workflow ausführen (z.B. Mahnungen für eine Straße).
 * Body: { message: string, history?: [...], path?: string, force?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
    }

    if (!body.force && !isAgentIntent(message)) {
      return NextResponse.json(
        {
          error: "Kein Agenten-Auftrag erkannt",
          hint: "Formuliere z.B. „Erstelle alle Mahnungen für die Spannhagengartenstraße“ oder setze force: true.",
        },
        { status: 400 }
      );
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (m: any) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
          .slice(-8)
      : [];

    const result = await runAgent({
      message,
      history,
      path: typeof body.path === "string" ? body.path : undefined,
    });

    return NextResponse.json({
      reply: result.reply,
      steps: result.steps.map((s) => ({ tool: s.tool, args: s.args })),
      createdBriefIds: result.createdBriefIds,
      agent: true,
    });
  } catch (e: any) {
    console.error("Agent error:", e);
    return NextResponse.json(
      { error: e.message || "Agent-Lauf fehlgeschlagen" },
      { status: 500 }
    );
  }
}
