"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import Modal from "@/components/Modal";
import { cn } from "@/lib/utils";
import { AbgeleitetesKalenderEreignis, KalenderEreignis, KalenderKategorie } from "@/lib/types";

interface AblageLite {
  id: string;
  dateiName: string;
}

const KATEGORIE_FARBE: Record<KalenderKategorie, string> = {
  Termin: "bg-[var(--primary)]",
  Frist: "bg-[var(--destructive)]",
  Aufgabe: "bg-[var(--success)]",
  Erinnerung: "bg-amber-500",
};

const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function monatsGrid(jahr: number, monat: number): Date[] {
  const erster = new Date(jahr, monat, 1);
  // Montag als Wochenstart: JS getDay() 0=So..6=Sa → verschieben auf 0=Mo..6=So
  const startOffset = (erster.getDay() + 6) % 7;
  const start = new Date(jahr, monat, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function MeinKalenderTab() {
  const [aktuell, setAktuell] = useState(() => new Date());
  const [ereignisse, setEreignisse] = useState<KalenderEreignis[]>([]);
  const [abgeleitet, setAbgeleitet] = useState<AbgeleitetesKalenderEreignis[]>([]);
  const [ablage, setAblage] = useState<AblageLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [gewaehlterTag, setGewaehlterTag] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/kalender-ereignisse").then((r) => r.json()),
      fetch("/api/ablage").then((r) => r.json()),
    ]).then(([k, a]) => {
      setEreignisse(k.ereignisse || []);
      setAbgeleitet(k.abgeleitet || []);
      setAblage((a.ablage || []).map((d: { id: string; dateiName: string }) => ({ id: d.id, dateiName: d.dateiName })));
      setLoading(false);
    });
  };

  useEffect(refresh, []);

  const tage = useMemo(() => monatsGrid(aktuell.getFullYear(), aktuell.getMonth()), [aktuell]);

  const alleTermine = useMemo(() => {
    type Eintrag = { datum: string; titel: string; kategorie: KalenderKategorie; manuell: boolean; id: string };
    const manuell: Eintrag[] = ereignisse.map((e) => ({
      datum: e.datum,
      titel: e.titel,
      kategorie: e.kategorie,
      manuell: true,
      id: e.id,
    }));
    const abgel: Eintrag[] = abgeleitet.map((e) => ({
      datum: e.datum,
      titel: e.titel,
      kategorie: e.kategorie,
      manuell: false,
      id: e.id,
    }));
    return [...manuell, ...abgel];
  }, [ereignisse, abgeleitet]);

  const termineFuerTag = (tag: Date) =>
    alleTermine.filter((t) => t.datum.slice(0, 10) === tag.toISOString().slice(0, 10));

  const remove = async (id: string) => {
    await fetch(`/api/kalender-ereignisse/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAktuell(new Date(aktuell.getFullYear(), aktuell.getMonth() - 1, 1))}
            className="rounded-md border border-border p-1.5 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold">
            {aktuell.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setAktuell(new Date(aktuell.getFullYear(), aktuell.getMonth() + 1, 1))}
            className="rounded-md border border-border p-1.5 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setAktuell(new Date())} className="ml-2 text-xs text-primary hover:underline">
            Heute
          </button>
        </div>
        <button
          onClick={() => {
            setGewaehlterTag(new Date());
            setShowForm(true);
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          ＋ Termin
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {WOCHENTAGE_KURZ.map((w) => (
          <div key={w} className="bg-muted px-2 py-1.5 text-center font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {tage.map((tag) => {
          const imMonat = tag.getMonth() === aktuell.getMonth();
          const heute = tag.toDateString() === new Date().toDateString();
          const termine = termineFuerTag(tag);
          return (
            <button
              key={tag.toISOString()}
              onClick={() => {
                setGewaehlterTag(tag);
                setShowForm(false);
              }}
              className={cn(
                "flex min-h-[76px] flex-col items-start gap-1 bg-card p-1.5 text-left transition-colors hover:bg-muted",
                !imMonat && "opacity-40"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                  heute && "bg-primary text-primary-foreground"
                )}
              >
                {tag.getDate()}
              </span>
              <div className="flex w-full flex-col gap-0.5">
                {termine.slice(0, 3).map((t) => (
                  <span key={t.id} className="flex items-center gap-1 truncate text-[10px]">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KATEGORIE_FARBE[t.kategorie])} />
                    <span className="truncate">{t.titel}</span>
                  </span>
                ))}
                {termine.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{termine.length - 3} weitere</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {loading && <p className="mt-3 text-xs text-muted-foreground">Lade Termine…</p>}

      {gewaehlterTag && !showForm && (
        <Modal
          title={gewaehlterTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
          onClose={() => setGewaehlterTag(null)}
        >
          <TagDetail
            termine={termineFuerTag(gewaehlterTag)}
            ereignisse={ereignisse}
            ablage={ablage}
            onRemove={remove}
            onNeu={() => setShowForm(true)}
          />
        </Modal>
      )}

      {gewaehlterTag && showForm && (
        <TerminForm
          datum={gewaehlterTag}
          ablage={ablage}
          onClose={() => {
            setShowForm(false);
            setGewaehlterTag(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setGewaehlterTag(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function TagDetail({
  termine,
  ereignisse,
  ablage,
  onRemove,
  onNeu,
}: {
  termine: { id: string; titel: string; kategorie: KalenderKategorie; manuell: boolean }[];
  ereignisse: KalenderEreignis[];
  ablage: AblageLite[];
  onRemove: (id: string) => void;
  onNeu: () => void;
}) {
  if (termine.length === 0) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-muted-foreground">Keine Termine an diesem Tag.</p>
        <button onClick={onNeu} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          ＋ Termin anlegen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {termine.map((t) => {
        const voll = ereignisse.find((e) => e.id === t.id);
        const dokumente = voll?.dokumentIds.map((id) => ablage.find((a) => a.id === id)).filter(Boolean) || [];
        return (
          <div key={t.id} className="rounded-lg border border-border p-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", KATEGORIE_FARBE[t.kategorie])} />
                <span className="font-medium">{t.titel}</span>
              </div>
              {t.manuell && (
                <button onClick={() => onRemove(t.id)} className="text-xs text-muted-foreground hover:text-[var(--destructive)]">
                  Löschen
                </button>
              )}
            </div>
            {voll?.beschreibung && <p className="mt-1 text-xs text-muted-foreground">{voll.beschreibung}</p>}
            {dokumente.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {dokumente.map((d) => (
                  <span key={d!.id} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    <Paperclip className="h-2.5 w-2.5" /> {d!.dateiName}
                  </span>
                ))}
              </div>
            )}
            {!t.manuell && <p className="mt-1 text-[10px] text-muted-foreground">automatisch aus der App</p>}
          </div>
        );
      })}
      <button onClick={onNeu} className="w-full rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:bg-muted">
        ＋ Weiteren Termin anlegen
      </button>
    </div>
  );
}

function TerminForm({
  datum,
  ablage,
  onClose,
  onSaved,
}: {
  datum: Date;
  ablage: AblageLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState<KalenderKategorie>("Termin");
  const [uhrzeit, setUhrzeit] = useState("09:00");
  const [erstelltVon, setErstelltVon] = useState("");
  const [dokumentIds, setDokumentIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!titel.trim()) return;
    setBusy(true);
    try {
      const [h, m] = uhrzeit.split(":").map(Number);
      const dt = new Date(datum);
      dt.setHours(h || 0, m || 0, 0, 0);
      await fetch("/api/kalender-ereignisse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titel,
          beschreibung: beschreibung || undefined,
          datum: dt.toISOString(),
          kategorie,
          erstelltVon: erstelltVon || undefined,
          dokumentIds: [...dokumentIds],
        }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Neuer Termin" onClose={onClose}>
      <div className="space-y-3">
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="Titel"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value as KalenderKategorie)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {(["Termin", "Frist", "Aufgabe", "Erinnerung"] as KalenderKategorie[]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={uhrzeit}
            onChange={(e) => setUhrzeit(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          rows={2}
          placeholder="Beschreibung (optional)"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <input
          value={erstelltVon}
          onChange={(e) => setErstelltVon(e.target.value)}
          placeholder="Dein Name (optional)"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Dokumente anhängen</label>
          {ablage.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Dokumente in der Ablage.</p>
          ) : (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
              {ablage.slice(0, 50).map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={dokumentIds.has(d.id)}
                    onChange={() =>
                      setDokumentIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">{d.dateiName}</span>
                </label>
              ))}
            </div>
          )}
          {dokumentIds.size > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {[...dokumentIds].map((id) => {
                const doc = ablage.find((a) => a.id === id);
                return (
                  <span key={id} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {doc?.dateiName}
                    <button
                      onClick={() =>
                        setDokumentIds((prev) => {
                          const next = new Set(prev);
                          next.delete(id);
                          return next;
                        })
                      }
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={busy || !titel.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  );
}
