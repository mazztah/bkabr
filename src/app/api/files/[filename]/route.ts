import { NextRequest, NextResponse } from "next/server";
import { readStoredFile } from "@/lib/storage";
import { requireUser } from "@/lib/auth";
import { auslieferung } from "@/lib/upload-policy";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  // Bisher ungeschützt (jeder mit bekanntem/geratenem Dateinamen konnte
  // jede Datei abrufen) — Login jetzt Pflicht. Feingranularere
  // Rechteprüfung (welches Modul das Dokument gehört) würde eine
  // Rückverfolgung vom Dateinamen zum Ablage-/Anhang-Datensatz erfordern;
  // als erster, wichtigster Schritt reicht "eingeloggt" hier aus.
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { filename } = await params;
  // Pfad-Traversal verhindern: nur einfache, generierte Dateinamen erlauben
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Ungültiger Dateiname" }, { status: 400 });
  }
  try {
    const buffer = await readStoredFile(filename);
    // Der Content-Type kommt aus der Endung der gespeicherten Datei, NICHT aus dem URL-Parameter "mime"
    // (sonst wäre hochgeladenes HTML als text/html im Kontext der App auslieferbar = Stored XSS).
    // Nur PDF, Bilder und Text werden inline angezeigt, alles andere als Download.
    const { mime, inline } = auslieferung(filename);
    const name = req.nextUrl.searchParams.get("name") || filename;
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(name)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    // PDFs brauchen für den Browser-Viewer eine lockerere Richtlinie; alles andere darf nichts nachladen/ausführen.
    if (mime !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
    return new NextResponse(new Uint8Array(buffer), { headers });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }
}
