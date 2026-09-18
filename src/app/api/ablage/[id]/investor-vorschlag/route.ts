import { NextRequest, NextResponse } from "next/server";
import { ablageDb, investorenDb, logEvent } from "@/lib/db";
import { deleteStoredFile } from "@/lib/storage";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractInvestorVorschlagAusDokument } from "@/lib/ai";
import { Investor, InvestorDokument } from "@/lib/types";
import { uid } from "@/lib/utils";

/**
 * "🏦 Investor anlegen"-Aktion aus der Ablage heraus.
 *
 * Nimmt ein Ablage-Dokument (z.B. eine Firmenpräsentation, ein Anschreiben,
 * ein Kurzprofil), das jemand als möglichen Investoren-Kontakt identifiziert
 * hat, und überführt es in einen neuen Investor-Datensatz mit
 * status:"vorschlag" — genau der Status, der auf der Investoren-Seite
 * bereits per "✓ Freigeben"-Button (investoren/page.tsx) final bestätigt
 * wird. Diese Route ist also NICHT die Freigabe selbst, sondern der Schritt
 * davor: "Datei aus der Ablage als Investoren-Vorschlag in die Liste
 * übernehmen" — dort landet sie dann als ganz normaler "Vorschlag (Freigabe
 * offen)"-Eintrag.
 *
 * Die zugrunde liegende Datei wird NICHT gelöscht, sondern unter demselben
 * storedFileName in investor.dokumente weiterverwendet — der Investor
 * "erbt" die Datei. Nur der Ablage-Eintrag (die Verwaltungszeile) wird
 * entfernt, exakt wie vom Nutzer gefordert: "sobald die
 * Investorenvorschläge aus der Ablage in der Investorenliste gelandet sind,
 * werden sie auch aus der Ablage entfernt". Ältere Dateiversionen aus der
 * Ablage-Historie werden dagegen gelöscht, da nur die AKTUELLE Version an
 * den Investor übergeben wird und alte Versionsdateien sonst als verwaiste
 * Dateileichen auf der Platte zurückblieben.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const dokument = await ablageDb.get(id);
  if (!dokument) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Best-effort KI-Extraktion der Stammdaten aus dem Dokumenttext. Scheitert
  // NIE hart (siehe extractInvestorVorschlagAusDokument) — im schlimmsten
  // Fall wird der Dateiname als Firma verwendet, der Nutzer ergänzt den Rest
  // manuell im neu angelegten Investor-Datensatz.
  const vorschlag = await extractInvestorVorschlagAusDokument(dokument.dateiName, dokument.extraktText || "");

  const now = new Date().toISOString();
  const investorDokument: InvestorDokument = {
    id: uid(),
    dateiName: dokument.dateiName,
    storedFileName: dokument.storedFileName,
    mimeType: dokument.mimeType,
    size: dokument.groesse,
    hochgeladenAm: dokument.hochgeladenAm,
    hochgeladenVon: "user",
  };

  const investor: Investor = {
    id: uid(),
    firma: vorschlag.firma || dokument.dateiName,
    land: vorschlag.land || "Unbekannt",
    ansprechpartnerName: vorschlag.ansprechpartnerName,
    ansprechpartnerRolle: vorschlag.ansprechpartnerRolle,
    email: vorschlag.email,
    telefon: vorschlag.telefon,
    webseite: vorschlag.webseite,
    kurzprofil: vorschlag.kurzprofil,
    sektoren: [],
    status: "vorschlag",
    quelle: `Ablage-Datei: ${dokument.dateiName}`,
    quelleDatum: now,
    notizen: "Automatisch aus einer Ablage-Datei angelegt. Stammdaten vor der Freigabe bitte prüfen/ergänzen.",
    dokumente: [investorDokument],
    createdAt: now,
    updatedAt: now,
  };
  const savedInvestor = await investorenDb.create(investor);

  // Nur alte Versionsdateien löschen — die AKTUELLE Datei lebt jetzt am
  // Investor weiter (gleicher storedFileName, siehe investorDokument oben).
  for (const v of dokument.historie || []) {
    await deleteStoredFile(v.storedFileName);
  }
  await ablageDb.remove(id);

  await logEvent(
    "anlage",
    `Investor-Vorschlag „${savedInvestor.firma}" aus Ablage-Datei „${dokument.dateiName}" angelegt.`,
    { art: "Investor", id: savedInvestor.id }
  );
  await logAudit({
    table: "investoren",
    recordId: savedInvestor.id,
    aktion: "insert",
    changedBy: auth.id,
    newData: savedInvestor,
  });
  await logAudit({
    table: "ablage",
    recordId: id,
    aktion: "delete",
    changedBy: auth.id,
    oldData: dokument,
  });

  return NextResponse.json({ investor: savedInvestor }, { status: 201 });
}
