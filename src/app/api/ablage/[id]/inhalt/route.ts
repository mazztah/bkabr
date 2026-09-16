import { NextRequest, NextResponse } from "next/server";
import { ablageDb, logEvent } from "@/lib/db";
import { readStoredFile, storeFile } from "@/lib/storage";
import { uid } from "@/lib/utils";
import { AblageVersionEintrag } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function istTextdatei(dokument: { mimeType: string; dateiName: string }): boolean {
  return dokument.mimeType.startsWith("text/") || /\.(md|markdown|txt|csv)$/i.test(dokument.dateiName);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const dokument = await ablageDb.get(id);
  if (!dokument) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  if (!istTextdatei(dokument)) {
    return NextResponse.json({ error: "Nur Text-/Markdown-/CSV-Dateien können hier bearbeitet werden." }, { status: 400 });
  }

  try {
    const buffer = await readStoredFile(dokument.storedFileName);
    return NextResponse.json({ inhalt: buffer.toString("utf-8"), dateiName: dokument.dateiName, version: dokument.version });
  } catch {
    return NextResponse.json({ error: "Datei konnte nicht gelesen werden." }, { status: 500 });
  }
}

/**
 * Speichert bearbeiteten Text — bewusst NICHT als Überschreiben der
 * bestehenden Datei, sondern als neue Version (gleiches Prinzip wie
 * POST /version): die vorherige Version bleibt vollständig erhalten.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const dokument = await ablageDb.get(id);
  if (!dokument) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  if (!istTextdatei(dokument)) {
    return NextResponse.json({ error: "Nur Text-/Markdown-/CSV-Dateien können hier bearbeitet werden." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.inhalt !== "string") {
    return NextResponse.json({ error: "inhalt (string) ist erforderlich." }, { status: 400 });
  }

  const buffer = Buffer.from(body.inhalt, "utf-8");
  const neuerStoredFileName = await storeFile(uid(), dokument.dateiName, buffer);

  const archivEintrag: AblageVersionEintrag = {
    version: dokument.version || 1,
    storedFileName: dokument.storedFileName,
    dateiName: dokument.dateiName,
    mimeType: dokument.mimeType,
    groesse: dokument.groesse,
    ersetztAm: new Date().toISOString(),
    ersetztVon: auth.id,
    kommentar: "Manuell bearbeitet",
  };

  const aktualisiert = await ablageDb.update(id, {
    storedFileName: neuerStoredFileName,
    groesse: buffer.length,
    extraktText: body.inhalt.slice(0, 4000),
    version: (dokument.version || 1) + 1,
    historie: [archivEintrag, ...(dokument.historie || [])],
  });

  await logEvent("aenderung", `„${dokument.dateiName}" bearbeitet (Version ${(dokument.version || 1) + 1}).`, {
    art: "Ablage",
    id,
  });
  await logAudit({ table: "ablage", recordId: id, aktion: "update", changedBy: auth.id, newData: { version: aktualisiert?.version } });

  return NextResponse.json({ ok: true, ablage: aktualisiert });
}
