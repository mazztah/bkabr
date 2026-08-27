import { NextRequest, NextResponse } from "next/server";
import { deleteAbrechnung, getAbrechnung, updateAbrechnung } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const abrechnung = await getAbrechnung(id);
  if (!abrechnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ abrechnung });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await getAbrechnung(id);
  const patch = await req.json();
  const abrechnung = await updateAbrechnung(id, patch);
  if (!abrechnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "abrechnungen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: abrechnung });
  return NextResponse.json({ abrechnung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await getAbrechnung(id);
  const ok = await deleteAbrechnung(id);
  if (ok) {
    await logAudit({ table: "abrechnungen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success: ok });
}
