/**
 * Vorkonfigurierter Anlagenkatalog gemäß Pflichtenheft Kap. 13 (ANL-001 bis ANL-006).
 * Die Liste ist bewusst nur eine Vorbelegung: `Anlage.typ` bleibt ein freier String,
 * neue Anlagenarten sind ohne Programmänderung möglich (Kap. 23 „Erweiterbarkeit“).
 */
export const ANLAGEN_KATALOG: string[] = [
  "Aufzug",
  "Bilder- und Objektsicherung (Laseranlage)",
  "BIS Hardware",
  "BIS Software",
  "Blitzschutz",
  "BMA (Brandmeldeanlage)",
  "Elektro (Verkabelung)",
  "EMA (Einbruchmeldeanlage)",
  "Fernwärmeanlage",
  "Fettabluft",
  "Fettabscheider",
  "Feuerlöscher",
  "Funkanlage",
  "Funkgeräte",
  "Gaswarnanlage",
  "GDRA (Gasdruckregelanlagen)",
  "GLT (Gebäudeleittechnik)",
  "GMA (Gefahrenmeldeanlagen)",
  "Hebeanlage",
  "Hebebühne",
  "Heizungsanlage",
  "HI-Fog Anlage",
  "Hydranten",
  "Ink Pad",
  "Kanal",
  "KFZ",
  "Klimaanlage",
  "Leiter",
  "Lüftungsanlage",
  "Notlicht",
  "NRA (Natürliche Rauchabzugsanlage)",
  "Osmosewasseranlage",
  "Pflegeanleitung",
  "Photovoltaikanlage",
  "RLT (Raumlufttechnische Anlage)",
  "RWA (Rauch- und Wärmeabzugsanlagen)",
  "Schlüsseltresor",
  "Schranke",
  "Sonnenschutz",
  "Tank (Benzin/Diesel)",
  "Tank (Gas)",
  "Tank (Heizöl)",
  "Tank / Wallbox",
  "Trafo",
  "Videoanlage",
  "Videokamera",
  "Wärmepumpenanlage",
  "ZUKO (Zutrittskontrollsystem)",
  "Weitere Anlage",
];

/** Bestandstypen aus früheren Versionen bleiben wählbar (Abwärtskompatibilität bestehender Datensätze). */
const LEGACY_TYPEN: string[] = [
  "Brandmeldeanlage (BMA)",
  "Einbruchmeldeanlage (EMA)",
  "Gebäudeleittechnik (GLT)",
  "Raumlufttechnik (RLT)",
  "Trinkwasseranlage",
  "Blitzschutzanlage",
  "Rauch- und Wärmeabzugsanlage (RWA)",
  "Notstromaggregat",
  "Sprinkleranlage",
  "Torantrieb",
  "Beleuchtungsanlage",
  "Sonstige technische Anlage",
];

/** Auswahlliste für Formulare: Katalog + Legacy, ohne Duplikate, alphabetisch (de). */
export const ANLAGEN_TYPEN: string[] = Array.from(new Set([...ANLAGEN_KATALOG, ...LEGACY_TYPEN])).sort((a, b) =>
  a.localeCompare(b, "de")
);
