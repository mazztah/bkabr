// Schutz vor Mass Assignment (Sicherheitsbericht 21.09.2026): PATCH-Routen übernahmen den
// Request-Body ungefiltert in den Datensatz (auch id, nummer, createdAt und beliebige Zusatzfelder).

/** Übernimmt nur die erlaubten Schlüssel aus dem Body. Kein Objekt → leeres Patch. */
export function pickAllowed<T>(body: unknown, erlaubt: ReadonlyArray<keyof T & string>): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out as Partial<T>;
  const src = body as Record<string, unknown>;
  for (const k of erlaubt) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out as Partial<T>;
}
