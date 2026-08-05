"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { NewsArtikel, NewsKategorie, NewsRegion } from "@/lib/types";

const KATEGORIEN: (NewsKategorie | "Alle")[] = ["Alle", "KI & Tech", "Immobilien", "Allgemein"];

export default function NewsWidget() {
  const [artikel, setArtikel] = useState<NewsArtikel[] | null>(null);
  const [kategorie, setKategorie] = useState<NewsKategorie | "Alle">("Alle");
  const [region, setRegion] = useState<NewsRegion | "Alle">("Alle");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/dashboard/news")
      .then((r) => r.json())
      .then((d) => setArtikel(d.artikel || []));
  }, []);

  const gefiltert = useMemo(() => {
    if (!artikel) return [];
    return artikel.filter(
      (a) => (kategorie === "Alle" || a.kategorie === kategorie) && (region === "Alle" || a.region === region)
    );
  }, [artikel, kategorie, region]);

  useEffect(() => setIndex(0), [kategorie, region]);

  useEffect(() => {
    if (gefiltert.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % gefiltert.length), 8000);
    return () => clearInterval(t);
  }, [gefiltert.length]);

  const aktuell = gefiltert[index];

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card lg:w-72">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">📰 News</span>
        {gefiltert.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {index + 1}/{gefiltert.length}
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-border px-2 py-1.5 text-[10px]">
        {KATEGORIEN.map((k) => (
          <button
            key={k}
            onClick={() => setKategorie(k)}
            className={cn(
              "rounded-full px-2 py-0.5",
              kategorie === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {k}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(["Alle", "Inland", "Ausland"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={cn(
                "rounded-full px-2 py-0.5",
                region === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!artikel ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">Lade News…</div>
      ) : gefiltert.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          Keine Artikel für diesen Filter — evtl. lieferte keine Quelle gerade Daten.
        </div>
      ) : (
        <a
          href={aktuell.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-1 flex-col"
        >
          <div className="relative aspect-square w-full overflow-hidden bg-muted">
            {aktuell.bildUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={aktuell.bildUrl}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">📰</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <span className="text-[9px] font-medium uppercase tracking-wide text-white/80">
                {aktuell.quelleLabel}
              </span>
            </div>
          </div>
          <div className="p-2.5">
            <p className="line-clamp-3 text-xs font-medium leading-snug group-hover:text-primary">
              {aktuell.titel}
            </p>
          </div>
        </a>
      )}

      {gefiltert.length > 1 && (
        <div className="flex justify-center gap-1 border-t border-border p-1.5">
          {gefiltert.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn("h-1 w-1 rounded-full", i === index ? "bg-primary" : "bg-muted")}
              aria-label={`Artikel ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
