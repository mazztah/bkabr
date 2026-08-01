"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Mieter, MietvertragExtraktion, Mietvertrag, Wohnung } from "@/lib/types";
import Modal from "@/components/Modal";

interface AnalyseErgebnis {
  extraktion: MietvertragExtraktion;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  vorschlag: { mieterId?: string; mieterName?: string; wohnungId?: string };
}

export default function MietvertraegePage() {
  const [mietvertraege, setMietvertraege] = useState<Mietvertrag[]>([]);
  const [mieter, setMieter] = useState<Mieter[]>([]);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ergebnis, setErgebnis] = useState<AnalyseErgebnis | null>(null);
  const [gewaehlteWohnung, setGewaehlteWohnung] = useState("");
  const [gewaehlterMieter, setGewaehlterMieter] = useState("");
  const [mieterModus, setMieterModus] = useState<"vorhanden" | "neu">("vorhanden");
  const [neuerMieterName, setNeuerMieterName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    Promise.all([
      fetch("/api/mietvertraege").then((r) => r.json()),
      fetch("/api/mieter").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
    ]).then(([mv, m, w]) => {
      setMietvertraege(mv.mietvertraege || []);
      setMieter(m.mieter || []);
      setWohnungen(w.wohnungen || []);
    });
  };

  useEffect(refresh, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/mietvertraege/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Analyse fehlgeschlagen");
      } else {
        setErgebnis(json);
        setGewaehlteWohnung(json.vorschlag.wohnungId || "");
        setGewaehlterMieter(json.vorschlag.mieterId || "");
        setNeuerMieterName(json.extraktion.mieterName || "");
        setMieterModus(json.vorschlag.mieterId ? "vorhanden" : "neu");
      }
    } catch {
      setError("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const bestaetigen = async () => {
    if (!ergebnis || !gewaehlteWohnung) return;
    const e = ergebnis.extraktion;

    let mieterId = gewaehlterMieter || undefined;
    if (mieterModus === "neu") {
      const res = await fetch("/api/mieter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wohnungId: gewaehlteWohnung,
          name: neuerMieterName || e.mieterName || "Neuer Mieter",
          mietbeginn: e.mietbeginn,
          mietende: e.mietende,
          kaltmiete: e.sollMiete,
          nebenkostenVorauszahlung: e.nebenkostenVorauszahlung,
        }),
      });
      const json = await res.json();
      mieterId = json.mieter?.id;
    }

    await fetch("/api/mietvertraege", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wohnungId: gewaehlteWohnung,
        mieterId,
        dateiName: ergebnis.dateiName,
        storedFileName: ergebnis.storedFileName,
        mimeType: ergebnis.mimeType,
        sollMiete: e.sollMiete,
        nebenkostenVorauszahlung: e.nebenkostenVorauszahlung,
        kaution: e.kaution,
        mietbeginn: e.mietbeginn,
        mietende: e.mietende,
        status: "Aktiv",
      }),
    });
    setErgebnis(null);
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold">📄 Mietverträge</h1>
          <p className="text-sm text-muted-foreground">
            Hochladen – das System erkennt automatisch Mieter/Wohnung und schlägt eine Zuordnung
            vor.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {uploading ? "Analysiere…" : "＋ Mietvertrag hochladen"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--destructive)]">⚠️ {error}</p>}

      {mietvertraege.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Mietverträge hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {mietvertraege.map((mv) => {
            const w = wohnungen.find((x) => x.id === mv.wohnungId);
            const m = mieter.find((x) => x.id === mv.mieterId);
            return (
              <div key={mv.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {mv.nummer || "—"}
                    </span>{" "}
                    <span className="font-semibold">{mv.dateiName}</span>
                  </div>
                  {mv.storedFileName && (
                    <a
                      href={`/api/files/${mv.storedFileName}?mime=${encodeURIComponent(
                        mv.mimeType
                      )}&name=${encodeURIComponent(mv.dateiName)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      👁 Ansehen
                    </a>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                  <span>Mieter: {m?.name || "–"}</span>
                  <a
                    href={`/liegenschaften?select=wohnung:${mv.wohnungId}`}
                    className="text-primary hover:underline"
                  >
                    Wohnung: {w?.bezeichnung || "–"} ↗
                  </a>
                  {mv.sollMiete ? <span>Kaltmiete: {formatCurrency(mv.sollMiete)}</span> : null}
                  {mv.mietbeginn && <span>Beginn: {mv.mietbeginn}</span>}
                  <span>Status: {mv.status}</span>
                  <span>Hochgeladen: {formatDate(mv.hochgeladenAm)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ergebnis && (
        <Modal title="Mietvertrag zuordnen" onClose={() => setErgebnis(null)}>
          <p className="mb-3 text-sm text-muted-foreground">
            Erkannt: <strong>{ergebnis.extraktion.mieterName || "unbekannter Mieter"}</strong>
            {ergebnis.vorschlag.mieterName && (
              <> — automatischer Treffer: <strong>{ergebnis.vorschlag.mieterName}</strong></>
            )}
          </p>
          <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            {ergebnis.extraktion.sollMiete ? (
              <span>Kaltmiete: {formatCurrency(ergebnis.extraktion.sollMiete)}</span>
            ) : null}
            {ergebnis.extraktion.mietbeginn && <span>Beginn: {ergebnis.extraktion.mietbeginn}</span>}
          </div>

          <label className="mb-2 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Wohnung</span>
            <select
              value={gewaehlteWohnung}
              onChange={(e) => setGewaehlteWohnung(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {wohnungen.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.bezeichnung}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Mieter</span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMieterModus("neu")}
                className={`rounded-md border px-2.5 py-1.5 ${
                  mieterModus === "neu"
                    ? "border-primary bg-secondary font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                ✨ Neuen Mieter anlegen
              </button>
              <button
                type="button"
                onClick={() => setMieterModus("vorhanden")}
                className={`rounded-md border px-2.5 py-1.5 ${
                  mieterModus === "vorhanden"
                    ? "border-primary bg-secondary font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                Bestehenden Mieter verknüpfen
              </button>
            </div>
          </div>

          {mieterModus === "neu" ? (
            <div className="mb-4">
              <label className="mb-2 block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
                <input
                  value={neuerMieterName}
                  onChange={(e) => setNeuerMieterName(e.target.value)}
                  placeholder="Name des Mieters"
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Aus dem Vertrag übernommen: Kaltmiete{" "}
                {ergebnis.extraktion.sollMiete ? formatCurrency(ergebnis.extraktion.sollMiete) : "–"},
                Nebenkosten{" "}
                {ergebnis.extraktion.nebenkostenVorauszahlung
                  ? formatCurrency(ergebnis.extraktion.nebenkostenVorauszahlung)
                  : "–"}
                , Mietbeginn {ergebnis.extraktion.mietbeginn || "–"}. Der Mieter wird beim
                Bestätigen mit diesen Stammdaten für die gewählte Wohnung angelegt.
              </p>
            </div>
          ) : (
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Bestehender Mieter
              </span>
              <select
                value={gewaehlterMieter}
                onChange={(e) => setGewaehlterMieter(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— kein Mieter verknüpfen —</option>
                {mieter.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setErgebnis(null)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              onClick={bestaetigen}
              disabled={!gewaehlteWohnung || (mieterModus === "neu" && !neuerMieterName.trim())}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Bestätigen &amp; speichern
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
