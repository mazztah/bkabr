import { NextRequest, NextResponse } from "next/server";
import { zaehlerDb, zaehlerAblesungenDb, logEvent } from "@/lib/db";
import { ZaehlerAblesung } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * Liefert die Ablesungen chronologisch sortiert plus eine einfache
 * Verbrauchsauswertung (ZAE-008): Differenz zwischen aufeinanderfolgenden
 * Ständen. Kein separates gespeichertes Auswertungsobjekt — wird aus den
 * Rohständen berechnet, damit es nie mit der Historie auseinanderlaufen kann.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ablesungen = (await zaehlerAblesungenDb.list({ zaehlerId: id } as Partial<ZaehlerAblesung>)).sort(
    (a, b) => new Date(a.ablesedatum).getTime() - new Date(b.ablesedatum).getTime()
  );

  const verbrauch = ablesungen.map((a, i) => {
    if (i === 0) return { ablesungId: a.id, differenz: null as number | null, tage: null as number | null };
    const vorherige = ablesungen[i - 1];
    const differenz = a.stand - vorherige.stand;
    const tage = Math.max(
      1,
      Math.round(
        (new Date(a.ablesedatum).getTime() - new Date(vorherige.ablesedatum).getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    return { ablesungId: a.id, differenz, tage };
  });

  return NextResponse.json({ ablesungen, verbrauch });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const zaehler = await zaehlerDb.get(id);
  if (!zaehler) return NextResponse.json({ error: "Zähler nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.ablesedatum || typeof body.stand !== "number") {
    return NextResponse.json({ error: "ablesedatum und stand (Zahl) sind erforderlich" }, { status: 400 });
  }

  // Plausibilitätshinweis (nicht blockierend): Zählerstände sollten nicht
  // sinken. Wird trotzdem zugelassen (z.B. Zählertausch/-rückstellung),
  // aber im Log vermerkt.
  const bisherige = await zaehlerAblesungenDb.list({ zaehlerId: id } as Partial<ZaehlerAblesung>);
  const letzte = [...bisherige].sort(
    (a, b) => new Date(b.ablesedatum).getTime() - new Date(a.ablesedatum).getTime()
  )[0];
  const rueckwaerts = letzte && body.stand < letzte.stand;

  const now = new Date().toISOString();
  const ablesung: ZaehlerAblesung = {
    id: uid(),
    zaehlerId: id,
    ablesedatum: body.ablesedatum,
    stand: body.stand,
    ableser: body.ableser || undefined,
    notizen: rueckwaerts
      ? `${body.notizen ? body.notizen + " — " : ""}Hinweis: Stand niedriger als letzte Ablesung (${letzte.stand}).`
      : body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await zaehlerAblesungenDb.create(ablesung);
  await logEvent(
    "anlage",
    `Zählerstand für „${zaehler.zaehlernummer}" erfasst: ${saved.stand} ${zaehler.einheit}${
      rueckwaerts ? " (Plausibilitätshinweis: rückläufig)" : ""
    }.`,
    { art: "ZaehlerAblesung", id: saved.id }
  );
  await logAudit({ table: "zaehler_ablesungen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ ablesung: saved, rueckwaerts: Boolean(rueckwaerts) });
}
