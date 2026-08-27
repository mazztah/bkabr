import { NextRequest, NextResponse } from "next/server";
import { schriftverkehrDb } from "@/lib/db";
import { saveBriefManuell } from "@/lib/agent";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("dokumente", "read");
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const mieterId = searchParams.get("mieterId") || undefined;
    const templateId = searchParams.get("templateId") || undefined;
    let list = await schriftverkehrDb.list();
    if (mieterId) list = list.filter((d) => d.mieterId === mieterId);
    if (templateId) list = list.filter((d) => d.templateId === templateId);
    list = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ dokumente: list });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    if (!body.mieterId || !body.templateId || !body.text) {
      return NextResponse.json(
        { error: "mieterId, templateId und text sind erforderlich" },
        { status: 400 }
      );
    }
    const doc = await saveBriefManuell({
      mieterId: body.mieterId,
      templateId: body.templateId,
      text: body.text,
      betreff: body.betreff || "",
      werte: body.werte || {},
      status: body.status === "Versandbereit" ? "Versandbereit" : "Entwurf",
    });
    await logAudit({ table: "schriftverkehr", recordId: doc.id, aktion: "insert", changedBy: auth.id, newData: doc });
    return NextResponse.json({ dokument: doc });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
