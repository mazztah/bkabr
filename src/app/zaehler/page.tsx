"use client";

import { useEffect, useState } from "react";
import { Gauge, Plus, Trash2, ListPlus } from "lucide-react";
import Modal from "@/components/Modal";
import { Liegenschaft, Zaehler, ZaehlerArt, ZaehlerStatus, ZaehlerAblesung } from "@/lib/types";

const ARTEN: ZaehlerArt[] = ["Strom", "Gas", "Wasser (kalt)", "Wasser (warm)", "Wärme", "Sonstige"];
const STATUS: ZaehlerStatus[] = ["Aktiv", "Ausgebaut", "Defekt"];
const EINHEIT_VORSCHLAG: Record<ZaehlerArt, string> = {
  Strom: "kWh",
  Gas: "m³",
  "Wasser (kalt)": "m³",
  "Wasser (warm)": "m³",
  Wärme: "kWh",
  Sonstige: "",
};

const STATUS_FARBE: Record<ZaehlerStatus, string> = {
  Aktiv: "bg-[var(--success-bg)] text-[var(--success)]",
  Ausgebaut: "bg-muted text-muted-foreground",
  Defekt: "bg-[var(--danger-bg)] text-[var(--destructive)]",
};

const LEER = {
  zaehlernummer: "",
  art: "Strom" as ZaehlerArt,
  einheit: "kWh",
  liegenschaftId: "",
  standortDetail: "",
  einbauDatum: "",
  status: "Aktiv" as ZaehlerStatus,
  notizen: "",
};

export default function ZaehlerPage() {
  const [zaehlerListe, setZaehlerListe] = useState<Zaehler[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState<Zaehler | null | "neu">(null);
  const [ablesungOffen, setAblesungOffen] = useState<Zaehler | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/zaehler").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([z, l]) => {
        setZaehlerListe(z.zaehler || []);
        setLiegenschaften(l.liegenschaften || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const liegenschaftName = (id: string) => liegenschaften.find((l) => l.id === id)?.name || "—";
  const gefiltert = filter ? zaehlerListe.filter((z) => z.liegenschaftId === filter) : zaehlerListe;

  async function handleDelete(id: string) {
    if (!confirm("Zähler wirklich löschen (inkl. Zählerstände-Historie)?")) return;
    const r = await fetch(`/api/zaehler/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Löschen fehlgeschlagen.");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Gauge size={22} className="text-primary" />
            Zählerwesen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gas-, Wasser- und Stromzähler, Zählerstände und Verbrauchsauswertung.
          </p>
        </div>
        <button
          onClick={() => setFormularOffen("neu")}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Zähler anlegen
        </button>
      </div>

      <div className="mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Alle Liegenschaften</option>
          {liegenschaften.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Zähler erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Zählernummer</th>
                <th className="px-4 py-2 font-medium">Art</th>
                <th className="px-4 py-2 font-medium">Liegenschaft</th>
                <th className="px-4 py-2 font-medium">Einheit</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((z) => (
                <tr
                  key={z.id}
                  className="cursor-pointer border-t border-border hover:bg-card/50"
                  onClick={() => setFormularOffen(z)}
                >
                  <td className="px-4 py-3">{z.zaehlernummer}</td>
                  <td className="px-4 py-3">{z.art}</td>
                  <td className="px-4 py-3">{liegenschaftName(z.liegenschaftId)}</td>
                  <td className="px-4 py-3">{z.einheit || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[z.status]}`}>
                      {z.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAblesungOffen(z);
                        }}
                        className="text-muted-foreground hover:text-primary"
                        title="Zählerstände"
                      >
                        <ListPlus size={15} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(z.id);
                        }}
                        className="text-muted-foreground hover:text-[var(--destructive)]"
                        title="Löschen"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ablesungOffen && (
        <AblesungenModal zaehler={ablesungOffen} onClose={() => setAblesungOffen(null)} />
      )}

      {formularOffen && (
        <ZaehlerFormular
          zaehler={formularOffen === "neu" ? null : formularOffen}
          liegenschaften={liegenschaften}
          vorausgewaehlteLiegenschaft={filter}
          onClose={() => setFormularOffen(null)}
          onDone={() => {
            setFormularOffen(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ZaehlerFormular({
  zaehler,
  liegenschaften,
  vorausgewaehlteLiegenschaft,
  onClose,
  onDone,
}: {
  zaehler: Zaehler | null;
  liegenschaften: Liegenschaft[];
  vorausgewaehlteLiegenschaft: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState(
    zaehler
      ? {
          zaehlernummer: zaehler.zaehlernummer,
          art: zaehler.art,
          einheit: zaehler.einheit,
          liegenschaftId: zaehler.liegenschaftId,
          standortDetail: zaehler.standortDetail || "",
          einbauDatum: zaehler.einbauDatum?.slice(0, 10) || "",
          status: zaehler.status,
          notizen: zaehler.notizen || "",
        }
      : { ...LEER, liegenschaftId: vorausgewaehlteLiegenschaft }
  );
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const url = zaehler ? `/api/zaehler/${zaehler.id}` : "/api/zaehler";
      const method = zaehler ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(werte),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      onDone();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={zaehler ? "Zähler bearbeiten" : "Zähler anlegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Zählernummer</label>
            <input
              required
              value={werte.zaehlernummer}
              onChange={(e) => setWerte({ ...werte, zaehlernummer: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Art</label>
            <select
              value={werte.art}
              onChange={(e) => {
                const art = e.target.value as ZaehlerArt;
                setWerte({ ...werte, art, einheit: EINHEIT_VORSCHLAG[art] });
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {ARTEN.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Liegenschaft</label>
            <select
              required
              value={werte.liegenschaftId}
              onChange={(e) => setWerte({ ...werte, liegenschaftId: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Bitte wählen …</option>
              {liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Einheit</label>
            <input
              value={werte.einheit}
              onChange={(e) => setWerte({ ...werte, einheit: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Standort (Detail)</label>
          <input
            value={werte.standortDetail}
            onChange={(e) => setWerte({ ...werte, standortDetail: e.target.value })}
            placeholder="z.B. Wohnung 2. OG rechts"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Einbaudatum</label>
            <input
              type="date"
              value={werte.einbauDatum}
              onChange={(e) => setWerte({ ...werte, einbauDatum: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={werte.status}
              onChange={(e) => setWerte({ ...werte, status: e.target.value as ZaehlerStatus })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notizen</label>
          <textarea
            value={werte.notizen}
            onChange={(e) => setWerte({ ...werte, notizen: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {fehler && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {fehler}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Speichere …" : zaehler ? "Speichern" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}

interface Verbrauch {
  ablesungId: string;
  differenz: number | null;
  tage: number | null;
}

function AblesungenModal({ zaehler, onClose }: { zaehler: Zaehler; onClose: () => void }) {
  const [ablesungen, setAblesungen] = useState<ZaehlerAblesung[]>([]);
  const [verbrauch, setVerbrauch] = useState<Verbrauch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/zaehler/${zaehler.id}/ablesungen`)
      .then((r) => r.json())
      .then((j) => {
        setAblesungen(j.ablesungen || []);
        setVerbrauch(j.verbrauch || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [zaehler.id]);

  const verbrauchFuer = (id: string) => verbrauch.find((v) => v.ablesungId === id);

  return (
    <Modal title={`Zählerstände — ${zaehler.zaehlernummer} (${zaehler.art})`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <button
          onClick={() => setFormularOffen(true)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-card"
        >
          <Plus size={12} />
          Zählerstand erfassen
        </button>

        {error && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : ablesungen.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Ablesungen erfasst.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left uppercase text-muted-foreground">
              <tr>
                <th className="py-1">Datum</th>
                <th className="py-1">Stand</th>
                <th className="py-1">Verbrauch</th>
                <th className="py-1">Ableser</th>
              </tr>
            </thead>
            <tbody>
              {[...ablesungen].reverse().map((a) => {
                const v = verbrauchFuer(a.id);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-1.5">{new Date(a.ablesedatum).toLocaleDateString("de-DE")}</td>
                    <td className="py-1.5">
                      {a.stand.toLocaleString("de-DE")} {zaehler.einheit}
                    </td>
                    <td className="py-1.5">
                      {v?.differenz != null
                        ? `${v.differenz.toLocaleString("de-DE")} ${zaehler.einheit} / ${v.tage} Tage`
                        : "—"}
                    </td>
                    <td className="py-1.5">{a.ableser || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {formularOffen && (
        <AblesungFormular
          zaehlerId={zaehler.id}
          onClose={() => setFormularOffen(false)}
          onDone={() => {
            setFormularOffen(false);
            refresh();
          }}
        />
      )}
    </Modal>
  );
}

function AblesungFormular({
  zaehlerId,
  onClose,
  onDone,
}: {
  zaehlerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState({
    ablesedatum: new Date().toISOString().slice(0, 10),
    stand: "",
    ableser: "",
    notizen: "",
  });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    setHinweis(null);
    try {
      const r = await fetch(`/api/zaehler/${zaehlerId}/ablesungen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...werte, stand: Number(werte.stand) }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      if (json.rueckwaerts) {
        setHinweis("Hinweis: Der Stand liegt unter der letzten Ablesung. Wurde trotzdem gespeichert.");
        setTimeout(onDone, 1200);
      } else {
        onDone();
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Zählerstand erfassen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ablesedatum</label>
            <input
              type="date"
              required
              value={werte.ablesedatum}
              onChange={(e) => setWerte({ ...werte, ablesedatum: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Stand</label>
            <input
              type="number"
              step="0.01"
              required
              value={werte.stand}
              onChange={(e) => setWerte({ ...werte, stand: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ableser</label>
          <input
            value={werte.ableser}
            onChange={(e) => setWerte({ ...werte, ableser: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notizen</label>
          <input
            value={werte.notizen}
            onChange={(e) => setWerte({ ...werte, notizen: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {hinweis && (
          <div className="rounded-md bg-[var(--warning-bg,var(--danger-bg))] px-3 py-2 text-xs text-[var(--warning,var(--destructive))]">
            {hinweis}
          </div>
        )}
        {fehler && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {fehler}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Speichere …" : "Erfassen"}
        </button>
      </form>
    </Modal>
  );
}
