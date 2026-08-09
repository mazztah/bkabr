import { NextResponse } from "next/server";

/**
 * Dedizierter, minimaler Health-Check-Endpoint für Fly.io.
 *
 * Vorher zeigte fly.toml auf "/" – das ist die volle Dashboard-Startseite
 * (Layout mit LeftNav/GlobalTopBar/ChatWindow/Sidebar/WorkspacePanel, dazu
 * client-seitiges fetchAll() beim Mount). Für JEDEN Health-Check-Tick
 * (alle 15-30s laut fly.toml) musste Next.js dafür serverseitig den
 * kompletten App-Baum rendern – auf einer 1-vCPU-Maschine spürbare, völlig
 * unnötige Konkurrenz zu echten Nutzeranfragen und den Hintergrund-
 * Schedulern (Kalender-Ticker, NATS-Log-Stream, Observability-Scheduler).
 *
 * Diese Route tut NICHTS außer sofort 200 OK zurückzugeben: kein DB-Zugriff,
 * keine Layout-Auflösung, keine Client-Komponenten. Route Segment Config
 * unten erzwingt zusätzlich, dass Next.js hier nichts cached oder statisch
 * vorrendert, was bei einem Health-Check kontraproduktiv wäre.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
