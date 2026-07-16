import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Abrechnung } from "./types";
import { formatCurrency, formatDate } from "./utils";

// Optimized PDF generation  
async function generatePDF(content) {
  const doc = new PDFDocument({ bufferPages: true });
  content.forEach(page => {
    doc.addPage().text(page, { align: "justify" });
  });
  
  const buffer = await doc.buffer();
  return buffer;
}

export async function buildAbrechnungPdf(abr: Abrechnung): Promise<Uint8Array> {  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([595.28, 841.89]); // A4
  const margin = 50;
  let y = page.getHeight() - margin;

  const drawText = (
    text: string,
    opts: { size?: number; useFont?: typeof font; color?: [number, number, number]; gap?: number } = {}
  ) => {
    const size = opts.size ?? 11;
    const f = opts.useFont ?? font;
    const color = opts.color ?? [0, 0, 0];
    const lines = wrapText(text, f, size, page.getWidth() - margin * 2);
    for (const line of lines) {
      if (y < margin + 40) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = page.getHeight() - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(...color) });
      y -= size + 4;
    }
    y -= opts.gap ?? 4;
  };

  drawText("Betriebskostenabrechnung", { size: 22, useFont: bold, gap: 10 });
  drawText(abr.name, { size: 14, useFont: bold, gap: 8 });
  drawText(`Adresse: ${abr.adresse || "-"}`);
  drawText(`Objekttyp: ${abr.objektTyp}`);
  drawText(`Zeitraum: ${abr.zeitraum || "-"}`);
  drawText(`Status: ${abr.status}`);
  drawText(`Erstellt: ${formatDate(abr.createdAt)}  |  Version: ${abr.version}`, { gap: 16 });

  drawText("Kostenaufstellung", { size: 14, useFont: bold, gap: 6 });
  if (abr.workspace.positionen.length === 0) {
    drawText("Keine Positionen erfasst.", { gap: 10 });
  } else {
    for (const pos of abr.workspace.positionen) {
      drawText(`${pos.name}: ${formatCurrency(pos.betrag)}${pos.beschreibung ? " – " + pos.beschreibung : ""}`);
    }
    y -= 8;
  }

  drawText(`Mieteinnahmen: ${formatCurrency(abr.workspace.mieteinnahmen)}`);
  drawText(`Nebenkosten (Summe): ${formatCurrency(abr.workspace.nebenkosten)}`);
  drawText(`Gesamtsumme: ${formatCurrency(abr.gesamtSumme)}`, { size: 14, useFont: bold, gap: 16 });

  if (abr.workspace.abrechnungstext) {
    drawText("Abrechnungstext", { size: 14, useFont: bold, gap: 6 });
    drawText(abr.workspace.abrechnungstext, { gap: 16 });
  }

  if (abr.workspace.anschreiben) {
    drawText("Anschreiben", { size: 14, useFont: bold, gap: 6 });
    drawText(abr.workspace.anschreiben);
  }

  return pdfDoc.save();
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const result: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? line + " " + word : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    result.push(line);
  }
  return result;
}
