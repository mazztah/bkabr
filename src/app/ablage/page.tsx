"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogPanel from "@/components/LogPanel";
import Modal from "@/components/Modal";
import { AblageDokument, AblageStatus, DOKUMENT_TYP_LABEL } from "@/lib/types";

const STATUS_LABEL: Record<AblageStatus, string> = {
  neu: "🆕 Neu",
  in_pruefung: "🔍 Wird geprüft",
  zugeordnet: "✅ Zugeordnet",
  verworfen: "🗑️ Verworfen",
};

const STATUS_FARBE: Record<AblageStatus, string> = {
  neu: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  in_pruefung: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  zugeordnet: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  verworfen: "bg-muted text-muted-foreground",
};

function formatGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatZeit(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AblagePage() {
  const [dokumente, setDokumente] = useState<AblageDokument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"offen" | "alle">("offen");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bestaetigungOffen, setBestaetigungOffen] = useState(false);
  const [detailsOffen, setDetailsOffen] = useState<AblageDokument | null>(null);
  // Separater Busy-State (statt busyId mitzunutzen), weil dieselbe Zeile
  // theoretisch mehrere Aktionen anbietet (Löschen, Details, Investor
  // anlegen) — busyId würde sonst den Löschen-Button fälschlich mitsperren.
  const [investorBusyId, setInvestorBusyId] = useState<string | null>(null);
  const [investorFehler, setInvestorFehler] = useState<string | null>(null);

  const laden = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ablage");
      const json = await res.json();
      setDokumente(json.ablage || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    laden();
  }, []);

  const sichtbar = dokumente.filter((d) => (filter === "alle" ? true : d.status !== "zugeordnet"));
  const nichtZugeordnetAnzahl = dokumente.filter((d) => d.status !== "zugeordnet").length;

  const einzelnLoeschen = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/ablage/${id}`, { method: "DELETE" });
      setDokumente((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const alleNichtZugeordnetenLoeschen = async () => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/ablage/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestaetigt: true }),
      });
      if (res.ok) {
        setBestaetigungOffen(false);
        await laden();
      }
    } finally {
      setBulkBusy(false);
    }
  };

  // Übernimmt eine Ablage-Datei als neuen "Vorschlag (Freigabe offen)" in
  // die Investorenliste (/investoren, Status "vorschlag") — die finale
  // Freigabe passiert dort mit dem bestehenden "✓ Freigeben"-Button. Die
  // Datei verschwindet hier sofort aus der Ablage, sobald sie in der
  // Investorenliste gelandet ist.
  const alsInvestorAnlegen = async (id: string, dateiName: string) => {
    setInvestorFehler(null);
    setInvestorBusyId(id);
    try {
      const res = await fetch(`/api/ablage/${id}/investor-vorschlag`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Anlegen als Investor fehlgeschlagen.");
      setDokumente((prev) => prev.filter((d) => d.id !== id));
      if (detailsOffen?.id === id) setDetailsOffen(null);
    } catch (e) {
      setInvestorFehler(
        `„${dateiName}" konnte nicht als Investor angelegt werden: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setInvestorBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">📥 Ablage</h1>
          <p className="text-sm text-muted-foreground">
            Alle hochgeladenen Dokumente landen hier zuerst. Sobald die KI sie im{" "}
            <Link href="/smart-upload" className="underline">
              🧠 Intelligenten Upload
            </Link>{" "}
            korrekt zugeordnet hat, verschwinden sie aus dieser Ansicht. Nicht zugeordnete oder
            verworfene Dokumente kannst du hier löschen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "offen" | "alle")}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="offen">Nur offene/verworfene</option>
            <option value="alle">Alle (inkl. zugeordnet)</option>
          </select>
          <button
            onClick={() => setBestaetigungOffen(true)}
            disabled={nichtZugeordnetAnzahl === 0}
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive disabled:opacity-40"
          >
            🗑️ Alle nicht zugeordneten löschen ({nichtZugeordnetAnzahl})
          </button>
        </div>
      </div>

      {bestaetigungOffen && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="mb-1 text-sm font-semibold">⚠️ Bist du sicher?</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Es werden <strong>{nichtZugeordnetAnzahl}</strong> nicht zugeordnete bzw. verworfene
            Dokument(e) unwiderruflich gelöscht (inkl. der Dateien). Bereits zugeordnete Dokumente
            sind davon nicht betroffen.
          </p>
          <div className="flex gap-2">
            <button
              onClick={alleNichtZugeordnetenLoeschen}
              disabled={bulkBusy}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              {bulkBusy ? "Lösche…" : "Ja, endgültig löschen"}
            </button>
            <button
              onClick={() => setBestaetigungOffen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {investorFehler && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          ⚠️ {investorFehler}
        </div>
      )}

      <div className="mb-6 grid gap-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : sichtbar.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {filter === "offen" ? "Keine offenen Dokumente in der Ablage. 🎉" : "Die Ablage ist leer."}
          </p>
        ) : (
          sichtbar.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[d.status]}`}>
                {STATUS_LABEL[d.status]}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-sm font-medium">
                  {d.dateiName}
                  {d.version > 1 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      v{d.version}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatZeit(d.hochgeladenAm)} · {formatGroesse(d.groesse)}
                  {d.erkannterTyp && ` · erkannt als: ${DOKUMENT_TYP_LABEL[d.erkannterTyp]}`}
                  {typeof d.konfidenz === "number" && ` (${Math.round(d.konfidenz * 100)}% Konfidenz)`}
                </p>
                {d.zugeordnetAn && (
                  <p className="text-xs text-green-700 dark:text-green-400">→ {d.zugeordnetAn.label}</p>
                )}
              </div>
              <button
                onClick={() => setDetailsOffen(d)}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                📄 Details
              </button>
              <button
                onClick={() => alsInvestorAnlegen(d.id, d.dateiName)}
                disabled={investorBusyId === d.id}
                title="Als Investoren-Vorschlag in die Investorenliste übernehmen (Datei wird danach aus der Ablage entfernt)"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {investorBusyId === d.id ? "…" : "🏦 Als Investor freigeben"}
              </button>
              <button
                onClick={() => einzelnLoeschen(d.id)}
                disabled={busyId === d.id}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
              >
                {busyId === d.id ? "…" : "🗑️ Löschen"}
              </button>
            </div>
          ))
        )}
      </div>

      {detailsOffen && (
        <DokumentDetails
          dokument={detailsOffen}
          onClose={() => setDetailsOffen(null)}
          onChanged={laden}
          onAlsInvestorAnlegen={alsInvestorAnlegen}
          investorBusy={investorBusyId === detailsOffen.id}
          investorFehler={investorFehler}
        />
      )}

      <LogPanel />
    </div>
  );
}

function istTextdatei(d: AblageDokument): boolean {
  return d.mimeType.startsWith("text/") || /\.(md|markdown|txt|csv)$/i.test(d.dateiName);
}

function DokumentDetails({
  dokument,
  onClose,
  onChanged,
  onAlsInvestorAnlegen,
  investorBusy,
  investorFehler,
}: {
  dokument: AblageDokument;
  onClose: () => void;
  onChanged: () => void;
  onAlsInvestorAnlegen: (id: string, dateiName: string) => void;
  investorBusy: boolean;
  investorFehler: string | null;
}) {
  const [tab, setTab] = useState<"metadaten" | "inhalt" | "version" | "historie">("metadaten");
  const [metaKey, setMetaKey] = useState("");
  const [metaValue, setMetaValue] = useState("");
  const [metadaten, setMetadaten] = useState<Record<string, string>>(dokument.metadaten || {});
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function metaSpeichern(neu: Record<string, string | null>) {
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/ablage/${dokument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadaten: neu }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      setMetadaten(json.ablage.metadaten || {});
      onChanged();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function metaHinzufuegen() {
    if (!metaKey.trim()) return;
    metaSpeichern({ [metaKey.trim()]: metaValue });
    setMetaKey("");
    setMetaValue("");
  }

  return (
    <Modal title={dokument.dateiName} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="flex gap-1 border-b border-border pb-2 text-xs">
          {(["metadaten", "inhalt", "version", "historie"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 ${tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {t === "metadaten" ? "Metadaten" : t === "inhalt" ? "Öffnen/Bearbeiten" : t === "version" ? "Neue Version" : "Historie"}
            </button>
          ))}
        </div>

        <button
          onClick={() => onAlsInvestorAnlegen(dokument.id, dokument.dateiName)}
          disabled={investorBusy}
          title="Als Investoren-Vorschlag in die Investorenliste übernehmen (Datei wird danach aus der Ablage entfernt)"
          className="w-full rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {investorBusy ? "Wird angelegt …" : "🏦 Als Investor freigeben"}
        </button>
        {investorFehler && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {investorFehler}
          </div>
        )}

        {fehler && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>
        )}

        {tab === "metadaten" && (
          <div className="space-y-2">
            {Object.keys(metadaten).length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine Metadaten hinterlegt.</p>
            ) : (
              Object.entries(metadaten).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <span>
                    <span className="font-medium">{k}:</span> {v}
                  </span>
                  <button
                    onClick={() => metaSpeichern({ [k]: null })}
                    disabled={busy}
                    className="text-muted-foreground hover:text-[var(--destructive)]"
                  >
                    Entfernen
                  </button>
                </div>
              ))
            )}
            <div className="flex gap-1.5 pt-1">
              <input
                value={metaKey}
                onChange={(e) => setMetaKey(e.target.value)}
                placeholder="Feldname"
                className="w-1/3 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                value={metaValue}
                onChange={(e) => setMetaValue(e.target.value)}
                placeholder="Wert"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={metaHinzufuegen}
                disabled={busy || !metaKey.trim()}
                className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                + Hinzufügen
              </button>
            </div>
          </div>
        )}

        {tab === "inhalt" && (
          <div className="space-y-2">
            <button
              onClick={() =>
                window.open(
                  `/api/files/${dokument.storedFileName}?mime=${encodeURIComponent(dokument.mimeType)}&name=${encodeURIComponent(dokument.dateiName)}`,
                  "_blank"
                )
              }
              className="w-full rounded-md border border-border px-3 py-2 text-xs hover:border-primary hover:text-primary"
            >
              👁️ In neuem Tab öffnen
            </button>
            {istTextdatei(dokument) ? (
              <TextInhaltEditor dokumentId={dokument.id} onGespeichert={onChanged} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Inline-Bearbeitung ist nur für Text-/Markdown-/CSV-Dateien möglich.
              </p>
            )}
          </div>
        )}

        {tab === "version" && <NeueVersionFormular dokumentId={dokument.id} onGespeichert={onChanged} />}

        {tab === "historie" && (
          <div className="space-y-1.5">
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
              <span className="font-medium">Aktuell: Version {dokument.version}</span> — {dokument.dateiName}
            </div>
            {(dokument.historie || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine früheren Versionen.</p>
            ) : (
              (dokument.historie || []).map((h) => (
                <div key={h.version} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <div className="font-medium">Version {h.version} — {h.dateiName}</div>
                  <div className="text-muted-foreground">
                    ersetzt am {formatZeit(h.ersetztAm)}
                    {h.kommentar && ` · ${h.kommentar}`}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextInhaltEditor({ dokumentId, onGespeichert }: { dokumentId: string; onGespeichert: () => void }) {
  const [inhalt, setInhalt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ablage/${dokumentId}/inhalt`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setInhalt(j.inhalt || "");
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLoading(false));
  }, [dokumentId]);

  async function speichern() {
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/ablage/${dokumentId}/inhalt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inhalt }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      onGespeichert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Lädt …</p>;

  return (
    <div className="space-y-2">
      <textarea
        value={inhalt}
        onChange={(e) => setInhalt(e.target.value)}
        rows={14}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      {fehler && <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>}
      <button
        onClick={speichern}
        disabled={busy}
        className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere neue Version …" : "Als neue Version speichern"}
      </button>
    </div>
  );
}

function NeueVersionFormular({ dokumentId, onGespeichert }: { dokumentId: string; onGespeichert: () => void }) {
  const [datei, setDatei] = useState<File | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function hochladen() {
    if (!datei) return;
    setBusy(true);
    setFehler(null);
    try {
      const formData = new FormData();
      formData.append("file", datei);
      if (kommentar) formData.append("kommentar", kommentar);
      const r = await fetch(`/api/ablage/${dokumentId}/version`, { method: "POST", body: formData });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Hochladen fehlgeschlagen.");
      onGespeichert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Ersetzt die aktuelle Datei durch eine neue Version. Die bisherige Version bleibt in der
        Historie erhalten.
      </p>
      <input
        type="file"
        onChange={(e) => setDatei(e.target.files?.[0] || null)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
      />
      <input
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        placeholder="Kommentar zur Änderung (optional)"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
      />
      {fehler && <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>}
      <button
        onClick={hochladen}
        disabled={!datei || busy}
        className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Lade hoch …" : "Neue Version hochladen"}
      </button>
    </div>
  );
}
