import { NextRequest, NextResponse } from "next/server";
import { zaehlerDb, zaehlerAblesungenDb, logEvent } from "@/lib/db";
import { Zaehler, ZaehlerAblesung, ZaehlerArt } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

interface NeuerZaehlerEintrag {
  typ: "neuer_zaehler";
  zaehlernummer: string;
  art: string;
  einheit: string;
  standortDetail?: string;
  stand?: number | null;
  ablesedatum?: string;
}
interface NeueAblesungEintrag {
  typ: "neue_ablesung";
  zaehlerId: string;
  stand: number;
  ablesedatum: string;
}
type UebernahmeEintrag = NeuerZaehlerEintrag | NeueAblesungEintrag;

/**
 * Übernimmt die vom Nutzer bestätigten Vorschläge aus der Zählerlisten-Analyse
 * (siehe POST /api/zaehler/analyze) tatsächlich ins System. Nutzer wählt
 * bewusst aus (ganz/teils/gar nicht) — hier wird nur ausgeführt, was im
 * eintraege-Array steht.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const liegenschaftId = String(body.liegenschaftId || "");
  const eintraege = Array.isArray(body.eintraege) ? (body.eintraege as UebernahmeEintrag[]) : [];
  if (!liegenschaftId) return NextResponse.json({ error: "liegenschaftId ist erforderlich" }, { status: 400 });
  if (eintraege.length === 0) return NextResponse.json({ error: "Keine Einträge zur Übernahme übergeben." }, { status: 400 });

  let erstellteZaehler = 0;
  let erstellteAblesungen = 0;
  const fehler: string[] = [];

  for (const eintrag of eintraege) {
    try {
      if (eintrag.typ === "neuer_zaehler") {
        const now = new Date().toISOString();
        const zaehler: Zaehler = {
          id: uid(),
          zaehlernummer: eintrag.zaehlernummer,
          art: (eintrag.art as ZaehlerArt) || "Sonstige",
          einheit: eintrag.einheit || "",
          liegenschaftId,
          standortDetail: eintrag.standortDetail || undefined,
          status: "Aktiv",
          createdAt: now,
          updatedAt: now,
        };
        const savedZaehler = await zaehlerDb.create(zaehler);
        erstellteZaehler++;
        await logAudit({ table: "zaehler", recordId: savedZaehler.id, aktion: "insert", changedBy: auth.id, newData: savedZaehler });

        if (typeof eintrag.stand === "number") {
          const ablesung: ZaehlerAblesung = {
            id: uid(),
            zaehlerId: savedZaehler.id,
            ablesedatum: eintrag.ablesedatum || now.slice(0, 10),
            stand: eintrag.stand,
            notizen: "Aus intelligentem Zählerlisten-Upload übernommen.",
            createdAt: now,
            updatedAt: now,
          };
          const savedAblesung = await zaehlerAblesungenDb.create(ablesung);
          erstellteAblesungen++;
          await logAudit({ table: "zaehler_ablesungen", recordId: savedAblesung.id, aktion: "insert", changedBy: auth.id, newData: savedAblesung });
        }
      } else if (eintrag.typ === "neue_ablesung") {
        const zaehler = await zaehlerDb.get(eintrag.zaehlerId);
        if (!zaehler) {
          fehler.push(`Zähler ${eintrag.zaehlerId} nicht gefunden.`);
          continue;
        }
        const now = new Date().toISOString();
        const ablesung: ZaehlerAblesung = {
          id: uid(),
          zaehlerId: eintrag.zaehlerId,
          ablesedatum: eintrag.ablesedatum,
          stand: eintrag.stand,
          notizen: "Aus intelligentem Zählerlisten-Upload übernommen.",
          createdAt: now,
          updatedAt: now,
        };
        const saved = await zaehlerAblesungenDb.create(ablesung);
        erstellteAblesungen++;
        await logAudit({ table: "zaehler_ablesungen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
      }
    } catch (e) {
      fehler.push(e instanceof Error ? e.message : String(e));
    }
  }

  await logEvent(
    "anlage",
    `Zählerliste übernommen: ${erstellteZaehler} neue(r) Zähler, ${erstellteAblesungen} neue Ablesung(en).`,
    { art: "Zaehler", id: liegenschaftId }
  );

  return NextResponse.json({ erstellteZaehler, erstellteAblesungen, fehler });
}
