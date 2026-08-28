import { NextRequest, NextResponse } from "next/server";
import { zaehlerDb, logEvent } from "@/lib/db";
import { Zaehler } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const EINHEIT_VORSCHLAG: Record<string, string> = {
  Strom: "kWh",
  Gas: "m³",
  "Wasser (kalt)": "m³",
  "Wasser (warm)": "m³",
  Wärme: "kWh",
  Sonstige: "",
};

export async function GET(req: NextRequest) {
  const auth = await requirePermission("zaehler", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const wohnungId = req.nextUrl.searchParams.get("wohnungId") || undefined;
  const filter: Partial<Zaehler> = {};
  if (liegenschaftId) filter.liegenschaftId = liegenschaftId;
  if (wohnungId) filter.wohnungId = wohnungId;
  const zaehler = await zaehlerDb.list(Object.keys(filter).length ? filter : undefined);
  return NextResponse.json({ zaehler });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.zaehlernummer || !body.art || !body.liegenschaftId) {
    return NextResponse.json(
      { error: "zaehlernummer, art und liegenschaftId sind erforderlich" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const zaehler: Zaehler = {
    id: uid(),
    zaehlernummer: body.zaehlernummer,
    art: body.art,
    einheit: body.einheit || EINHEIT_VORSCHLAG[body.art] || "",
    liegenschaftId: body.liegenschaftId,
    gebaeudeId: body.gebaeudeId || undefined,
    wohnungId: body.wohnungId || undefined,
    standortDetail: body.standortDetail || undefined,
    einbauDatum: body.einbauDatum || undefined,
    status: body.status || "Aktiv",
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await zaehlerDb.create(zaehler);
  await logEvent("anlage", `Zähler „${saved.zaehlernummer}" (${saved.art}) angelegt.`, {
    art: "Zaehler",
    id: saved.id,
  });
  await logAudit({ table: "zaehler", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ zaehler: saved });
}
