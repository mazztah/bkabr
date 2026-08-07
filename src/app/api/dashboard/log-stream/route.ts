import { getSystemLogStream } from "@/lib/observability-stream";
import { getFunComments } from "@/lib/fun-mode";

/**
 * GET /api/dashboard/log-stream
 * Server-Sent Events (SSE) für Live-Tailing des System-Logs im Stil der
 * Fly.io "Live Machine Logs". Sendet:
 *   - event: "init"   → die letzten 20 Log-Einträge
 *   - event: "log"    → neue System-Log-Einträge (Polling alle 3s)
 *   - event: "fun"    → humorvolle Agenten-Kommentare (Spaßmodus)
 *   - event: "ping"   → Keepalive
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

// Initial senden
      getSystemLogStream(20).then((log) => {
        send("init", log);
      });

      const logInterval = setInterval(async () => {
        try {
          const log = await getSystemLogStream(20);
          send("log", log);
        } catch (err) {
          send("error", { message: err instanceof Error ? err.message : String(err) });
        }
      }, 3000);

      // Spaßmodus-Kommentar, falls gewünscht (~alle 30s)
      const funInterval = setInterval(() => {
        const comment = getFunComments();
        if (comment) send("fun", { text: comment });
      }, 30000);

      const keepalive = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 15000);

      // Cleanup bei Verbindungsende
      const cleanup = () => {
        clearInterval(logInterval);
        clearInterval(funInterval);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      (controller as unknown as { _cleanup?: () => void })._cleanup = cleanup;
    },
    cancel() {
      // Optional: hier Cleanup, falls der Client disconnctet
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

