export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    value || 0
  );
}

export function formatPercent(value: number, digits = 1): string {
  return new Intl.NumberFormat("de-DE", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

export function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

export function uid(): string {
  return crypto.randomUUID();
}

/**
 * Fetch mit Timeout + garantiertem Fehlerpfad. Ohne diesen Helper blieben
 * Dashboard-Widgets bei einem fehlgeschlagenen/hängenden Request für immer
 * auf "Lade…" stehen (kein .catch() → State wird nie gesetzt) — das war die
 * Ursache für "AI Observatory lädt nicht" bei Server-Last durch die
 * Groq-Fallback-Kaskade. Wirft bei Fehler/Timeout, damit der Aufrufer im
 * catch-Block einen Fehlerzustand statt einer Endlos-Ladeanzeige zeigen kann.
 */
export async function fetchJson<T = unknown>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} antwortete mit ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
