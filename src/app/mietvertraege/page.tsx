"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Mieter,
  MietvertragExtraktion,
  Mietvertrag,
  Wohnung,
  Gebaeude,
  Liegenschaft,
  EinheitTyp,
} from "@/lib/types";
import Modal from "@/components/Modal";

interface AnalyseErgebnis {
  extraktion: MietvertragExtraktion;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  pruefHinweis?: string;
  vorschlag: { mieterId?: string; mieterName?: string; wohnungId?: string };
}

function MietvertraegePageInner() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");
  const highlightRef = useRef<HTMLDivElement>(null);
  const [mietvertraege, setMietvertraege] = useState<Mietvertrag[]>([]);
  const [mieter, setMieter] = useState<Mieter[]>([]);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ergebnis, setErgebnis] = useState<AnalyseErgebnis | null>(null);
  const [gewaehlteWohnung, setGewaehlteWohnung] = useState("");
  const [gewaehlterMieter, setGewaehlterMieter] = useState("");
  const [mieterModus, setMieterModus] = useState<"vorhanden" | "neu">("vorhanden");
  const [neuerMieterName, setNeuerMieterName] = useState("");
  const [wohnungModus, setWohnungModus] = useState<"vorhanden" | "neu">("vorhanden");
  const [neueWohnungGebaeudeId, setNeueWohnungGebaeudeId] = useState("");
  const [neueWohnungBezeichnung, setNeueWohnungBezeichnung] = useState("");
  const [neueWohnungTyp, setNeueWohnungTyp] = useState<EinheitTyp>("Wohnung");
  const [neueWohnungFlaeche, setNeueWohnungFlaeche] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignWohnung, setReassignWohnung] = useState("");
  const [reassignMieter, setReassignMieter] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  // Editierbare Werte im Bestätigungs-Dialog – werden aus der Extraktion
  // vorbefüllt, können aber vor dem Speichern korrigiert werden (behebt
  // Fehlübernahmen z.B. bei der Sollmiete).
  const [editSollMiete, setEditSollMiete] = useState("");
  const [editBk, setEditBk] = useState("");
  const [editHk, setEditHk] = useState("");
  const [editNk, setEditNk] = useState("");
  const [editWarm, setEditWarm] = useState("");
  const [editKaution, setEditKaution] = useState("");
  const [editMietbeginn, setEditMietbeginn] = useState("");
  const [editMietende, setEditMietende] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    Promise.all([
      fetch("/api/mietvertraege").then((r) => r.json()),
      fetch("/api/mieter").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
      fetch("/api/gebaeude").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ]).then(([mv, m, w, g, l]) => {
      setMietvertraege(mv.mietvertraege || []);
      setMieter(m.mieter || []);
      setWohnungen(w.wohnungen || []);
      setGebaeude(g.gebaeude || []);
      setLiegenschaften(l.liegenschaften || []);
    });
  };

  useEffect(refresh, []);

  useEffect(() => {
    if (!highlightId || mietvertraege.length === 0) return;
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [highlightId, mietvertraege]);

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
        setWohnungModus(json.vorschlag.wohnungId ? "vorhanden" : "neu");
        setNeueWohnungBezeichnung(json.extraktion.wohnungsbezeichnung || "");
        setNeueWohnungGebaeudeId("");
        setNeueWohnungFlaeche("");
        setEditSollMiete(json.extraktion.sollMiete ? String(json.extraktion.sollMiete) : "");
        setEditBk(json.extraktion.bkVorauszahlung ? String(json.extraktion.bkVorauszahlung) : "");
        setEditHk(json.extraktion.hkVorauszahlung ? String(json.extraktion.hkVorauszahlung) : "");
        setEditNk(
          json.extraktion.nebenkostenVorauszahlung ? String(json.extraktion.nebenkostenVorauszahlung) : ""
        );
        setEditWarm(json.extraktion.warmmiete ? String(json.extraktion.warmmiete) : "");
        setEditKaution(json.extraktion.kaution ? String(json.extraktion.kaution) : "");
        setEditMietbeginn(json.extraktion.mietbeginn || "");
        setEditMietende(json.extraktion.mietende || "");
      }
    } catch {
      setError("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const bestaetigen = async () => {
    if (!ergebnis) return;
    if (wohnungModus === "vorhanden" && !gewaehlteWohnung) return;
    if (wohnungModus === "neu" && (!neueWohnungGebaeudeId || !neueWohnungBezeichnung.trim())) return;
    const e = ergebnis.extraktion;
    // Nutzer-geprüfte/korrigierte Werte statt der ungeprüften Roh-Extraktion verwenden.
    const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : undefined);
    const rev = {
      sollMiete: num(editSollMiete),
      bkVorauszahlung: num(editBk),
      hkVorauszahlung: num(editHk),
      nebenkostenVorauszahlung: num(editNk),
      warmmiete: num(editWarm),
      kaution: num(editKaution),
      mietbeginn: editMietbeginn || undefined,
      mietende: editMietende || undefined,
    };

    let wohnungId = gewaehlteWohnung;
    if (wohnungModus === "neu") {
      const res = await fetch("/api/wohnungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gebaeudeId: neueWohnungGebaeudeId,
          bezeichnung: neueWohnungBezeichnung,
          typ: neueWohnungTyp,
          flaeche: neueWohnungFlaeche ? Number(neueWohnungFlaeche) : undefined,
        }),
      });
      const json = await res.json();
      wohnungId = json.wohnung?.id;
    }
    if (!wohnungId) return;

    let mieterId = gewaehlterMieter || undefined;
    if (mieterModus === "neu") {
      const res = await fetch("/api/mieter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wohnungId,
          name: neuerMieterName || e.mieterName || "Neuer Mieter",
          mietbeginn: rev.mietbeginn,
          mietende: rev.mietende,
          kaltmiete: rev.sollMiete,
          nebenkostenVorauszahlung: rev.nebenkostenVorauszahlung,
        }),
      });
      const json = await res.json();
      mieterId = json.mieter?.id;
    } else if (mieterId) {
      // Bestehender Mieter: geprüfte Stammdaten aus Vertrag übernehmen
      const patch: Record<string, unknown> = { wohnungId };
      if (rev.mietbeginn) patch.mietbeginn = rev.mietbeginn;
      if (rev.mietende) patch.mietende = rev.mietende;
      if (rev.sollMiete) patch.kaltmiete = rev.sollMiete;
      if (rev.nebenkostenVorauszahlung != null)
        patch.nebenkostenVorauszahlung = rev.nebenkostenVorauszahlung;
      await fetch(`/api/mieter/${mieterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }

    await fetch("/api/mietvertraege", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wohnungId,
        mieterId,
        dateiName: ergebnis.dateiName,
        storedFileName: ergebnis.storedFileName,
        mimeType: ergebnis.mimeType,
        sollMiete: rev.sollMiete,
        bkVorauszahlung: rev.bkVorauszahlung,
        hkVorauszahlung: rev.hkVorauszahlung,
        nebenkostenVorauszahlung: rev.nebenkostenVorauszahlung,
        warmmiete: rev.warmmiete,
        kaution: rev.kaution,
        mietbeginn: rev.mietbeginn,
        mietende: rev.mietende,
        status: "Aktiv",
      }),
    });
    setErgebnis(null);
    refresh();
  };

  const startReassign = (mv: Mietvertrag) => {
    setReassignId(mv.id);
    setReassignWohnung(mv.wohnungId || "");
    setReassignMieter(mv.mieterId || "");
  };

  const saveReassign = async () => {
    if (!reassignId || !reassignWohnung) return;
    setReassignBusy(true);
    try {
      const mv = mietvertraege.find((x) => x.id === reassignId);
      await fetch(`/api/mietvertraege/${reassignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wohnungId: reassignWohnung,
          mieterId: reassignMieter || undefined,
        }),
      });
      if (reassignMieter && mv) {
        const patch: Record<string, unknown> = { wohnungId: reassignWohnung };
        if (mv.sollMiete) patch.kaltmiete = mv.sollMiete;
        if (mv.nebenkostenVorauszahlung != null)
          patch.nebenkostenVorauszahlung = mv.nebenkostenVorauszahlung;
        if (mv.mietbeginn) patch.mietbeginn = mv.mietbeginn;
        if (mv.mietende) patch.mietende = mv.mietende;
        await fetch(`/api/mieter/${reassignMieter}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      }
      setReassignId(null);
      refresh();
    } finally {
      setReassignBusy(false);
    }
  };

  const deleteMietvertrag = async (mv: Mietvertrag) => {
    const label = mv.dateiName || mv.nummer || mv.id;
    if (
      !window.confirm(
        `Mietvertrag „${label}" wirklich endgültig löschen?\n\nDie zugehörige Datei bleibt ggf. auf dem Server; nur der Stammdateneintrag wird entfernt.`
      )
    ) {
      return;
    }
    setDeleteBusyId(mv.id);
    try {
      const res = await fetch(`/api/mietvertraege/${mv.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Löschen fehlgeschlagen");
        return;
      }
      if (reassignId === mv.id) setReassignId(null);
      refresh();
    } finally {
      setDeleteBusyId(null);
    }
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
              <div
                key={mv.id}
                ref={highlightId === mv.id ? highlightRef : undefined}
                className={`rounded-lg border p-4 text-sm transition-colors ${
                  highlightId === mv.id
                    ? "border-primary bg-secondary/60 ring-2 ring-primary"
                    : "border-border bg-card"
                }`}
              >
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
                  {m ? (
                    <a href={`/liegenschaften?select=mieter:${m.id}`} className="text-primary hover:underline">
                      Mieter: {m.name} ↗
                    </a>
                  ) : (
                    <span className="text-[var(--destructive)]">Mieter: nicht zugeordnet</span>
                  )}
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

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startReassign(mv)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    🔗 Neu zuordnen
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusyId === mv.id}
                    onClick={() => deleteMietvertrag(mv)}
                    className="rounded-md border border-[var(--destructive)]/40 px-2 py-1 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:opacity-50"
                  >
                    {deleteBusyId === mv.id ? "Lösche…" : "🗑️ Löschen"}
                  </button>
                </div>

                {reassignId === mv.id && (
                  <div className="mt-3 space-y-2 rounded-md border border-primary/40 bg-muted/40 p-3">
                    <p className="text-xs font-medium">Zuordnung korrigieren</p>
                    <label className="block text-xs">
                      Wohnung
                      <select
                        value={reassignWohnung}
                        onChange={(e) => setReassignWohnung(e.target.value)}
                        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">— wählen —</option>
                        {wohnungen.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.bezeichnung}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      Mieter
                      <select
                        value={reassignMieter}
                        onChange={(e) => setReassignMieter(e.target.value)}
                        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">— optional —</option>
                        {mieter.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={reassignBusy || !reassignWohnung}
                        onClick={saveReassign}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {reassignBusy ? "Speichere…" : "Speichern & Stammdaten sync"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReassignId(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                <NachtragUploader mietvertrag={mv} onDone={refresh} />
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

          {ergebnis.pruefHinweis && (
            <p className="mb-3 rounded-md border border-[var(--warning,#d97706)] bg-[var(--warning-bg,#fef3c7)] px-3 py-2 text-xs text-[var(--warning-fg,#92400e)]">
              ⚠️ {ergebnis.pruefHinweis} Bitte die Werte unten vor dem Speichern prüfen/korrigieren.
            </p>
          )}

          <div className="mb-3 rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Vertragswerte prüfen &amp; ggf. korrigieren
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="text-xs">
                Kaltmiete (€)
                <input
                  value={editSollMiete}
                  onChange={(e) => setEditSollMiete(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                BK-VZ (€)
                <input
                  value={editBk}
                  onChange={(e) => setEditBk(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                HK-VZ (€)
                <input
                  value={editHk}
                  onChange={(e) => setEditHk(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                NK-VZ gesamt (€)
                <input
                  value={editNk}
                  onChange={(e) => setEditNk(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Warmmiete (€)
                <input
                  value={editWarm}
                  onChange={(e) => setEditWarm(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Kaution (€)
                <input
                  value={editKaution}
                  onChange={(e) => setEditKaution(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Mietbeginn
                <input
                  value={editMietbeginn}
                  onChange={(e) => setEditMietbeginn(e.target.value)}
                  placeholder="TT.MM.JJJJ"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Mietende
                <input
                  value={editMietende}
                  onChange={(e) => setEditMietende(e.target.value)}
                  placeholder="TT.MM.JJJJ (optional)"
                  className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
            {(() => {
              const s = Number(editSollMiete.replace(",", ".")) || 0;
              const bk = Number(editBk.replace(",", ".")) || 0;
              const hk = Number(editHk.replace(",", ".")) || 0;
              const warm = Number(editWarm.replace(",", ".")) || 0;
              const summe = s + bk + hk;
              if (warm > 0 && summe > 0 && Math.abs(summe - warm) > 5) {
                return (
                  <p className="mt-2 text-xs text-[var(--warning-fg,#92400e)]">
                    ⚠️ Kaltmiete + NK-VZ = {summe.toFixed(2)} € weicht von Warmmiete {warm.toFixed(2)} € ab.
                  </p>
                );
              }
              return null;
            })()}
          </div>

          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Wohnung</span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setWohnungModus("vorhanden")}
                className={`rounded-md border px-2.5 py-1.5 ${
                  wohnungModus === "vorhanden"
                    ? "border-primary bg-secondary font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                Bestehende Wohnung wählen
              </button>
              <button
                type="button"
                onClick={() => setWohnungModus("neu")}
                className={`rounded-md border px-2.5 py-1.5 ${
                  wohnungModus === "neu"
                    ? "border-primary bg-secondary font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                ✨ Neue Wohnung anlegen
              </button>
            </div>
          </div>

          {wohnungModus === "vorhanden" ? (
            <label className="mb-2 block">
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
          ) : (
            <div className="mb-2 space-y-2">
              {gebaeude.length === 0 ? (
                <p className="text-xs text-[var(--destructive)]">
                  Es ist noch kein Gebäude angelegt. Lege zuerst unter „Gebäude“ ein Gebäude an,
                  bevor du hier eine Wohnung erstellen kannst.
                </p>
              ) : (
                <>
                  <select
                    value={neueWohnungGebaeudeId}
                    onChange={(e) => setNeueWohnungGebaeudeId(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">— Gebäude wählen —</option>
                    {gebaeude.map((g) => {
                      const lg = liegenschaften.find((l) => l.id === g.liegenschaftId);
                      return (
                        <option key={g.id} value={g.id}>
                          {lg ? `${lg.name} – ` : ""}
                          {g.name}
                        </option>
                      );
                    })}
                  </select>
                  <div className="flex gap-2">
                    <input
                      value={neueWohnungBezeichnung}
                      onChange={(e) => setNeueWohnungBezeichnung(e.target.value)}
                      placeholder="Bezeichnung, z.B. 1. OG links"
                      className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
                    />
                    <select
                      value={neueWohnungTyp}
                      onChange={(e) => setNeueWohnungTyp(e.target.value as EinheitTyp)}
                      className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="Wohnung">Wohnung</option>
                      <option value="Gewerbe">Gewerbe</option>
                      <option value="Stellplatz">Stellplatz</option>
                      <option value="Sonstige">Sonstige</option>
                    </select>
                    <input
                      type="number"
                      value={neueWohnungFlaeche}
                      onChange={(e) => setNeueWohnungFlaeche(e.target.value)}
                      placeholder="m²"
                      className="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                </>
              )}
            </div>
          )}

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
                Aus dem Vertrag übernommen (s. Werte oben): Kaltmiete{" "}
                {editSollMiete ? formatCurrency(Number(editSollMiete.replace(",", "."))) : "–"},
                Nebenkosten{" "}
                {editNk ? formatCurrency(Number(editNk.replace(",", "."))) : "–"}
                , Mietbeginn {editMietbeginn || "–"}. Der Mieter wird beim
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
              disabled={
                (wohnungModus === "vorhanden" && !gewaehlteWohnung) ||
                (wohnungModus === "neu" && (!neueWohnungGebaeudeId || !neueWohnungBezeichnung.trim())) ||
                (mieterModus === "neu" && !neuerMieterName.trim())
              }
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

export default function MietvertraegePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Lade…</div>}>
      <MietvertraegePageInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------
// Nachtrag / Übergabeprotokoll zu einem bestehenden Mietvertrag hochladen
// ---------------------------------------------------------------------
function NachtragUploader({ mietvertrag, onDone }: { mietvertrag: Mietvertrag; onDone: () => void }) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState<{
    extraktion: MietvertragExtraktion & { art?: string; hinweis?: string };
    dateiName: string;
    storedFileName: string;
    mimeType: string;
    extraktText?: string;
  } | null>(null);
  const [modus, setModus] = useState<"manuell" | "automatisch">("manuell");
  const [sollMiete, setSollMiete] = useState("");
  const [nk, setNk] = useState("");
  const [kaution, setKaution] = useState("");
  const [mietbeginn, setMietbeginn] = useState("");
  const [mietende, setMietende] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/mietvertraege/${mietvertrag.id}/nachtrag`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Analyse fehlgeschlagen");
        return;
      }
      setErgebnis(json);
      setSollMiete(json.extraktion.sollMiete ? String(json.extraktion.sollMiete) : "");
      setNk(json.extraktion.nebenkostenVorauszahlung ? String(json.extraktion.nebenkostenVorauszahlung) : "");
      setKaution(json.extraktion.kaution ? String(json.extraktion.kaution) : "");
      setMietbeginn(json.extraktion.mietbeginn || "");
      setMietende(json.extraktion.mietende || "");
      setOffen(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const uebernehmen = async () => {
    if (!ergebnis) return;
    setBusy(true);
    try {
      const anhang = {
        id: crypto.randomUUID(),
        typ: ergebnis.extraktion.art === "Uebergabeprotokoll" ? "Uebergabeprotokoll" : "Nachtrag",
        dateiName: ergebnis.dateiName,
        storedFileName: ergebnis.storedFileName,
        mimeType: ergebnis.mimeType,
        hochgeladenAm: new Date().toISOString(),
        extraktText: ergebnis.extraktText,
        notizen: ergebnis.extraktion.hinweis,
      };
      const patch: any = { anhaenge: [...(mietvertrag.anhaenge || []), anhang] };
      if (modus === "automatisch") {
        if (mietbeginn) patch.mietbeginn = mietbeginn;
        if (mietende) patch.mietende = mietende;
        if (sollMiete) patch.sollMiete = Number(sollMiete);
        if (nk) patch.nebenkostenVorauszahlung = Number(nk);
        if (kaution) patch.kaution = Number(kaution);
      }
      await fetch(`/api/mietvertraege/${mietvertrag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setOffen(false);
      setErgebnis(null);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-2">
      {mietvertrag.anhaenge && mietvertrag.anhaenge.length > 0 && (
        <ul className="mb-2 space-y-1">
          {mietvertrag.anhaenge.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">{a.typ}</span>
              <a
                href={`/api/files/${a.storedFileName}?mime=${encodeURIComponent(
                  a.mimeType
                )}&name=${encodeURIComponent(a.dateiName)}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary hover:underline"
              >
                {a.dateiName}
              </a>
              {a.notizen && <span className="text-muted-foreground">– {a.notizen}</span>}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {busy && !offen ? "Analysiere…" : "+ Nachtrag / Übergabeprotokoll hochladen"}
      </button>

      {offen && ergebnis && (
        <Modal title="Nachtrag / Übergabeprotokoll prüfen" onClose={() => setOffen(false)}>
          {ergebnis.extraktion.hinweis && (
            <p className="mb-3 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              ℹ️ {ergebnis.extraktion.hinweis}
            </p>
          )}
          <label className="mb-3 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Wie sollen die Stammdaten aktualisiert werden?</span>
            <select
              value={modus}
              onChange={(e) => setModus(e.target.value as any)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="manuell">Nur ablegen – Stammdaten manuell im Mietvertrag prüfen</option>
              <option value="automatisch">Erkannte Änderungen automatisch übernehmen</option>
            </select>
          </label>
          {modus === "automatisch" && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Kaltmiete (€)</span>
                <input
                  type="number"
                  value={sollMiete}
                  onChange={(e) => setSollMiete(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">NK-Vorauszahlung (€)</span>
                <input
                  type="number"
                  value={nk}
                  onChange={(e) => setNk(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Kaution (€)</span>
                <input
                  type="number"
                  value={kaution}
                  onChange={(e) => setKaution(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Mietbeginn</span>
                <input
                  value={mietbeginn}
                  onChange={(e) => setMietbeginn(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Mietende</span>
                <input
                  value={mietende}
                  onChange={(e) => setMietende(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOffen(false)}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              onClick={uebernehmen}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Speichere…" : "✓ Übernehmen & ablegen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
