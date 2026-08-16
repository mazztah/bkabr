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
        // Bewusst KEIN zweiter KI-Aufruf mehr für die Fehler-Erklärung: Der
        // Agent ist gerade fehlgeschlagen – meistens, weil die GESAMTE
        // Modell-Fallback-Kette erschöpft ist (siehe groq-client.ts). Ein
        // zweiter createChatCompletion-Aufruf über chatWithContext läuft
        // durch dieselbe Kette und landet dann auf demselben instabilen
        // Rest – in der Praxis beobachtet z.B. bei „suche 10 neue
        // KI-Investoren aus Deutschland und den USA“: statt ehrlich den
        // Fehler zu nennen, hat das schwache Restmodell eine völlig
        // themenfremde, frei erfundene Antwort geliefert (eine Liste von
        // Briefvorlagen), ohne dass für den Nutzer erkennbar war, dass der
        // eigentliche Auftrag gar nicht ausgeführt wurde. Eine statische
        // Fehlermeldung ist hier zuverlässiger als eine weitere unsichere
        // KI-Antwort, die genau dasselbe Problem (erschöpfte Kette) noch
        // einmal treffen kann.
        const kurzerAuftrag = message.length > 200 ? message.slice(0, 200) + "…" : message;
        return NextResponse.json({
          reply: `Der Agent konnte diesen Auftrag gerade technisch nicht ausführen:\n\n„${kurzerAuftrag}“\n\nFehler: ${agentErr?.message || "unbekannt"}\n\nBitte die Nachricht gleich nochmal senden – meist liegt es an einem vorübergehenden Rate-Limit bei einem der KI-Modelle (siehe Mission Control → Cost & Rate-Limits). Tritt es wiederholt auf, bitte die Live-Systemlogs dort prüfen.`,
          agent: false,
          agentError: agentErr?.message || String(agentErr),
        });
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
