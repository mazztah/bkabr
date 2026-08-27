import { NextRequest, NextResponse } from "next/server";
import { logEvent, eigentuemerDb } from "@/lib/db";
import { Eigentuemer } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const eigentuemer = await eigentuemerDb.list(
    liegenschaftId ? ({ liegenschaftId } as any) : undefined
  );
  return NextResponse.json({ eigentuemer });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.liegenschaftId) {
    return NextResponse.json({ error: "liegenschaftId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const eigentuemer: Eigentuemer = {
    id: uid(),
    liegenschaftId: body.liegenschaftId,
    name: body.name || "Neuer Eigentümer",
    anschrift: body.anschrift,
    email: body.email,
    telefon: body.telefon,
    miteigentumsanteil: body.miteigentumsanteil,
    vollmachtVon: body.vollmachtVon,
    vollmachtBis: body.vollmachtBis,
    dateiName: body.dateiName,
    storedFileName: body.storedFileName,
    mimeType: body.mimeType,
    extraktText: body.extraktText,
    notizen: body.notizen,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await eigentuemerDb.create(eigentuemer);
  await logEvent("anlage", `Eigentümer „${saved.name}" angelegt.`, { art: "Eigentümer", id: saved.id });
  await logAudit({ table: "eigentuemer", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ eigentuemer: saved });
}
