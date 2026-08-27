import { NextRequest, NextResponse } from "next/server";
import { liegenschaftenDb, logEvent } from "@/lib/db";
import { Liegenschaft } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Referenzmuster für alle weiteren API-Routen (Phase 0, Durchgang 14):
// 1. requirePermission(modul, aktion) zuerst — liefert entweder den
//    AuthUser oder eine fertige 401/403-NextResponse.
// 2. Eigentliche Datenoperation wie bisher über *Db (liegenschaftenDb etc.).
// 3. logAudit() zusätzlich zu logEvent() — logEvent bleibt die
//    menschenlesbare Aktivitäts-Anzeige in der UI, logAudit() ist der
//    SEC-003-Nachweis mit Aktor-ID und Vorher-/Nachher-Daten.
//    (Sobald "liegenschaften" komplett über DB_SUPABASE_MODULES läuft,
//    übernimmt der Postgres-Trigger log_audit_change() das automatisch —
//    logAudit() hier bleibt dann als Sicherheitsnetz für den JSON-Pfad
//    bestehen, bis alle Umgebungen umgestellt sind.)

export async function GET() {
  const auth = await requirePermission("liegenschaften", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaften = await liegenschaftenDb.list();
  return NextResponse.json({ liegenschaften });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const liegenschaft: Liegenschaft = {
    id: uid(),
    name: body.name || "Neue Liegenschaft",
    strasse: body.strasse || "",
    hausnummer: body.hausnummer || "",
    plz: body.plz || "",
    ort: body.ort || "",
    grundstuecksflaeche: body.grundstuecksflaeche,
    flurstueck: body.flurstueck,
    notizen: body.notizen,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await liegenschaftenDb.create(liegenschaft);
  await logEvent("anlage", `Liegenschaft „${saved.name}" angelegt.`, { art: "Liegenschaft", id: saved.id });
  await logAudit({ table: "liegenschaften", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ liegenschaft: saved });
}
