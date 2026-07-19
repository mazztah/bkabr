"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/utils";
import { Eigentuemer, EigentuemerExtraktion, Liegenschaft } from "@/lib/types";
import Modal from "@/components/Modal";

const NEU = "__neu__";

interface AnalyseErgebnis {
  extraktion: EigentuemerExtraktion;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  vorschlag: {
    liegenschaftId?: string;
    liegenschaftName?: string;
    neuanlage?: { name: string; strasse: string; hausnummer: string; plz: string; ort: string };
  };
}

export default function EigentuemerPage() {
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ergebnis, setErgebnis] = useState<AnalyseErgebnis | null>(null);
  const [gewaehlteLiegenschaft, setGewaehlteLiegenschaft] = useState("");
  const [neu, setNeu] = useState({ name: "", strasse: "", hausnummer: "", plz: "", ort: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    Promise.all([
      fetch("/api/eigentuemer").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ]).then(([e, l]) => {
      setEigentuemer(e.eigentuemer || []);
      setLiegenschaften(l.liegenschaften || []);
    });
  };

  useEffect(refresh, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/eigentuemer/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Analyse fehlgeschlagen");
      } else {
        setErgebnis(json);
        if (json.vorschlag.liegenschaftId) {
          setGewaehlteLiegenschaft(json.vorschlag.liegenschaftId);
        } else {
          setGewaehlteLiegenschaft(NEU);
          setNeu({
            name: json.vorschlag.neuanlage?.name || "",
            strasse: json.vorschlag.neuanlage?.strasse || "",
            hausnummer: json.vorschlag.neuanlage?.hausnummer || "",
            plz: json.vorschlag.neuanlage?.plz || "",
            ort: json.vorschlag.neuanlage?.ort || "",
          });
        }
      }
    } catch {
      setError("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const bestaetigen = async () => {
    if (!ergebnis || !gewaehlteLiegenschaft) return;
    setBusy(true);
    try {
      let liegenschaftId = gewaehlteLiegenschaft;

      // Neue Liegenschaft anlegen, falls gewählt – die eingegebenen/vorausgefüllten
      // Stammdaten werden dabei direkt übernommen.
      if (gewaehlteLiegenschaft === NEU) {
        const res = await fetch("/api/liegenschaften", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(neu),
        });
        const json = await res.json();
        liegenschaftId = json.liegenschaft.id;
      }

      const e = ergebnis.extraktion;
      await fetch("/api/eigentuemer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liegenschaftId,
          name: e.eigentuemerName || "Unbekannter Eigentümer",
          anschrift: e.anschrift,
          email: e.email,
          telefon: e.telefon,
          miteigentumsanteil: e.miteigentumsanteil,
          vollmachtVon: e.vollmachtBeginn,
          vollmachtBis: e.vollmachtEnde,
          dateiName: ergebnis.dateiName,
          storedFileName: ergebnis.storedFileName,
          mimeType: ergebnis.mimeType,
          notizen: e.dokumentTyp ? `Dokumenttyp: ${e.dokumentTyp}` : undefined,
        }),
      });
      setErgebnis(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold">👤 Eigentümer</h1>
          <p className="text-sm text-muted-foreground">
            Dokument hochladen (Vollmacht, Grundbuchauszug, Eigentümerbeschluss …) – das System
            erkennt automatisch die betroffene Liegenschaft. Ist sie noch nicht angelegt, kannst
            du sie direkt mit den erkannten Stammdaten neu anlegen.
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
            {uploading ? "Analysiere…" : "＋ Dokument hochladen"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--destructive)]">⚠️ {error}</p>}

      {eigentuemer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Eigentümer-Dokumente hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {eigentuemer.map((eg) => {
            const l = liegenschaften.find((x) => x.id === eg.liegenschaftId);
            return (
              <div key={eg.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {eg.nummer || "—"}
                    </span>{" "}
                    <span className="font-semibold">{eg.name}</span>
                  </div>
                  {eg.storedFileName && (
                    <a
                      href={`/api/files/${eg.storedFileName}?mime=${encodeURIComponent(
                        eg.mimeType || "application/pdf"
                      )}&name=${encodeURIComponent(eg.dateiName || eg.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      👁 Ansehen
                    </a>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                  <a
                    href={`/liegenschaften?select=liegenschaft:${eg.liegenschaftId}`}
                    className="text-primary hover:underline"
                  >
                    Liegenschaft: {l?.name || "–"} ↗
                  </a>
                  {eg.anschrift && <span>Anschrift: {eg.anschrift}</span>}
                  {eg.miteigentumsanteil ? (
                    <span>MEA: {eg.miteigentumsanteil}/1000</span>
                  ) : null}
                  <span>Angelegt: {formatDate(eg.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ergebnis && (
        <Modal title="Eigentümer-Dokument zuordnen" onClose={() => setErgebnis(null)}>
          <p className="mb-3 text-sm text-muted-foreground">
            Erkannt: <strong>{ergebnis.extraktion.eigentuemerName || "unbekannter Eigentümer"}</strong>
            {ergebnis.extraktion.dokumentTyp && <> ({ergebnis.extraktion.dokumentTyp})</>}
            {ergebnis.vorschlag.liegenschaftName && (
              <>
                {" "}
                — automatischer Treffer: <strong>{ergebnis.vorschlag.liegenschaftName}</strong>
              </>
            )}
          </p>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Liegenschaft</span>
            <select
              value={gewaehlteLiegenschaft}
              onChange={(e) => setGewaehlteLiegenschaft(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.strasse} {l.hausnummer}, {l.plz} {l.ort})
                </option>
              ))}
              <option value={NEU}>➕ Neue Liegenschaft anlegen …</option>
            </select>
          </label>

          {gewaehlteLiegenschaft === NEU && (
            <div className="mb-4 space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Stammdaten der neuen Liegenschaft (aus dem Dokument vorausgefüllt, editierbar)
              </p>
              <input
                value={neu.name}
                onChange={(e) => setNeu({ ...neu, name: e.target.value })}
                placeholder="Name der Liegenschaft"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={neu.strasse}
                  onChange={(e) => setNeu({ ...neu, strasse: e.target.value })}
                  placeholder="Straße"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={neu.hausnummer}
                  onChange={(e) => setNeu({ ...neu, hausnummer: e.target.value })}
                  placeholder="Nr."
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={neu.plz}
                  onChange={(e) => setNeu({ ...neu, plz: e.target.value })}
                  placeholder="PLZ"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={neu.ort}
                  onChange={(e) => setNeu({ ...neu, ort: e.target.value })}
                  placeholder="Ort"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            {ergebnis.extraktion.anschrift && <span>Anschrift: {ergebnis.extraktion.anschrift}</span>}
            {ergebnis.extraktion.email && <span>E-Mail: {ergebnis.extraktion.email}</span>}
            {ergebnis.extraktion.telefon && <span>Telefon: {ergebnis.extraktion.telefon}</span>}
            {ergebnis.extraktion.miteigentumsanteil ? (
              <span>MEA: {ergebnis.extraktion.miteigentumsanteil}/1000</span>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setErgebnis(null)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              onClick={bestaetigen}
              disabled={
                busy ||
                !gewaehlteLiegenschaft ||
                (gewaehlteLiegenschaft === NEU && !neu.name.trim())
              }
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Speichere…" : "Bestätigen & speichern"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
