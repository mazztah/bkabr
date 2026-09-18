"use client";

/**
 * UX-002 (Pflichtenheft): "Schnellzugriff auf Objektakten und zuletzt
 * verwendete Datensätze". Rein clientseitig über localStorage umgesetzt –
 * kein Server-/DB-Änderungsbedarf, funktioniert pro Browser/Gerät.
 */

export interface RecentItem {
  typ: string;
  id: string;
  titel: string;
  untertitel?: string;
  link: string;
  ts: number;
}

const STORAGE_KEY = "bkabr:zuletzt-verwendet";
const MAX_ITEMS = 8;

export function getRecentlyViewed(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Privater Modus, Quota erreicht o. ä. – Schnellzugriff ist dann leer,
    // die restliche Suche bleibt aber uneingeschränkt nutzbar.
    return [];
  }
}

export function addRecentlyViewed(item: Omit<RecentItem, "ts">) {
  if (typeof window === "undefined") return;
  try {
    const bestehend = getRecentlyViewed().filter((i) => !(i.typ === item.typ && i.id === item.id));
    const next = [{ ...item, ts: Date.now() }, ...bestehend].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Fehlschlag ignorieren (siehe oben) – nicht kritisch für die Kernfunktion.
  }
}
