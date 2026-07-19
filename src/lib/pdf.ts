import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import { Abrechnung } from "./types";
import { formatCurrency, formatDate } from "./utils";

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 50;
const FIRMENNAME = "BetriebsKostenBot";
const DARK = rgb(0.11, 0.11, 0.11);
const GRAY = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.65, 0.65, 0.65);
const RED = rgb(0.72, 0.11, 0.11);
const GREEN = rgb(0.09, 0.45, 0.25);
const LINE = rgb(0.8, 0.8, 0.8);

async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const file = await fs.readFile(path.join(process.cwd(), "public", "brand", "logo.png"));
    return new Uint8Array(file);
  } catch {
    return null;
  }
}

export async function buildAbrechnungPdf(abr: Abrechnung): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadLogoBytes();
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;
  const logoDims = logoImage ? logoImage.scale(1) : null;

  const ws = abr.workspace;
  const positionen = ws.positionen;
  const zeigeGesamtkosten = positionen.some((p) => typeof p.gesamtkosten === "number");
  const zeigeUmlageschluessel = positionen.some((p) => !!p.umlageschluessel);
  const vorauszahlungen = ws.vorauszahlungen ?? 0;
  const summeMieteranteile = ws.nebenkosten;
  const saldo = summeMieteranteile - vorauszahlungen;
  const vermieterName = abr.vermieterName || FIRMENNAME;

  const drawLogo = (page: PDFPage, targetWidth: number, x: number, yTop: number) => {
    if (!logoImage || !logoDims) return 0;
    const h = targetWidth * (logoDims.height / logoDims.width);
    page.drawImage(logoImage, { x, y: yTop - h, width: targetWidth, height: h });
    return h;
  };

  // ---------------------------------------------------------------------
  // Seite 1: Anschreiben (nur falls vorhanden)
  // ---------------------------------------------------------------------
  if (ws.anschreiben) {
    const page = pdfDoc.addPage(PAGE_SIZE);
    let y = page.getHeight() - MARGIN;

    const logoH = drawLogo(page, 90, MARGIN, y);

    // Absenderblock rechtsbündig neben dem Logo
    const absenderLines = [vermieterName, abr.vermieterAnschrift, abr.verwalterKontakt].filter(
      Boolean
    ) as string[];
    let ay = y;
    for (const line of absenderLines) {
      const w = font.widthOfTextAtSize(line, 9);
      page.drawText(line, { x: page.getWidth() - MARGIN - w, y: ay, size: 9, font, color: GRAY });
      ay -= 12;
    }

    y -= Math.max(logoH, absenderLines.length * 12) + 30;

    if (abr.mieterName || abr.mieterAnschrift) {
      if (abr.mieterName) {
        page.drawText(abr.mieterName, { x: MARGIN, y, size: 10, font });
        y -= 13;
      }
      if (abr.mieterAnschrift) {
        for (const line of abr.mieterAnschrift.split("\n")) {
          page.drawText(line, { x: MARGIN, y, size: 10, font });
          y -= 13;
        }
      }
      y -= 20;
    }

    const heute = formatDate(new Date().toISOString());
    const heuteW = font.widthOfTextAtSize(heute, 10);
    page.drawText(heute, { x: page.getWidth() - MARGIN - heuteW, y, size: 10, font, color: GRAY });
    y -= 26;

    const betreff = `Betreff: Betriebskostenabrechnung${
      abr.zeitraum ? ` für den Zeitraum ${abr.zeitraum}` : ""
    } – ${abr.adresse || abr.name}`;
    y = drawWrapped(page, betreff, MARGIN, y, page.getWidth() - MARGIN * 2, 11, bold, 5) - 10;

    drawWrapped(page, ws.anschreiben, MARGIN, y, page.getWidth() - MARGIN * 2, 10.5, font, 4);
  }

  // ---------------------------------------------------------------------
  // Seite 2: Betriebskostenabrechnung
  // ---------------------------------------------------------------------
  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = page.getHeight() - MARGIN;
  const contentWidth = page.getWidth() - MARGIN * 2;

  drawLogo(page, 70, page.getWidth() - MARGIN - 70, y);
  page.drawText("Betriebskostenabrechnung", { x: MARGIN, y, size: 19, font: bold, color: DARK });
  y -= 18;
  page.drawText(
    `gemäß § 556 BGB / BetrKV${abr.zeitraum ? `  ·  Zeitraum ${abr.zeitraum}` : ""}`,
    { x: MARGIN, y, size: 9.5, font, color: GRAY }
  );
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: page.getWidth() - MARGIN, y },
    thickness: 1.3,
    color: DARK,
  });
  y -= 24;

  // Kopfdaten: zwei Spalten
  const colW = contentWidth / 2;
  const kopfStartY = y;

  const drawKopfBlock = (
    x: number,
    label: string,
    lines: (string | undefined)[]
  ) => {
    let ky = kopfStartY;
    page.drawText(label.toUpperCase(), { x, y: ky, size: 7.5, font: bold, color: LIGHT_GRAY });
    ky -= 13;
    for (const line of lines.filter(Boolean) as string[]) {
      page.drawText(line, { x, y: ky, size: 10, font, color: DARK });
      ky -= 13;
    }
    return ky;
  };

  const y1 = drawKopfBlock(MARGIN, "Vermieter / Verwaltung", [
    vermieterName,
    abr.vermieterAnschrift,
    abr.verwalterKontakt,
  ]);
  const y2 = drawKopfBlock(MARGIN + colW, "Mieter", [abr.mieterName || abr.name, abr.mieterAnschrift]);
  y = Math.min(y1, y2) - 14;

  const y3 = drawKopfBlock(MARGIN, "Objekt / Adresse", [abr.adresse || "-", abr.objektTyp]);
  const y4 = drawKopfBlock(MARGIN + colW, "Abrechnungszeitraum", [
    abr.zeitraum || "-",
    abr.nutzungszeitraum ? `Nutzungszeitraum: ${abr.nutzungszeitraum}` : undefined,
  ]);
  y = Math.min(y3, y4) - 22;

  // Kostenaufstellung
  page.drawText("Einzelaufstellung der Betriebskosten", { x: MARGIN, y, size: 12.5, font: bold, color: DARK });
  y -= 18;

  if (positionen.length === 0) {
    page.drawText("Keine Positionen erfasst.", { x: MARGIN, y, size: 10, font, color: GRAY });
    y -= 20;
  } else {
    // Spaltenlayout abhängig davon, welche optionalen Felder befüllt sind
    const nrW = 22;
    const betragW = 75;
    const gkW = zeigeGesamtkosten ? 75 : 0;
    const nameW = contentWidth - nrW - betragW - gkW - (zeigeUmlageschluessel ? 150 : 0);
    const xNr = MARGIN;
    const xName = xNr + nrW;
    const xGk = xName + nameW;
    const xSchluessel = xGk + gkW;
    const xBetrag = page.getWidth() - MARGIN - betragW;

    const drawHeaderRow = () => {
      page.drawText("Nr.", { x: xNr, y, size: 8, font: bold, color: LIGHT_GRAY });
      page.drawText("Kostenart", { x: xName, y, size: 8, font: bold, color: LIGHT_GRAY });
      if (zeigeGesamtkosten) {
        page.drawText("Gesamtkosten", { x: xGk, y, size: 8, font: bold, color: LIGHT_GRAY });
      }
      if (zeigeUmlageschluessel) {
        page.drawText("Umlageschlüssel", { x: xSchluessel, y, size: 8, font: bold, color: LIGHT_GRAY });
      }
      const label = "Mieteranteil";
      const w = bold.widthOfTextAtSize(label, 8);
      page.drawText(label, { x: xBetrag + betragW - w, y, size: 8, font: bold, color: LIGHT_GRAY });
      y -= 6;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: page.getWidth() - MARGIN, y },
        thickness: 1.2,
        color: DARK,
      });
      y -= 14;
    };

    drawHeaderRow();

    positionen.forEach((pos, i) => {
      if (y < MARGIN + 140) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = page.getHeight() - MARGIN;
        drawHeaderRow();
      }
      const rowTop = y;
      page.drawText(String(i + 1), { x: xNr, y: rowTop, size: 9.5, font, color: GRAY });

      let nameY = rowTop;
      nameY = drawWrapped(page, pos.name, xName, nameY, nameW - 6, 9.5, bold, 2, DARK);
      if (pos.beschreibung) {
        nameY = drawWrapped(page, pos.beschreibung, xName, nameY, nameW - 6, 8, font, 2, GRAY);
      }

      if (zeigeGesamtkosten) {
        const val = typeof pos.gesamtkosten === "number" ? formatCurrency(pos.gesamtkosten) : "–";
        page.drawText(val, { x: xGk, y: rowTop, size: 9.5, font, color: GRAY });
      }
      if (zeigeUmlageschluessel) {
        drawWrapped(page, pos.umlageschluessel || "–", xSchluessel, rowTop, gkW ? 150 - 6 : 145, 9, font, 2, GRAY);
      }

      const betragText = formatCurrency(pos.betrag);
      const bw = font.widthOfTextAtSize(betragText, 9.5);
      page.drawText(betragText, { x: xBetrag + betragW - bw, y: rowTop, size: 9.5, font: bold, color: DARK });

      const rowBottom = Math.min(nameY, rowTop - 14);
      y = rowBottom - 6;
      page.drawLine({
        start: { x: MARGIN, y: y + 3 },
        end: { x: page.getWidth() - MARGIN, y: y + 3 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 6;
    });

    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: page.getWidth() - MARGIN, y },
      thickness: 1.2,
      color: DARK,
    });
    y -= 16;
    const summeText = formatCurrency(summeMieteranteile);
    const sw = bold.widthOfTextAtSize(summeText, 10.5);
    page.drawText("Summe Mieteranteile", { x: MARGIN, y, size: 10.5, font: bold, color: DARK });
    page.drawText(summeText, { x: page.getWidth() - MARGIN - sw, y, size: 10.5, font: bold, color: DARK });
    y -= 28;
  }

  if (y < MARGIN + 160) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = page.getHeight() - MARGIN;
  }

  // Zusammenfassung / Saldo-Box
  const boxW = 260;
  const boxX = page.getWidth() - MARGIN - boxW;
  let boxY = y;
  const boxLines: { label: string; value: string; bold?: boolean; color?: ReturnType<typeof rgb> }[] = [
    { label: "Summe umlagefähige Mieteranteile", value: formatCurrency(summeMieteranteile) },
    { label: "Geleistete Vorauszahlungen", value: `– ${formatCurrency(vorauszahlungen)}` },
  ];
  if (ws.mieteinnahmen > 0) {
    boxLines.push({ label: "Mieteinnahmen (nachrichtlich)", value: formatCurrency(ws.mieteinnahmen) });
  }
  const saldoLabel = saldo > 0 ? "Nachzahlung zu Ihren Lasten" : saldo < 0 ? "Guthaben zu Ihren Gunsten" : "Saldo";
  const saldoColor = saldo > 0 ? RED : saldo < 0 ? GREEN : DARK;
  boxLines.push({ label: saldoLabel, value: formatCurrency(Math.abs(saldo)), bold: true, color: saldoColor });

  const boxH = boxLines.length * 16 + 16;
  page.drawRectangle({
    x: boxX,
    y: boxY - boxH,
    width: boxW,
    height: boxH,
    borderColor: LINE,
    borderWidth: 1,
    color: rgb(0.97, 0.97, 0.97),
  });
  boxY -= 14;
  boxLines.forEach((line, i) => {
    const f = line.bold ? bold : font;
    const size = line.bold ? 10.5 : 9;
    const color = line.color || (line.bold ? DARK : GRAY);
    if (i === boxLines.length - 1) {
      boxY -= 6;
      page.drawLine({
        start: { x: boxX + 10, y: boxY + 8 },
        end: { x: boxX + boxW - 10, y: boxY + 8 },
        thickness: 0.8,
        color: LINE,
      });
    }
    page.drawText(line.label, { x: boxX + 10, y: boxY, size, font: f, color });
    const vw = f.widthOfTextAtSize(line.value, size);
    page.drawText(line.value, { x: boxX + boxW - 10 - vw, y: boxY, size, font: f, color });
    boxY -= 16;
  });
  y = boxY - 8;

  if (abr.workspace.abrechnungstext) {
    if (y < MARGIN + 100) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = page.getHeight() - MARGIN;
    }
    page.drawText("Erläuterungen", { x: MARGIN, y, size: 12.5, font: bold, color: DARK });
    y -= 16;
    y = drawWrapped(page, abr.workspace.abrechnungstext, MARGIN, y, contentWidth, 9.5, font, 3, GRAY);
    y -= 14;
  }

  if (y < MARGIN + 90) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = page.getHeight() - MARGIN;
  }

  // Hinweise-Box
  const hinweise = [
    "Hinweise",
    "Einwendungen gegen diese Abrechnung können Sie innerhalb von 12 Monaten nach Zugang",
    "schriftlich geltend machen (§ 556 Abs. 3 BGB).",
    "Die zugrunde liegenden Belege können während der üblichen Geschäftszeiten eingesehen werden.",
  ];
  const hinweiseH = hinweise.length * 13 + 10;
  page.drawRectangle({
    x: MARGIN,
    y: y - hinweiseH,
    width: contentWidth,
    height: hinweiseH,
    borderColor: LINE,
    borderWidth: 1,
  });
  let hy = y - 14;
  hinweise.forEach((line, i) => {
    page.drawText(line, { x: MARGIN + 10, y: hy, size: 8.5, font: i === 0 ? bold : font, color: GRAY });
    hy -= 13;
  });
  y = hy - 10;

  // Footer
  page.drawLine({ start: { x: MARGIN, y }, end: { x: page.getWidth() - MARGIN, y }, thickness: 0.6, color: LINE });
  y -= 14;
  page.drawText(`Erstellt am ${formatDate(abr.createdAt)}  ·  Version ${abr.version}`, {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: LIGHT_GRAY,
  });
  const fw = font.widthOfTextAtSize(vermieterName, 8);
  page.drawText(vermieterName, { x: page.getWidth() - MARGIN - fw, y, size: 8, font, color: LIGHT_GRAY });

  return pdfDoc.save();
}

/**
 * Schreibt umbrochenen Text ab (x, y) und gibt die neue y-Position (unterhalb des
 * zuletzt geschriebenen Textes) zurück. Bricht bei Bedarf automatisch auf eine neue
 * Seite um (nur für den Anschreiben-Fließtext relevant, dort wird `page` daher als
 * Referenz aus dem umgebenden Scope mutiert – für Tabellenzellen wird kein Seitenumbruch
 * ausgelöst, das übernimmt der Aufrufer).
 */
function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  gapAfter: number,
  color: ReturnType<typeof rgb> = DARK
): number {
  const paragraphs = text.split("\n");
  let cursorY = y;
  for (const para of paragraphs) {
    if (para.trim() === "") {
      cursorY -= size + 4;
      continue;
    }
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? line + " " + word : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width > maxWidth && line) {
        page.drawText(line, { x, y: cursorY, size, font, color });
        cursorY -= size + 3;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= size + 3;
    }
  }
  return cursorY - gapAfter;
}
