import { NextRequest, NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai";
import { isAgentIntent, runAgent } from "@/lib/agent";
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
    const body = await req.json();
    const { message, id, path, history, forceAgent } = body || {};
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (m: any) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
          .slice(-10)
      : [];

    // Agent-Workflow: Briefe/Mahnungen erstellen
    if (forceAgent || isAgentIntent(message)) {
      try {
        const result = await runAgent({
          message,
          history: safeHistory,
          path: typeof path === "string" ? path : "/",
        });
        return NextResponse.json({
          reply: result.reply,
          agent: true,
          createdBriefIds: result.createdBriefIds,
          steps: result.steps.map((s) => s.tool),
        });
      } catch (agentErr: any) {
        console.error("Agent error, falling back to chat:", agentErr);
        // Fallback: normaler Chat mit Hinweis
        try {
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
          const reply = await chatWithContext({
            message:
              message +
              `\n\n[Systemhinweis: Der Agent ist fehlgeschlagen (${agentErr?.message || "unbekannt"}). Wenn der Nutzer Hinweise/Fehler bereinigen, Gebäude anlegen oder unpassende Dokumente sehen will, erkläre den Fehler ehrlich und dass ein erneuter Versuch oder Server-Log-Prüfung nötig ist – NICHT auf manuelle Mahnungen/Schriftverkehr verweisen, wenn der Auftrag Stammdaten-Bereinigung war.]`,
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
          return NextResponse.json({
            reply,
            agent: false,
            agentError: agentErr?.message || String(agentErr),
          });
        } catch (chatErr: any) {
          return NextResponse.json(
            {
              error:
                chatErr?.message ||
                agentErr?.message ||
                "Chat und Agent fehlgeschlagen. Bitte GROQ_API_KEY und Server-Logs prüfen.",
            },
            { status: 500 }
          );
        }
      }
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

    return NextResponse.json({ reply, agent: false });
  } catch (e: any) {
    console.error("Chat error:", e);
    const msg = e?.message || "Chat fehlgeschlagen";
    // Häufigster Fall: fehlender API-Key
    const hint = /GROQ_API_KEY/i.test(msg)
      ? " Bitte GROQ_API_KEY in .env.local bzw. als Fly-Secret setzen."
      : "";
    return NextResponse.json({ error: msg + hint }, { status: 500 });
  }
}
