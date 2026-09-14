import { NextRequest, NextResponse } from "next/server";
import { extractZaehlerliste } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { zaehlerDb, zaehlerAblesungenDb, liegenschaftenDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Nimmt eine hochgeladene Zählerliste (PDF/Bild/Text/CSV) für eine konkrete
 * Liegenschaft entgegen, lässt die KI die einzelnen Zähler extrahieren und
 * gleicht jeden Eintrag mit dem Bestand ab. Legt NICHTS an — liefert nur
 * einen Übernahme-Vorschlag zurück, den der Nutzer im Anschluss (ganz, teils
 * oder gar nicht) bestätigt (siehe POST /api/zaehler/uebernahme).
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const liegenschaftId = String(formData.get("liegenschaftId") || "");
    if (!file) return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    if (!liegenschaftId) return NextResponse.json({ error: "liegenschaftId ist erforderlich" }, { status: 400 });

    const liegenschaft = await liegenschaftenDb.get(liegenschaftId);
    if (!liegenschaft) return NextResponse.json({ error: "Liegenschaft nicht gefunden" }, { status: 404 });

    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const ocr = await extractTextFromFile(buffer, mimeType, file.name);
    if (ocr.error) return NextResponse.json({ error: ocr.error }, { status: 415 });

    const eintraege = await extractZaehlerliste({ text: ocr.text, fileName: file.name });

    const bestehendeZaehler = await zaehlerDb.list({ liegenschaftId });
    // Letzte Ablesung je Zähler vorab laden, damit der Abgleich unten ohne
    // N zusätzliche DB-Aufrufe pro Eintrag auskommt.
    const letzteAblesungByZaehler = new Map<string, { stand: number; ablesedatum: string }>();
    for (const z of bestehendeZaehler) {
      const ablesungen = await zaehlerAblesungenDb.list({ zaehlerId: z.id });
      const letzte = [...ablesungen].sort(
        (a, b) => new Date(b.ablesedatum).getTime() - new Date(a.ablesedatum).getTime()
      )[0];
      if (letzte) letzteAblesungByZaehler.set(z.id, { stand: letzte.stand, ablesedatum: letzte.ablesedatum });
    }

    const klassifikation = eintraege
      .filter((e) => e.zaehlernummer?.trim())
      .map((e) => {
        const gefunden = bestehendeZaehler.find(
          (z) => normalize(z.zaehlernummer) === normalize(e.zaehlernummer)
        );

        if (!gefunden) {
          return {
            typ: "neuer_zaehler" as const,
            zaehlernummer: e.zaehlernummer,
            art: e.art || "Sonstige",
            einheit: e.einheit || "",
            standortDetail: e.standortDetail || "",
            stand: e.stand ?? null,
            ablesedatum: e.ablesedatum || "",
            hinweis: "Kein Zähler mit dieser Nummer im System – wird als neuer Zähler angelegt.",
          };
        }

        const letzte = letzteAblesungByZaehler.get(gefunden.id);
        const neuerStandVorhanden = typeof e.stand === "number";
        const istNeuerStand =
          neuerStandVorhanden && (!letzte || e.stand! > letzte.stand || (e.ablesedatum && e.ablesedatum > letzte.ablesedatum));

        if (istNeuerStand) {
          return {
            typ: "neue_ablesung" as const,
            zaehlerId: gefunden.id,
            zaehlernummer: gefunden.zaehlernummer,
            art: gefunden.art,
            einheit: gefunden.einheit,
            standortDetail: gefunden.standortDetail || "",
            stand: e.stand,
            ablesedatum: e.ablesedatum || new Date().toISOString().slice(0, 10),
            letzterBekannterStand: letzte?.stand ?? null,
            hinweis: letzte
              ? `Neuer Stand (bisher: ${letzte.stand} ${gefunden.einheit} am ${letzte.ablesedatum}).`
              : "Erster erfasster Stand für diesen Zähler.",
          };
        }

        return {
          typ: "unveraendert" as const,
          zaehlerId: gefunden.id,
          zaehlernummer: gefunden.zaehlernummer,
          hinweis: neuerStandVorhanden
            ? "Stand entspricht dem bereits bekannten Stand – keine Aktion nötig."
            : "Zähler bereits bekannt, kein Stand im Dokument erkannt.",
        };
      });

    return NextResponse.json({
      liegenschaft: { id: liegenschaft.id, name: liegenschaft.name },
      anzahlErkannt: eintraege.length,
      klassifikation,
      zusammenfassung: {
        neueZaehler: klassifikation.filter((k) => k.typ === "neuer_zaehler").length,
        neueAblesungen: klassifikation.filter((k) => k.typ === "neue_ablesung").length,
        unveraendert: klassifikation.filter((k) => k.typ === "unveraendert").length,
      },
    });
  } catch (e: unknown) {
    console.error("Zählerlisten-Analyse-Fehler:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analyse fehlgeschlagen" },
      { status: 500 }
    );
  }
}
