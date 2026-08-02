import { NextRequest, NextResponse } from "next/server";
import {
  classifyDocument,
  extractEigentuemerDokument,
  extractKontoauszug,
  extractMietvertrag,
  extractMietvertragNachtrag,
  extractPmVertrag,
} from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import {
  eigentuemerDb,
  gebaeudeDb,
  kontoauszuegeDb,
  liegenschaftenDb,
  mieterDb,
  mietvertraegeDb,
  pmVertraegeDb,
  wohnungenDb,
} from "@/lib/db";
import { ingestRechnungDokument } from "@/lib/rechnung-intake";
import { storeFile } from "@/lib/storage";
import { matchLiegenschaft, parseAddress } from "@/lib/matching";
import { AnhangTyp, SmartUploadErgebnis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß]/g, "");
}

function anhangTypAusDokumentTyp(dokumentTyp?: string): AnhangTyp {
  const t = (dokumentTyp || "").toLowerCase();
  if (t.includes("grundbuch")) return "Grundbuchauszug";
  if (t.includes("kauf")) return "Kaufvertrag";
  if (t.includes("vollmacht")) return "Vollmacht";
  if (t.includes("beschluss")) return "Eigentuemerbeschluss";
  return "Sonstiges";
}

/**
 * Verarbeitet eine einzelne Datei des Sammel-Uploads: Text erkennen, klassifizieren
 * und – je nach erkanntem Typ – die passende Extraktion + Stammdaten-Zuordnung
 * durchführen. Rechnungen werden dabei (wie im übrigen Produkt üblich) sofort
 * automatisch abgelegt; alle anderen Dokumenttypen liefern nur einen Vorschlag,
 * der im Anschluss durch den User bestätigt werden muss, bevor irgendetwas an
 * Stammdaten übernommen oder ein Dokument final abgelegt wird.
 */
async function verarbeiteDatei(file: File, index: number): Promise<SmartUploadErgebnis> {
  const key = `${index}-${file.name}`;
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  const basis: SmartUploadErgebnis = {
    key,
    dateiName: file.name,
    storedFileName: "",
    mimeType,
    typ: "unbekannt",
    konfidenz: 0,
  };

  const ocr = await extractTextFromFile(buffer, mimeType, file.name);
  if (ocr.error) {
    return { ...basis, fehler: ocr.error };
  }

  const storedFileName = await storeFile(crypto.randomUUID(), file.name, buffer);
  const klassifikation = await classifyDocument({ text: ocr.text, fileName: file.name });

  const ergebnis: SmartUploadErgebnis = {
    ...basis,
    storedFileName,
    typ: klassifikation.typ,
    konfidenz: klassifikation.konfidenz,
    begruendung: klassifikation.begruendung,
    extraktText: ocr.text.slice(0, 4000),
  };

  try {
    switch (klassifikation.typ) {
      case "rechnung": {
        const { abrechnung, extracted, pruefung, liegenschaftVorschlag, ergaenzt } =
          await ingestRechnungDokument({
            buffer,
            mimeType,
            fileName: file.name,
            ocrText: ocr.text,
          });
        return {
          ...ergebnis,
          erledigt: true,
          hinweisText: ergaenzt
            ? `Rechnung automatisch der bestehenden Abrechnung „${abrechnung.name}“ hinzugefügt.`
            : `Neue Abrechnung „${abrechnung.name}“ automatisch angelegt.`,
          rechnung: {
            extracted,
            pruefung,
            abrechnungId: abrechnung.id,
            abrechnungName: abrechnung.name,
            liegenschaftId: abrechnung.liegenschaftId,
            neuanlage: liegenschaftVorschlag,
          },
        };
      }

      case "mietvertrag": {
        const extraktion = await extractMietvertrag({ text: ocr.text, fileName: file.name });
        let vorgeschlagenerMieterId: string | undefined;
        let vorgeschlagenerMieterName: string | undefined;
        let vorgeschlageneWohnungId: string | undefined;

        if (extraktion.mieterName) {
          const alleMieter = await mieterDb.list();
          const zielName = normalize(extraktion.mieterName);
          const match = alleMieter.find((m) => {
            const n = normalize(m.name);
            return n.length > 2 && (n.includes(zielName) || zielName.includes(n));
          });
          if (match) {
            vorgeschlagenerMieterId = match.id;
            vorgeschlagenerMieterName = match.name;
            vorgeschlageneWohnungId = match.wohnungId;
          }
        }
        if (!vorgeschlageneWohnungId && (extraktion.wohnungsbezeichnung || extraktion.objektAdresse)) {
          const alleWohnungen = await wohnungenDb.list();
          const ziel = normalize(extraktion.wohnungsbezeichnung || extraktion.objektAdresse || "");
          const match = alleWohnungen.find((w) => {
            const n = normalize(w.bezeichnung);
            return n.length > 2 && ziel.includes(n);
          });
          if (match) vorgeschlageneWohnungId = match.id;
        }

        return {
          ...ergebnis,
          mietvertrag: {
            extraktion,
            vorschlag: {
              mieterId: vorgeschlagenerMieterId,
              mieterName: vorgeschlagenerMieterName,
              wohnungId: vorgeschlageneWohnungId,
            },
          },
        };
      }

      case "mietvertrag_nachtrag":
      case "uebergabeprotokoll": {
        const extraktion = await extractMietvertragNachtrag({ text: ocr.text, fileName: file.name });
        let mietvertragId: string | undefined;
        let mieterId: string | undefined;
        let mieterName: string | undefined;
        let wohnungId: string | undefined;

        if (extraktion.mieterName) {
          const alleMieter = await mieterDb.list();
          const zielName = normalize(extraktion.mieterName);
          const match = alleMieter.find((m) => {
            const n = normalize(m.name);
            return n.length > 2 && (n.includes(zielName) || zielName.includes(n));
          });
          if (match) {
            mieterId = match.id;
            mieterName = match.name;
            wohnungId = match.wohnungId;
            const alleVertraege = await mietvertraegeDb.list();
            const vertrag = alleVertraege.find((v) => v.mieterId === match.id);
            mietvertragId = vertrag?.id;
          }
        }

        return {
          ...ergebnis,
          typ: klassifikation.typ === "uebergabeprotokoll" ? "uebergabeprotokoll" : "mietvertrag_nachtrag",
          nachtrag: {
            extraktion: { ...extraktion, art: extraktion.art || "Nachtrag" },
            vorschlag: { mietvertragId, mieterId, mieterName, wohnungId },
          },
        };
      }

      case "pm_vertrag": {
        const extraktion = await extractPmVertrag({ text: ocr.text, fileName: file.name });
        const alleLiegenschaften = await liegenschaftenDb.list();
        const adresseFuerMatch = extraktion.objektAdresse || extraktion.liegenschaftName || "";
        const treffer = matchLiegenschaft(adresseFuerMatch, alleLiegenschaften);
        const geparst = extraktion.objektAdresse ? parseAddress(extraktion.objektAdresse) : null;
        const neuanlageVorschlag = !treffer
          ? {
              name: extraktion.liegenschaftName || geparst?.strasse || "Neue Liegenschaft",
              strasse: geparst?.strasse || "",
              hausnummer: geparst?.hausnummer || "",
              plz: geparst?.plz || "",
              ort: geparst?.ort || "",
            }
          : undefined;
        let bestehenderPmVertragId: string | undefined;
        if (treffer) {
          const alle = await pmVertraegeDb.list({ liegenschaftId: treffer.id } as any);
          bestehenderPmVertragId = alle[0]?.id;
        }

        return {
          ...ergebnis,
          pmVertrag: {
            extraktion,
            vorschlag: {
              liegenschaftId: treffer?.id,
              liegenschaftName: treffer?.name,
              neuanlage: neuanlageVorschlag,
              pmVertragId: bestehenderPmVertragId,
            },
          },
        };
      }

      case "eigentuemer_dokument":
      case "grundbuchauszug":
      case "kaufvertrag": {
        const extraktion = await extractEigentuemerDokument({ text: ocr.text, fileName: file.name });
        const alleLiegenschaften = await liegenschaftenDb.list();
        const adresseFuerMatch = extraktion.objektAdresse || extraktion.liegenschaftName || "";
        const treffer = matchLiegenschaft(adresseFuerMatch, alleLiegenschaften);
        const geparst = extraktion.objektAdresse ? parseAddress(extraktion.objektAdresse) : null;
        const neuanlageVorschlag = !treffer
          ? {
              name: extraktion.liegenschaftName || geparst?.strasse || "Neue Liegenschaft",
              strasse: geparst?.strasse || "",
              hausnummer: geparst?.hausnummer || "",
              plz: geparst?.plz || "",
              ort: geparst?.ort || "",
            }
          : undefined;

        let bestehenderEigentuemerId: string | undefined;
        let bestehenderEigentuemerName: string | undefined;
        if (treffer) {
          const alle = await eigentuemerDb.list({ liegenschaftId: treffer.id } as any);
          bestehenderEigentuemerId = alle[0]?.id;
          bestehenderEigentuemerName = alle[0]?.name;
        }

        const anhangTyp: AnhangTyp =
          klassifikation.typ === "grundbuchauszug"
            ? "Grundbuchauszug"
            : klassifikation.typ === "kaufvertrag"
            ? "Kaufvertrag"
            : anhangTypAusDokumentTyp(extraktion.dokumentTyp);

        return {
          ...ergebnis,
          eigentuemerDokument: {
            extraktion,
            anhangTyp,
            vorschlag: {
              liegenschaftId: treffer?.id,
              liegenschaftName: treffer?.name,
              neuanlage: neuanlageVorschlag,
              eigentuemerId: bestehenderEigentuemerId,
              eigentuemerName: bestehenderEigentuemerName,
            },
          },
        };
      }

      case "liegenschaftskarte": {
        const alleLiegenschaften = await liegenschaftenDb.list();
        // Grobe Adresserkennung direkt aus dem Text (kein separater LLM-Call nötig)
        const zeilen = ocr.text.split("\n").slice(0, 20).join(" ");
        const treffer = matchLiegenschaft(zeilen, alleLiegenschaften);

        let anhangTyp: AnhangTyp = "Liegenschaftskarte";
        const dateiKlein = file.name.toLowerCase();
        if (dateiKlein.includes("mieterliste")) anhangTyp = "Mieterliste";
        else if (dateiKlein.includes("objektbeschreibung")) anhangTyp = "Objektbeschreibung";

        let bestehenderPmVertragId: string | undefined;
        if (treffer) {
          const alle = await pmVertraegeDb.list({ liegenschaftId: treffer.id } as any);
          bestehenderPmVertragId = alle[0]?.id;
        }

        return {
          ...ergebnis,
          liegenschaftskarte: {
            anhangTyp,
            vorschlag: {
              liegenschaftId: treffer?.id,
              liegenschaftName: treffer?.name,
              pmVertragId: bestehenderPmVertragId,
            },
          },
        };
      }

      case "kontoauszug": {
        const transaktionen = await extractKontoauszug({ text: ocr.text, fileName: file.name });
        const [mieter, wohnungen, gebaeude, liegenschaften] = await Promise.all([
          mieterDb.list(),
          wohnungenDb.list(),
          gebaeudeDb.list(),
          liegenschaftenDb.list(),
        ]);
        const vorschlaege = transaktionen.map((t) => {
          const ziel = normalize(`${t.absender || ""} ${t.verwendungszweck || ""}`);
          const treffer = mieter.find((m) => {
            const n = normalize(m.name);
            return n.length > 2 && ziel.includes(n);
          });
          const wohnung = treffer ? wohnungen.find((w) => w.id === treffer.wohnungId) : undefined;
          const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
          const lg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;
          return {
            transaktion: t,
            vorschlagMieterId: treffer?.id,
            vorschlagMieterName: treffer?.name,
            wohnungBezeichnung: wohnung?.bezeichnung,
            liegenschaftName: lg?.name,
          };
        });

        // Quelldatei ist bereits gespeichert – Kontoauszug wird direkt als
        // Stammdatensatz abgelegt. Die eigentliche Buchung der einzelnen
        // Transaktionen auf die Mieterkonten erfolgt bewusst separat im Menü
        // "Kontoauszüge" (dort mit voller Zuordnungs-/Bearbeitungsmöglichkeit).
        const now = new Date().toISOString();
        const kontoauszug = await kontoauszuegeDb.create({
          id: crypto.randomUUID(),
          dateiName: file.name,
          storedFileName,
          mimeType,
          hochgeladenAm: now,
          anzahlTransaktionen: transaktionen.length,
          gebuchteTransaktionen: 0,
          extraktText: ocr.text.slice(0, 4000),
          createdAt: now,
          updatedAt: now,
        } as any);

        return {
          ...ergebnis,
          erledigt: true,
          hinweisText: `Kontoauszug abgelegt – ${transaktionen.length} Transaktion(en) erkannt. Buchung auf Mieterkonten im Menü „Kontoauszüge“.`,
          kontoauszug: { transaktionen, vorschlaege },
        };
      }

      default:
        return ergebnis;
    }
  } catch (e: any) {
    console.error(`Sammel-Upload: Fehler bei ${file.name}:`, e);
    return { ...ergebnis, fehler: e.message || "Verarbeitung fehlgeschlagen" };
  }
}

/** Sehr einfache Concurrency-Begrenzung, damit z.B. 20 gleichzeitige Uploads das
 * Groq-Rate-Limit nicht sprengen. */
async function mapMitLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const ergebnisse: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      ergebnisse[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ergebnisse;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Keine Dateien übermittelt" }, { status: 400 });
    }
    if (files.length > 40) {
      return NextResponse.json(
        { error: "Bitte maximal 40 Dateien pro Sammel-Upload hochladen." },
        { status: 400 }
      );
    }

    const ergebnisse = await mapMitLimit(files, 3, verarbeiteDatei);

    return NextResponse.json({ ergebnisse });
  } catch (e: any) {
    console.error("Sammel-Upload-Fehler:", e);
    return NextResponse.json({ error: e.message || "Sammel-Upload fehlgeschlagen" }, { status: 500 });
  }
}
