import { NextRequest, NextResponse } from "next/server";
import { zaehlerDb, zaehlerAblesungenDb, logEvent } from "@/lib/db";
import { ZaehlerAblesung } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { pickAllowed } from "@/lib/patch-whitelist";
import { zaehlernummerVergeben } from "@/lib/validierung";
import type { Zaehler } from "@/lib/types";

// Nicht überschreibbar: id, createdAt, updatedAt
const ZAEHLER_PATCH_FELDER = [
  "zaehlernummer", "art", "einheit", "liegenschaftId", "gebaeudeId", "wohnungId", "standortDetail",
  "einbauDatum", "status", "notizen",
] as const satisfies ReadonlyArray<keyof Zaehler>;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const zaehler = await zaehlerDb.get(id);
  if (!zaehler) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ zaehler });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await zaehlerDb.get(id);
  const patch = pickAllowed<Zaehler>(await req.json().catch(() => ({})), ZAEHLER_PATCH_FELDER);
  if (vorher && (patch.zaehlernummer !== undefined || patch.art !== undefined)) {
    const art = patch.art ?? vorher.art;
    const nummer = patch.zaehlernummer ?? vorher.zaehlernummer;
    if (zaehlernummerVergeben(await zaehlerDb.list(), art, String(nummer), id)) {
      return NextResponse.json({ error: `Zählernummer „${nummer}" ist für die Art ${art} bereits vergeben.` }, { status: 409 });
    }
  }
  const zaehler = await zaehlerDb.update(id, patch);
  if (!zaehler) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "zaehler", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: zaehler });
  return NextResponse.json({ zaehler });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await zaehlerDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const ablesungen = await zaehlerAblesungenDb.list({ zaehlerId: id } as Partial<ZaehlerAblesung>);
  for (const a of ablesungen) await zaehlerAblesungenDb.remove(a.id);

  const success = await zaehlerDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Zähler „${bestehend.zaehlernummer}" gelöscht.`, { art: "Zaehler", id });
    await logAudit({ table: "zaehler", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
