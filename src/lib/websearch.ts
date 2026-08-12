// -------- Web-Suche (Investoren-Recherche) --------
// Der Agent (agent.ts) hat sonst keinen Internetzugriff – die Groq-Modelle im
// Fallback-Pfad unterstützen bei aktivierten Custom-Tools kein eigenes
// Browsing. Für die Investoren-Recherche ("search_investoren_web"-Tool)
// binden wir deshalb Tavily an: eine dedizierte Such-API für LLM-Agenten,
// einfachste Integration (ein POST-Call mit API-Key, kein OAuth), mit
// kompakten, bereits vorstrukturierten Ergebnissen (Titel/URL/Snippet).
//
// Bewusst NICHT für LinkedIn/Xing-Profile "gescraped" – Tavily liefert nur
// öffentlich indexierte Suchergebnisse (wie eine normale Suchmaschine), keine
// automatisierten Zugriffe auf einzelne Profile. Das entspricht den ToS
// dieser Plattformen eher als ein dedizierter Scraper (siehe README/BRAND_GUIDE
// bzw. die DSGVO-Hinweise zum Investoren-Modul).

export interface WebSearchTreffer {
  titel: string;
  url: string;
  snippet: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/**
 * Führt eine Websuche über Tavily aus. Wirft eine sprechende Fehlermeldung,
 * wenn kein TAVILY_API_KEY konfiguriert ist, statt still leere Ergebnisse zu
 * liefern – der Agent kann diese Meldung 1:1 an den Nutzer weiterreichen.
 */
export async function webSearch(
  query: string,
  opts: { maxResults?: number; timeoutMs?: number } = {}
): Promise<WebSearchTreffer[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Websuche ist nicht konfiguriert (TAVILY_API_KEY fehlt). Bitte in den Umgebungsvariablen setzen " +
        "(Key erstellen: https://app.tavily.com) – ohne diesen Key kann der Agent keine neuen Investoren im Web recherchieren."
    );
  }
  const maxResults = Math.min(Math.max(opts.maxResults ?? 5, 1), 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "advanced",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Tavily antwortete mit ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (json.results || []).map((r) => ({
      titel: r.title || "(ohne Titel)",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 600),
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/** true, wenn die Websuche konfiguriert ist (fürs UI, um den Button ggf. auszugrauen). */
export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}
