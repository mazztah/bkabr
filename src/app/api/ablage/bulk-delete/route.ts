import { NextRequest, NextResponse } from "next/server";
import { ablageDb, logEvent } from "@/lib/db";
import { deleteStoredFile } from "@/lib/storage";

/**
 * Löscht alle Ablage-Dokumente, die (noch) nicht zugeordnet sind (Status "neu",
 * "in_pruefung" oder "verworfen"). Erfordert eine explizite Bestätigung im Body
 * ({ bestaetigt: true }), da dies eine unumkehrbare Aktion ist – im Frontend
 * fragt der Agent vorher aktiv nach, ob der Nutzer sich sicher ist.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.bestaetigt !== true) {
    return NextResponse.json(
      { error: "Bestätigung erforderlich (bestaetigt: true)." },
      { status: 400 }
    );
  }

  const alle = await ablageDb.list();
  const zuLoeschen = alle.filter((a) => a.status !== "zugeordnet");

  for (const doc of zuLoeschen) {
    await deleteStoredFile(doc.storedFileName);
    await ablageDb.remove(doc.id);
  }

  await logEvent(
    "loeschung",
    `${zuLoeschen.length} nicht zugeordnete Dokument(e) aus der Ablage gelöscht: ${zuLoeschen
      .map((d) => d.dateiName)
      .slice(0, 10)
      .join(", ")}${zuLoeschen.length > 10 ? ", …" : ""}.`
  );

  return NextResponse.json({ gelöscht: zuLoeschen.length });
}
