// Upload-/Auslieferungsrichtlinie (Sicherheitsbericht 21.09.2026):
// - /api/upload hatte keine Größen- und Typprüfung,
// - /api/files lieferte Dateien mit dem per URL übergebenen mime-Parameter inline aus
//   (hochgeladenes HTML wäre als text/html im Kontext der App geöffnet worden).

import path from "path";

/** Maximale Dateigröße in Byte (Standard 25 MB, per MAX_UPLOAD_MB änderbar). */
export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

/** Erlaubte Endungen mit dem Content-Type, unter dem sie ausgeliefert werden. */
const TYPEN: Record<string, { mime: string; inline: boolean }> = {
  ".pdf": { mime: "application/pdf", inline: true },
  ".png": { mime: "image/png", inline: true },
  ".jpg": { mime: "image/jpeg", inline: true },
  ".jpeg": { mime: "image/jpeg", inline: true },
  ".gif": { mime: "image/gif", inline: true },
  ".webp": { mime: "image/webp", inline: true },
  ".txt": { mime: "text/plain; charset=utf-8", inline: true },
  ".md": { mime: "text/plain; charset=utf-8", inline: true },
  ".csv": { mime: "text/csv; charset=utf-8", inline: false },
  ".xlsx": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inline: false },
  ".xls": { mime: "application/vnd.ms-excel", inline: false },
  ".docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false },
  ".doc": { mime: "application/msword", inline: false },
  ".odt": { mime: "application/vnd.oasis.opendocument.text", inline: false },
  ".ods": { mime: "application/vnd.oasis.opendocument.spreadsheet", inline: false },
  ".pptx": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inline: false },
  ".eml": { mime: "message/rfc822", inline: false },
  ".msg": { mime: "application/vnd.ms-outlook", inline: false },
};

/** Ist die Datei laut Endung ein erlaubter Upload? */
export function istErlaubterUpload(dateiName: string): boolean {
  return Object.prototype.hasOwnProperty.call(TYPEN, path.extname(dateiName).toLowerCase());
}

export function erlaubteEndungen(): string[] {
  return Object.keys(TYPEN);
}

/**
 * Content-Type und Disposition für die Auslieferung. Maßgeblich ist die Endung des gespeicherten
 * Dateinamens, NICHT ein vom Client übergebener Wert. Unbekanntes wird als Download ausgeliefert.
 */
export function auslieferung(gespeicherterName: string): { mime: string; inline: boolean } {
  const e = path.extname(gespeicherterName).toLowerCase();
  return Object.prototype.hasOwnProperty.call(TYPEN, e) ? TYPEN[e] : { mime: "application/octet-stream", inline: false };
}
