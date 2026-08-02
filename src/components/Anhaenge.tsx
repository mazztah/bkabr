"use client";

import { useRef, useState } from "react";
import { Anhang, AnhangTyp } from "@/lib/types";

/** Lädt eine Datei über den generischen Speicher-Endpunkt hoch und liefert ein
 * fertiges Anhang-Objekt zurück, das per PATCH an die jeweilige Entität
 * (Eigentümer/PM-Vertrag/Mietvertrag) angehängt werden kann. */
export async function hochladenUndAnhaengen(file: File, typ: AnhangTyp): Promise<Anhang | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    id: crypto.randomUUID(),
    typ,
    dateiName: json.dateiName,
    storedFileName: json.storedFileName,
    mimeType: json.mimeType,
    hochgeladenAm: new Date().toISOString(),
    extraktText: json.extraktText,
  };
}

export function Anhaenge({
  anhaenge,
  typen,
  onUpload,
}: {
  anhaenge?: Anhang[];
  typen: AnhangTyp[];
  onUpload: (typ: AnhangTyp, file: File) => Promise<void>;
}) {
  const [typ, setTyp] = useState<AnhangTyp>(typen[0]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(typ, file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-2">
      {anhaenge && anhaenge.length > 0 && (
        <ul className="mb-2 space-y-1">
          {anhaenge.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">{a.typ}</span>
              <a
                href={`/api/files/${a.storedFileName}?mime=${encodeURIComponent(
                  a.mimeType
                )}&name=${encodeURIComponent(a.dateiName)}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary hover:underline"
              >
                {a.dateiName}
              </a>
              <span className="text-muted-foreground">{new Date(a.hochgeladenAm).toLocaleDateString("de-DE")}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value as AnhangTyp)}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs"
        >
          {typen.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          {busy ? "Lade hoch…" : "+ Dokument hinzufügen"}
        </button>
      </div>
    </div>
  );
}
