import { XMLParser } from "fast-xml-parser";
import { NewsArtikel, NewsQuelle } from "./types";

/**
 * Kuratierte Startliste — verifiziert echte, öffentlich zugängliche RSS/Atom-
 * Feeds (Stand Aug 2026), analog zur Kategorisierung von immoticker.fly.dev
 * (KI/Tech + Immobilien, jeweils Inland/Ausland). Die dortige Live-Ladefunktion
 * läuft über einen privaten, nicht dokumentierten Backend-Endpoint des
 * Betreibers und ist von hier aus nicht ansprechbar — deshalb ein eigener,
 * echter RSS-Reader statt einer Kopie fremder Inhalte.
 *
 * Die IZ-Immobilien-Zeitung erlaubt laut eigener Angabe die kostenfreie
 * Nutzung ihres Feeds nur für private Zwecke, nicht kommerziell — daher hier
 * mit Lizenzhinweis versehen; bei kommerziellem Einsatz der App sollte das
 * vor Produktivbetrieb mit IZ geklärt oder die Quelle ersetzt werden.
 */
/**
 * Kuratierte Startliste — direkt aus der vom Nutzer bereitgestellten,
 * eigens kuratierten Feed-Liste (immoticker.fly.dev, 344 geprüfte Quellen,
 * Stand Juli 2026) ausgewählt: eine Untermenge quer über KI/Tech und
 * Immobilien, Inland (DE) und Ausland. Bewusst nicht alle 344 auf einmal —
 * das würde bei jedem Seitenaufruf Dutzende externe Server gleichzeitig
 * belasten und die Ladezeit unnötig strecken. Die Liste lässt sich beliebig
 * aus der Originalliste erweitern.
 *
 * Die IZ-Immobilien-Zeitung erlaubt laut eigener Angabe die kostenfreie
 * Nutzung ihres Feeds nur für private Zwecke, nicht kommerziell — daher hier
 * mit Lizenzhinweis versehen; bei kommerziellem Einsatz der App sollte das
 * vor Produktivbetrieb mit IZ geklärt oder die Quelle ersetzt werden.
 */
export const NEWS_QUELLEN: NewsQuelle[] = [
  // -- Immobilien, Inland --
  {
    id: "iz",
    label: "Immobilien Zeitung",
    url: "https://www.iz.de/news/feed",
    kategorie: "Immobilien",
    region: "Inland",
    lizenzHinweis: "Laut Anbieter nur für private Nutzung freigegeben, nicht kommerziell.",
  },
  {
    id: "haufe-immobilien",
    label: "Haufe Immobilienwirtschaft",
    url: "https://www.haufe.de/xml/rss_129130.xml",
    kategorie: "Immobilien",
    region: "Inland",
  },
  {
    id: "lukinski",
    label: "Lukinski Immobilien",
    url: "https://lukinski.com/feed",
    kategorie: "Immobilien",
    region: "Inland",
  },
  // -- KI/Tech, Inland --
  {
    id: "the-decoder",
    label: "THE DECODER",
    url: "https://the-decoder.com/feed/",
    kategorie: "KI & Tech",
    region: "Inland",
  },
  // -- Immobilien, Ausland --
  {
    id: "housingwire",
    label: "HousingWire",
    url: "https://www.housingwire.com/feed/",
    kategorie: "Immobilien",
    region: "Ausland",
  },
  {
    id: "inman",
    label: "Inman",
    url: "https://www.inman.com/feed/",
    kategorie: "Immobilien",
    region: "Ausland",
  },
  {
    id: "biggerpockets",
    label: "BiggerPockets",
    url: "https://www.biggerpockets.com/blog/feed",
    kategorie: "Immobilien",
    region: "Ausland",
  },
  {
    id: "therealdeal",
    label: "The Real Deal",
    url: "https://therealdeal.com/feed/",
    kategorie: "Immobilien",
    region: "Ausland",
  },
  // -- KI/Tech, Ausland --
  {
    id: "techcrunch-ai",
    label: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    kategorie: "KI & Tech",
    region: "Ausland",
  },
  {
    id: "theverge-ai",
    label: "The Verge – AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    kategorie: "KI & Tech",
    region: "Ausland",
  },
  {
    id: "openai",
    label: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    kategorie: "KI & Tech",
    region: "Ausland",
  },
  {
    id: "huggingface",
    label: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    kategorie: "KI & Tech",
    region: "Ausland",
  },
  {
    id: "venturebeat-ai",
    label: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    kategorie: "KI & Tech",
    region: "Ausland",
  },
  // -- Top-Magazine / Allgemein --
  {
    id: "forbes-business",
    label: "Forbes Business",
    url: "https://www.forbes.com/business/feed/",
    kategorie: "Allgemein",
    region: "Ausland",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function firstImgSrc(html?: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Parst sowohl RSS-2.0 (<rss><channel><item>) als auch Atom (<feed><entry>) —
 * die beiden gängigen Formate — statt sich auf ein bestimmtes Format
 * festzulegen, da einzelne Quellen unterschiedlich formatieren.
 */
function parseFeedXml(xml: string, quelle: NewsQuelle): NewsArtikel[] {
  const doc = parser.parse(xml);
  const artikel: NewsArtikel[] = [];

  const items = asArray(doc?.rss?.channel?.item);
  for (const item of items) {
    const enclosureUrl = item?.enclosure?.["@_url"];
    const mediaContentUrl = item?.["media:content"]?.["@_url"] || asArray(item?.["media:content"])[0]?.["@_url"];
    const beschreibung = typeof item?.description === "string" ? item.description : item?.description?.["#text"];
    artikel.push({
      quelle: quelle.id,
      quelleLabel: quelle.label,
      kategorie: quelle.kategorie,
      region: quelle.region,
      titel: String(item?.title?.["#text"] ?? item?.title ?? "").trim(),
      link: String(item?.link?.["#text"] ?? item?.link ?? "").trim(),
      bildUrl: enclosureUrl || mediaContentUrl || firstImgSrc(beschreibung),
      veroeffentlichtAm: item?.pubDate || item?.["dc:date"],
      beschreibung: typeof beschreibung === "string" ? beschreibung.replace(/<[^>]+>/g, "").slice(0, 200) : undefined,
    });
  }

  const entries = asArray(doc?.feed?.entry);
  for (const entry of entries) {
    const links = asArray(entry?.link);
    const link = links.find((l) => l?.["@_rel"] === "alternate")?.["@_href"] || links[0]?.["@_href"] || links[0];
    const summary = typeof entry?.summary === "string" ? entry.summary : entry?.summary?.["#text"];
    artikel.push({
      quelle: quelle.id,
      quelleLabel: quelle.label,
      kategorie: quelle.kategorie,
      region: quelle.region,
      titel: String(entry?.title?.["#text"] ?? entry?.title ?? "").trim(),
      link: String(link ?? "").trim(),
      bildUrl: firstImgSrc(summary),
      veroeffentlichtAm: entry?.updated || entry?.published,
      beschreibung: typeof summary === "string" ? summary.replace(/<[^>]+>/g, "").slice(0, 200) : undefined,
    });
  }

  return artikel.filter((a) => a.titel && a.link);
}

async function fetchEinzelnerFeed(quelle: NewsQuelle, timeoutMs = 6000): Promise<NewsArtikel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(quelle.url, {
      signal: controller.signal,
      headers: { "User-Agent": "bkabr-dashboard-news-widget/1.0 (+RSS reader)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedXml(xml, quelle).slice(0, 10);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface NewsCacheEintrag {
  zeitpunkt: number;
  artikel: NewsArtikel[];
}
let newsCache: NewsCacheEintrag | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minuten — schont die Quellen, hält Ladezeit niedrig

/**
 * Holt alle konfigurierten Feeds parallel, mit kurzem In-Memory-Cache.
 * Einzelne fehlschlagende Quellen (Timeout, Format-Änderung, Downtime)
 * blenden sich einfach aus der Liste aus, statt den ganzen Widget-Aufruf
 * scheitern zu lassen.
 */
export async function getNewsArtikel(force = false): Promise<{ artikel: NewsArtikel[]; ausCache: boolean; stand: string }> {
  if (!force && newsCache && Date.now() - newsCache.zeitpunkt < CACHE_TTL_MS) {
    return { artikel: newsCache.artikel, ausCache: true, stand: new Date(newsCache.zeitpunkt).toISOString() };
  }

  const ergebnisse = await Promise.all(NEWS_QUELLEN.map((q) => fetchEinzelnerFeed(q)));
  const artikel = ergebnisse
    .flat()
    .sort((a, b) => new Date(b.veroeffentlichtAm || 0).getTime() - new Date(a.veroeffentlichtAm || 0).getTime());

  newsCache = { zeitpunkt: Date.now(), artikel };
  return { artikel, ausCache: false, stand: new Date(newsCache.zeitpunkt).toISOString() };
}
