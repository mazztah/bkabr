// Kleine, reine Prüfhelfer für die API-Routen (Sicherheits-/Qualitätsbericht 21.09.2026, UX-008, ZAE-004).

/** Fehlertext, wenn Ende vor Beginn liegt (bei unbefristeten Verträgen entfällt die Prüfung). */
export function vertragZeitraumFehler(
  beginn: string | undefined,
  ende: string | undefined,
  unbefristet: boolean | undefined
): string | null {
  if (unbefristet || !beginn || !ende) return null;
  const b = new Date(beginn).getTime();
  const e = new Date(ende).getTime();
  if (Number.isNaN(b) || Number.isNaN(e)) return "Beginn oder Ende ist kein gültiges Datum.";
  return e < b ? "Das Vertragsende darf nicht vor dem Beginn liegen." : null;
}

/** Zählernummern sind je Zählerart eindeutig (Groß-/Kleinschreibung und Leerzeichen am Rand egal). */
export function zaehlernummerVergeben(
  bestehende: ReadonlyArray<{ id: string; art: string; zaehlernummer: string }>,
  art: string,
  zaehlernummer: string,
  ausser?: string
): boolean {
  const n = zaehlernummer.trim().toLowerCase();
  return bestehende.some((z) => z.id !== ausser && z.art === art && z.zaehlernummer.trim().toLowerCase() === n);
}
