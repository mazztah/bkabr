import { NextRequest, NextResponse } from "next/server";
import { classifyDocument } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { storeFile } from "@/lib/storage";
import { uid } from "@/lib/utils";
import { StammdatenVorschlag, DokumentArt } from "@/lib/types";
import {
  liegenschaftenDb,
  gebaeudeDb,
  wohnungenDb,
  mieterDb,
} from "@/lib/db";
import { matchLiegenschaft, parseAddress } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 300; // Batch bis 20 PDFs

const SUPPORTED = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "text/plain",
];

/**
 * Batch-Upload: mehrere Dateien klassifizieren, Stammdaten-Vorschläge erzeugen.
 * Speichert Dateien bereits, schreibt aber noch KEINE Stammdaten – das passiert
 * erst nach User-Bestätigung via POST /api/batch-analyze/confirm.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files.length) {
      const single = formData.get("file") as File | null;
      if (single) files.push(single);
    }
    if (!files.length) {
      return NextResponse.json({ error: "Keine Dateien übermittelt" }, { status: 400 });
    }
    if (files.length > 30) {
      return NextResponse.json(
        { error: "Maximal 30 Dateien pro Batch" },
        { status: 400 }
      );
    }

    const liegenschaften = await liegenschaftenDb.list();
    const gebaeude = await gebaeudeDb.list();
    const wohnungen = await wohnungenDb.list();
    const mieter = await mieterDb.list();

    const vorschlaege: StammdatenVorschlag[] = [];
    const errors: { fileName: string; error: string }[] = [];

    for (const file of files) {
      try {
        const mimeType = file.type || "application/octet-stream";
        if (!SUPPORTED.includes(mimeType) && !file.name.toLowerCase().endsWith(".pdf")) {
          errors.push({ fileName: file.name, error: `Dateityp nicht unterstützt: ${mimeType}` });
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ocr = await extractTextFromFile(buffer, mimeType, file.name);
        if (ocr.error) {
          errors.push({ fileName: file.name, error: ocr.error });
          continue;
        }

        const classified = await classifyDocument({
          text: ocr.text,
          fileName: file.name,
        });

        const dokId = uid();
        const storedFileName = await storeFile(dokId, file.name, buffer);

        const data = classified.data;
        const adresse =
          (data.objektAdresse as string) ||
          (data.liegenschaftName as string) ||
          "";

        // Match bestehende Hierarchie
        let lgMatch = matchLiegenschaft(adresse, liegenschaften);
        if (!lgMatch && adresse) {
          const parsed = parseAddress(adresse);
          if (parsed.strasse) {
            lgMatch = liegenschaften.find(
              (l) =>
                l.strasse.toLowerCase().includes(parsed.strasse.toLowerCase()) &&
                (!parsed.plz || l.plz === parsed.plz)
            );
          }
        }

        const vorschlag: StammdatenVorschlag = {
          id: dokId,
          dokumentArt: classified.dokumentArt,
          dateiName: file.name,
          confidence: classified.confidence,
          ablageZiel: classified.ablageZiel,
          rawSummary: classified.rawSummary,
          storedFileName,
          mimeType,
          size: buffer.byteLength,
        };

        if (lgMatch) {
          vorschlag.liegenschaft = {
            matchId: lgMatch.id,
            name: lgMatch.name,
            strasse: lgMatch.strasse,
            hausnummer: lgMatch.hausnummer,
            plz: lgMatch.plz,
            ort: lgMatch.ort,
          };
        } else if (adresse) {
          const parsed = parseAddress(adresse);
          vorschlag.liegenschaft = {
            name: (data.liegenschaftName as string) || adresse,
            strasse: parsed?.strasse || "",
            hausnummer: parsed?.hausnummer || "",
            plz: parsed?.plz || "",
            ort: parsed?.ort || "",
          };
        }

        // Wohnung / Mieter aus Bezeichnung
        const weBez = (data.wohnungsbezeichnung as string) || "";
        if (weBez && lgMatch) {
          const gebOfLg = gebaeude.filter((g) => g.liegenschaftId === lgMatch!.id);
          const woMatch = wohnungen.find(
            (w) =>
              gebOfLg.some((g) => g.id === w.gebaeudeId) &&
              w.bezeichnung.toLowerCase().includes(weBez.toLowerCase().slice(0, 12))
          );
          if (woMatch) {
            vorschlag.wohnung = {
              matchId: woMatch.id,
              bezeichnung: woMatch.bezeichnung,
              flaeche: woMatch.flaeche,
            };
            const miMatch = mieter.find(
              (m) =>
                m.wohnungId === woMatch.id &&
                (!m.mietende || new Date(m.mietende) > new Date())
            );
            if (miMatch) {
              vorschlag.mieter = {
                matchId: miMatch.id,
                name: miMatch.name,
                kaltmiete: miMatch.kaltmiete,
                nebenkostenVorauszahlung: miMatch.nebenkostenVorauszahlung,
              };
            }
          }
        }

        // Art-spezifische Felder
        if (
          classified.dokumentArt === "mietvertrag" ||
          classified.dokumentArt === "mietvertrag_nachtrag"
        ) {
          vorschlag.mietvertrag = {
            mieterName: (data.mieterName as string) || undefined,
            vermieterName: (data.vermieterName as string) || undefined,
            mietbeginn: (data.mietbeginn as string) || undefined,
            mietende: (data.mietende as string) || undefined,
            sollMiete: num(data.kaltmiete),
            nebenkostenVorauszahlung: num(data.nebenkostenVorauszahlung),
            kaution: num(data.kaution),
            objektAdresse: adresse || undefined,
            wohnungsbezeichnung: weBez || undefined,
          };
          if (!vorschlag.mieter && data.mieterName) {
            vorschlag.mieter = {
              name: data.mieterName as string,
              kaltmiete: num(data.kaltmiete),
              nebenkostenVorauszahlung: num(data.nebenkostenVorauszahlung),
              mietbeginn: (data.mietbeginn as string) || undefined,
              mietende: (data.mietende as string) || undefined,
            };
          }
        }

        if (classified.dokumentArt === "pm_vertrag") {
          vorschlag.pmVertrag = {
            verwalterName: (data.verwalterName as string) || undefined,
            auftraggeberName: (data.auftraggeberName as string) || undefined,
            honorarModell: (data.honorarModell as string) || undefined,
            honorarSatz: num(data.honorarSatz),
            objektAdresse: adresse || undefined,
            liegenschaftName: (data.liegenschaftName as string) || undefined,
          };
        }

        if (
          ["grundbuchauszug", "kaufvertrag", "eigentuemer_vollmacht"].includes(
            classified.dokumentArt
          )
        ) {
          vorschlag.eigentuemer = {
            eigentuemerName: (data.eigentuemerName as string) || undefined,
            objektAdresse: adresse || undefined,
            liegenschaftName: (data.liegenschaftName as string) || undefined,
            dokumentTyp: classified.dokumentArt,
          };
        }

        if (
          classified.dokumentArt === "rechnung" ||
          classified.dokumentArt === "betriebskostenabrechnung" ||
          classified.dokumentArt === "heizkostenabrechnung"
        ) {
          vorschlag.rechnung = {
            rechnungsnummer: (data.rechnungsnummer as string) || undefined,
            rechnungsdatum: (data.rechnungsdatum as string) || undefined,
            betrag: num(data.betrag),
            leistungsart: (data.leistungsart as string) || undefined,
            auftragnehmer: (data.auftragnehmer as string) || undefined,
            auftraggeber: (data.auftraggeber as string) || undefined,
            adresse: adresse || undefined,
          };
        }

        vorschlaege.push(vorschlag);
      } catch (e: any) {
        errors.push({ fileName: file.name, error: e.message || "Analyse fehlgeschlagen" });
      }
    }

    return NextResponse.json({
      vorschlaege,
      errors,
      hinweis:
        "Bitte prüfen und bestätigen Sie die Vorschläge. Erst nach Bestätigung werden Stammdaten gespeichert und Dokumente endgültig abgelegt.",
    });
  } catch (e: any) {
    console.error("Batch-analyze error:", e);
    return NextResponse.json(
      { error: e.message || "Batch-Analyse fehlgeschlagen" },
      { status: 500 }
    );
  }
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}
