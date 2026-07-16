import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

/** Speichert eine hochgeladene Datei dauerhaft und liefert den eindeutigen Dateinamen zurück. */
export async function storeFile(id: string, originalName: string, buffer: Buffer): Promise<string> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const storedFileName = `${id}__${safeName(originalName)}`;
  await fs.writeFile(path.join(UPLOADS_DIR, storedFileName), buffer);
  return storedFileName;
}

export async function readStoredFile(storedFileName: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOADS_DIR, storedFileName));
}
