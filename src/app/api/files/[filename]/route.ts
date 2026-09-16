import { NextRequest, NextResponse } from "next/server";
import { readStoredFile } from "@/lib/storage";
import { requireUser } from "@/lib/auth";

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
    const mime = req.nextUrl.searchParams.get("mime") || "application/octet-stream";
    const name = req.nextUrl.searchParams.get("name") || filename;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }
}
