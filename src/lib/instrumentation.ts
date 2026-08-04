export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Kalender: wiederkehrende Agent-Aufgaben (z.B. "alle 2h Mahnlauf") im
  // Hintergrund prüfen und bei Fälligkeit automatisch ausführen. Dynamischer
  // Import, damit dieses Modul (und seine Abhängigkeiten wie agent.ts) nicht
  // in den Edge-/Build-Pfad gezogen wird, falls instrumentation.ts dort
  // ebenfalls ausgewertet würde.
  const { startAgentScheduler } = await import("./scheduler");
  startAgentScheduler();

  // tesseract.js nutzt intern Node worker_threads. Wirft der Worker-Thread
  // (z.B. bei einem Netzwerkfehler beim Laden der Sprachdaten) einen Fehler,
  // für den keine dedizierte 'error'-Behandlung vorhanden ist, würde Node
  // den kompletten Prozess beenden. Diese Handler verhindern das, damit ein
  // einzelner fehlgeschlagener OCR-Request nicht die ganze App für alle
  // Nutzer:innen abschießt. Die betroffene Anfrage schlägt trotzdem fehl
  // bzw. läuft in den Timeout – aber der Server bleibt für alle anderen
  // Anfragen erreichbar.
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException] Prozess bleibt aktiv:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection] Prozess bleibt aktiv:", reason);
  });
}
