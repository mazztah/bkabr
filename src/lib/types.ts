export type ObjektTyp = "Wohnung" | "Haus" | "Gewerbe";
export type Status = "Rohdaten" | "Validierung" | "Fertig";

export interface Position {
  id: string;
  name: string;
  betrag: number;
  beschreibung?: string;
}

export interface Dokument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  extraktText?: string;
}

export interface Workspace {
  positionen: Position[];
  mieteinnahmen: number;
  nebenkosten: number;
  abrechnungstext?: string;
  anschreiben?: string;
}

export interface VersionEntry {
  version: number;
  timestamp: string;
  snapshot: Partial<Abrechnung>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Abrechnung {
  id: string;
  name: string;
  adresse: string;
  objektTyp: ObjektTyp;
  zeitraum: string;
  gesamtSumme: number;
  status: Status;
  dokumente: Dokument[];
  workspace: Workspace;
  chat: ChatMessage[];
  version: number;
  history: VersionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedData {
  name?: string;
  adresse?: string;
  objektTyp?: ObjektTyp;
  zeitraum?: string;
  gesamtSumme?: number;
  positionen?: { name: string; betrag: number; beschreibung?: string }[];
  rawText?: string;
}
