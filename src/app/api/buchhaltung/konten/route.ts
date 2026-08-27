import { NextRequest, NextResponse } from "next/server";
import { kontenDb, logEvent, seedStandardKontenrahmen } from "@/lib/db";
import { Konto } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const konten = await kontenDb.list();
  return NextResponse.json({ konten });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));

  // Sonderfall: Standard-Kontenrahmen anlegen (nur wenn noch keine Konten existieren)
  if (body.seed === true) {
    const konten = await seedStandardKontenrahmen();
    return NextResponse.json({ konten });
  }

  if (!body.name || (body.art !== "Aktiva" && body.art !== "Passiva") || !body.kategorie) {
    return NextResponse.json(
      { error: "name, art ('Aktiva'/'Passiva') und kategorie sind erforderlich" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const konto: Konto = {
    id: uid(),
    name: body.name,
    art: body.art,
    kategorie: body.kategorie,
    saldo: typeof body.saldo === "number" ? body.saldo : 0,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await kontenDb.create(konto);
  await logEvent("anlage", `Konto „${saved.name}" (${saved.art}) angelegt.`, {
    art: "Konto",
    id: saved.id,
  });
  await logAudit({ table: "konten", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ konto: saved });
}
