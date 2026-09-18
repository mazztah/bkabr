"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock } from "lucide-react";
import { addRecentlyViewed, getRecentlyViewed, type RecentItem } from "@/lib/recently-viewed";

interface Treffer {
  typ: string;
  id: string;
  titel: string;
  untertitel?: string;
  link: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [query, setQuery] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [zuletzt, setZuletzt] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K öffnet die Suche von überall aus — Standard-Shortcut für
  // globale Suche, den viele Nutzer bereits aus anderen Tools kennen.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOffen(true);
      }
      if (e.key === "Escape") setOffen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (offen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      // UX-002: bei jedem Öffnen aktuellen Stand der zuletzt verwendeten
      // Datensätze laden (kann sich seit dem letzten Öffnen geändert haben).
      setZuletzt(getRecentlyViewed());
    }
  }, [offen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setTreffer([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/suche?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((j) => setTreffer(j.treffer || []))
        .finally(() => setLoading(false));
    }, 250); // kleines Debounce, damit nicht bei jedem Tastendruck gesucht wird
    return () => clearTimeout(timeout);
  }, [query]);

  function gehZu(t: Treffer) {
    addRecentlyViewed(t);
    setOffen(false);
    setQuery("");
    router.push(t.link);
  }

  const gruppiert = treffer.reduce<Record<string, Treffer[]>>((acc, t) => {
    (acc[t.typ] ||= []).push(t);
    return acc;
  }, {});

  if (!offen) {
    return (
      <button
        onClick={() => setOffen(true)}
        title="Suchen (Strg/Cmd+K)"
        className="interactive flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
      >
        <Search size={15} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOffen(false)}
    >
      <div
        className="glass-panel shadow-hellblau w-full max-w-lg overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Liegenschaften, Verträge, Zähler, Anlagen, Tickets, Dokumente …"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button onClick={() => setOffen(false)} className="text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {query.trim().length < 2 && (
            <>
              {zuletzt.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Suche starten oder zuletzt verwendete Datensätze erscheinen hier.
                </p>
              ) : (
                <div className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Clock size={11} /> Zuletzt verwendet
                  </div>
                  {zuletzt.map((t) => (
                    <button
                      key={`recent-${t.typ}-${t.id}`}
                      onClick={() => gehZu(t)}
                      className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate font-medium">{t.titel}</span>
                      {t.untertitel && <span className="truncate text-xs text-muted-foreground">{t.untertitel}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {loading && <p className="px-2 py-3 text-xs text-muted-foreground">Suche …</p>}
          {!loading && query.trim().length >= 2 && treffer.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Keine Treffer für &bdquo;{query}&ldquo;.</p>
          )}
          {!loading &&
            Object.entries(gruppiert).map(([typ, items]) => (
              <div key={typ} className="mb-2 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {typ}
                </div>
                {items.map((t) => (
                  <button
                    key={`${t.typ}-${t.id}`}
                    onClick={() => gehZu(t)}
                    className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate font-medium">{t.titel}</span>
                    {t.untertitel && <span className="truncate text-xs text-muted-foreground">{t.untertitel}</span>}
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
