import { NextRequest, NextResponse } from "next/server";
import { ablageDb, logEvent } from "@/lib/db";
import { extractTextFromFile } from "@/lib/document-ocr";
import { storeFile } from "@/lib/storage";
import { uid } from "@/lib/utils";
import { AblageVersionEintrag } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lädt eine neue Version einer bestehenden Ablage-Datei hoch. Die bisherige
 * Version wird NICHT gelöscht, sondern unverändert in `historie` archiviert
 * (eigener storedFileName bleibt erhalten) — echte Versionierung statt
 * Überschreiben, damit ältere Stände jederzeit nachvollziehbar bleiben.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await ablageDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kommentar = (formData.get("kommentar") as string | null) || undefined;
    if (!file) return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });

    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    const ocr = await extractTextFromFile(buffer, mimeType, file.name);

    const neuerStoredFileName = await storeFile(uid(), file.name, buffer);

    const archivEintrag: AblageVersionEintrag = {
      version: bestehend.version || 1,
      storedFileName: bestehend.storedFileName,
      dateiName: bestehend.dateiName,
      mimeType: bestehend.mimeType,
      groesse: bestehend.groesse,
      ersetztAm: new Date().toISOString(),
      ersetztVon: auth.id,
      kommentar,
    };

    const aktualisiert = await ablageDb.update(id, {
      dateiName: file.name,
      storedFileName: neuerStoredFileName,
      mimeType,
      groesse: buffer.length,
      extraktText: ocr.error ? bestehend.extraktText : ocr.text,
      version: (bestehend.version || 1) + 1,
      historie: [archivEintrag, ...(bestehend.historie || [])],
    });

    await logEvent(
      "aenderung",
      `„${bestehend.dateiName}" als Version ${(bestehend.version || 1) + 1} aktualisiert.`,
      { art: "Ablage", id }
    );
    await logAudit({
      table: "ablage",
      recordId: id,
      aktion: "update",
      changedBy: auth.id,
      oldData: { version: bestehend.version, dateiName: bestehend.dateiName },
      newData: { version: aktualisiert?.version, dateiName: aktualisiert?.dateiName },
    });

    return NextResponse.json({ ablage: aktualisiert });
  } catch (e: unknown) {
    console.error("Neue-Version-Fehler:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Hochladen der neuen Version fehlgeschlagen" },
      { status: 500 }
    );
  }
}
