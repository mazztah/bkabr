import { NextRequest, NextResponse } from "next/server";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
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
