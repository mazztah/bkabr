"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2, BookOpen, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Flurstueck, FlurstueckWirtschaftsart, GrundbuchAbteilung, GrundbuchEintrag, Liegenschaft } from "@/lib/types";

const WIRTSCHAFTSARTEN: FlurstueckWirtschaftsart[] = [
  "Gebäude- und Freifläche",
  "Landwirtschaftsfläche",
  "Waldfläche",
  "Verkehrsfläche",
  "Wasserfläche",
  "Grünfläche",
  "Kleingarten",
  "Jagd",
  "Fischerei",
  "Sonstige Nutzung",
];

const LEER = {
  liegenschaftId: "",
  gemarkung: "",
  flur: "",
  flurstueckNummer: "",
  wirtschaftsart: "Gebäude- und Freifläche" as FlurstueckWirtschaftsart,
  flaecheQm: "",
  grundbuchblatt: "",
  grundbuchamt: "",
  notizen: "",
};

export default function FlurstueckePage() {
  const [flurstuecke, setFlurstuecke] = useState<Flurstueck[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState<Flurstueck | null | "neu">(null);
  const [grundbuchOffen, setGrundbuchOffen] = useState<Flurstueck | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/flurstuecke").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([f, l]) => {
        setFlurstuecke(f.flurstuecke || []);
        setLiegenschaften(l.liegenschaften || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const liegenschaftName = (id: string) =>
    liegenschaften.find((l) => l.id === id)?.name || "Unbekannt";

  const gefiltert = filter ? flurstuecke.filter((f) => f.liegenschaftId === filter) : flurstuecke;

  async function handleDelete(id: string) {
    if (!confirm("Flurstück wirklich löschen?")) return;
    const r = await fetch(`/api/flurstuecke/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Löschen fehlgeschlagen.");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <MapPin size={22} className="text-primary" />
            Flurstücke
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gemarkung, Flur, Flurstücksnummer und Grundbuchbezug je Liegenschaft.
          </p>
        </div>
        <button
          onClick={() => setFormularOffen("neu")}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Flurstück anlegen
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
        <p className="text-sm text-muted-foreground">Noch keine Flurstücke erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Liegenschaft</th>
                <th className="px-4 py-2 font-medium">Gemarkung / Flur / Nr.</th>
                <th className="px-4 py-2 font-medium">Wirtschaftsart</th>
                <th className="px-4 py-2 font-medium">Fläche</th>
                <th className="px-4 py-2 font-medium">Grundbuch</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-t border-border hover:bg-card/50"
                  onClick={() => setFormularOffen(f)}
                >
                  <td className="px-4 py-3">{liegenschaftName(f.liegenschaftId)}</td>
                  <td className="px-4 py-3">
                    {f.gemarkung} · Flur {f.flur} · Nr. {f.flurstueckNummer}
                  </td>
                  <td className="px-4 py-3">{f.wirtschaftsart}</td>
                  <td className="px-4 py-3">
                    {f.flaecheQm ? `${f.flaecheQm.toLocaleString("de-DE")} m²` : "—"}
                  </td>
                  <td className="px-4 py-3">{f.grundbuchblatt || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setGrundbuchOffen(f);
                        }}
                        className="text-muted-foreground hover:text-primary"
                        title="Grundbuch"
                      >
                        <BookOpen size={15} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(f.id);
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

      {grundbuchOffen && (
        <GrundbuchModal flurstueck={grundbuchOffen} onClose={() => setGrundbuchOffen(null)} />
      )}

      {formularOffen && (
        <FlurstueckFormular
          flurstueck={formularOffen === "neu" ? null : formularOffen}
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

function FlurstueckFormular({
  flurstueck,
  liegenschaften,
  vorausgewaehlteLiegenschaft,
  onClose,
  onDone,
}: {
  flurstueck: Flurstueck | null;
  liegenschaften: Liegenschaft[];
  vorausgewaehlteLiegenschaft: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState(
    flurstueck
      ? {
          liegenschaftId: flurstueck.liegenschaftId,
          gemarkung: flurstueck.gemarkung,
          flur: flurstueck.flur,
          flurstueckNummer: flurstueck.flurstueckNummer,
          wirtschaftsart: flurstueck.wirtschaftsart,
          flaecheQm: flurstueck.flaecheQm?.toString() || "",
          grundbuchblatt: flurstueck.grundbuchblatt || "",
          grundbuchamt: flurstueck.grundbuchamt || "",
          notizen: flurstueck.notizen || "",
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
      const payload = {
        ...werte,
        flaecheQm: werte.flaecheQm ? Number(werte.flaecheQm) : undefined,
      };
      const url = flurstueck ? `/api/flurstuecke/${flurstueck.id}` : "/api/flurstuecke";
      const method = flurstueck ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <Modal title={flurstueck ? "Flurstück bearbeiten" : "Flurstück anlegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
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
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Gemarkung</label>
            <input
              required
              value={werte.gemarkung}
              onChange={(e) => setWerte({ ...werte, gemarkung: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Flur</label>
            <input
              required
              value={werte.flur}
              onChange={(e) => setWerte({ ...werte, flur: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Flurstück-Nr.</label>
            <input
              required
              value={werte.flurstueckNummer}
              onChange={(e) => setWerte({ ...werte, flurstueckNummer: e.target.value })}
              placeholder="z.B. 45/2"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Wirtschaftsart</label>
            <select
              value={werte.wirtschaftsart}
              onChange={(e) =>
                setWerte({ ...werte, wirtschaftsart: e.target.value as FlurstueckWirtschaftsart })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {WIRTSCHAFTSARTEN.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fläche (m²)</label>
            <input
              type="number"
              step="0.01"
              value={werte.flaecheQm}
              onChange={(e) => setWerte({ ...werte, flaecheQm: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Grundbuchblatt</label>
            <input
              value={werte.grundbuchblatt}
              onChange={(e) => setWerte({ ...werte, grundbuchblatt: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Grundbuchamt</label>
            <input
              value={werte.grundbuchamt}
              onChange={(e) => setWerte({ ...werte, grundbuchamt: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
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
          {busy ? "Speichere …" : flurstueck ? "Speichern" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}

const ABTEILUNGEN: { id: GrundbuchAbteilung; titel: string; hinweis: string }[] = [
  { id: "I", titel: "Abteilung I — Eigentümer", hinweis: "Eigentümer und Eigentumsübergänge" },
  {
    id: "II",
    titel: "Abteilung II — Lasten und Beschränkungen",
    hinweis: "z.B. Wegerecht, Nießbrauch, Vorkaufsrecht, Erbbaurecht",
  },
  { id: "III", titel: "Abteilung III — Grundpfandrechte", hinweis: "Hypotheken, Grundschulden, Rentenschulden" },
];

function GrundbuchModal({ flurstueck, onClose }: { flurstueck: Flurstueck; onClose: () => void }) {
  const [eintraege, setEintraege] = useState<GrundbuchEintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [neuFuer, setNeuFuer] = useState<GrundbuchAbteilung | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/grundbuch?flurstueckId=${flurstueck.id}`)
      .then((r) => r.json())
      .then((j) => {
        setEintraege(j.eintraege || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [flurstueck.id]);

  async function handleRoeten(id: string) {
    const grund = prompt("Grund der Löschung/Ablösung (optional):") || undefined;
    const r = await fetch(`/api/grundbuch/${id}/roeten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grund }),
    });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Röten fehlgeschlagen.");
  }

  return (
    <Modal
      title={`Grundbuch — ${flurstueck.gemarkung} Flur ${flurstueck.flur} Nr. ${flurstueck.flurstueckNummer}`}
      onClose={onClose}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {error && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : (
          ABTEILUNGEN.map((abt) => {
            const eintraegeAbt = eintraege.filter((e) => e.abteilung === abt.id);
            return (
              <div key={abt.id}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{abt.titel}</h3>
                    <p className="text-xs text-muted-foreground">{abt.hinweis}</p>
                  </div>
                  <button
                    onClick={() => setNeuFuer(abt.id)}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-card"
                  >
                    <Plus size={12} />
                    Eintrag
                  </button>
                </div>
                {eintraegeAbt.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine Einträge.</p>
                ) : (
                  <div className="space-y-1.5">
                    {eintraegeAbt.map((e) => (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs ${
                          e.geloeschtAm ? "opacity-50" : ""
                        }`}
                      >
                        <div>
                          <div className="font-medium">
                            {e.lfdNummer ? `Nr. ${e.lfdNummer} — ` : ""}
                            {e.art} · {e.berechtigter}
                            {e.geloeschtAm && (
                              <span className="ml-2 text-[var(--destructive)]">
                                (gerötet {new Date(e.geloeschtAm).toLocaleDateString("de-DE")})
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground">
                            eingetragen {new Date(e.eingetragenAm).toLocaleDateString("de-DE")}
                            {typeof e.betrag === "number" &&
                              ` · ${e.betrag.toLocaleString("de-DE")} ${e.waehrung || "EUR"}`}
                            {e.beschreibung && ` · ${e.beschreibung}`}
                          </div>
                        </div>
                        {!e.geloeschtAm && (
                          <button
                            onClick={() => handleRoeten(e.id)}
                            className="text-muted-foreground hover:text-[var(--destructive)]"
                            title="Röten (erloschen/abgelöst)"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {neuFuer && (
        <GrundbuchEintragFormular
          flurstueckId={flurstueck.id}
          abteilung={neuFuer}
          onClose={() => setNeuFuer(null)}
          onDone={() => {
            setNeuFuer(null);
            refresh();
          }}
        />
      )}
    </Modal>
  );
}

function GrundbuchEintragFormular({
  flurstueckId,
  abteilung,
  onClose,
  onDone,
}: {
  flurstueckId: string;
  abteilung: GrundbuchAbteilung;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState({
    lfdNummer: "",
    art: "",
    berechtigter: "",
    betrag: "",
    beschreibung: "",
    eingetragenAm: new Date().toISOString().slice(0, 10),
    notizen: "",
  });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch("/api/grundbuch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flurstueckId,
          abteilung,
          ...werte,
          betrag: werte.betrag ? Number(werte.betrag) : undefined,
        }),
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
    <Modal title={`Neuer Eintrag — Abteilung ${abteilung}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Lfd. Nummer</label>
            <input
              value={werte.lfdNummer}
              onChange={(e) => setWerte({ ...werte, lfdNummer: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Eingetragen am</label>
            <input
              type="date"
              required
              value={werte.eingetragenAm}
              onChange={(e) => setWerte({ ...werte, eingetragenAm: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Art {abteilung === "I" ? "(z.B. Eigentümer)" : abteilung === "II" ? "(z.B. Wegerecht)" : "(z.B. Grundschuld)"}
          </label>
          <input
            required
            value={werte.art}
            onChange={(e) => setWerte({ ...werte, art: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Berechtigter</label>
          <input
            required
            value={werte.berechtigter}
            onChange={(e) => setWerte({ ...werte, berechtigter: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {abteilung === "III" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Betrag (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={werte.betrag}
              onChange={(e) => setWerte({ ...werte, betrag: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Beschreibung</label>
          <input
            value={werte.beschreibung}
            onChange={(e) => setWerte({ ...werte, beschreibung: e.target.value })}
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
          {busy ? "Speichere …" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}
