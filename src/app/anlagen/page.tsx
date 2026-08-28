"use client";

import { useEffect, useState } from "react";
import { Wrench, Plus, Trash2, ClipboardList } from "lucide-react";
import Modal from "@/components/Modal";
import { Anlage, AnlagenTyp, AnlagenStatus, AnlagenWartung, Liegenschaft } from "@/lib/types";

const TYPEN: AnlagenTyp[] = [
  "Brandmeldeanlage (BMA)",
  "Einbruchmeldeanlage (EMA)",
  "Gebäudeleittechnik (GLT)",
  "Raumlufttechnik (RLT)",
  "Aufzug",
  "Klimaanlage",
  "Heizungsanlage",
  "Trinkwasseranlage",
  "Blitzschutzanlage",
  "Rauch- und Wärmeabzugsanlage (RWA)",
  "Notstromaggregat",
  "Photovoltaikanlage",
  "Sprinkleranlage",
  "Torantrieb",
  "Beleuchtungsanlage",
  "Sonstige technische Anlage",
];
const STATUS: AnlagenStatus[] = ["In Betrieb", "Wartung fällig", "Außer Betrieb", "Defekt"];

const STATUS_FARBE: Record<AnlagenStatus, string> = {
  "In Betrieb": "bg-[var(--success-bg)] text-[var(--success)]",
  "Wartung fällig": "bg-[var(--warning-bg,var(--danger-bg))] text-[var(--warning,var(--destructive))]",
  "Außer Betrieb": "bg-muted text-muted-foreground",
  Defekt: "bg-[var(--danger-bg)] text-[var(--destructive)]",
};

const LEER = {
  typ: "Sonstige technische Anlage" as AnlagenTyp,
  bezeichnung: "",
  liegenschaftId: "",
  standortDetail: "",
  hersteller: "",
  modell: "",
  seriennummer: "",
  baujahr: "",
  wartungsfirma: "",
  naechstePruefung: "",
  pruefintervallMonate: "",
  status: "In Betrieb" as AnlagenStatus,
  notizen: "",
};

export default function AnlagenPage() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState<Anlage | null | "neu">(null);
  const [wartungOffen, setWartungOffen] = useState<Anlage | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/anlagen").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([a, l]) => {
        setAnlagen(a.anlagen || []);
        setLiegenschaften(l.liegenschaften || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const liegenschaftName = (id: string) => liegenschaften.find((l) => l.id === id)?.name || "—";
  const gefiltert = filter ? anlagen.filter((a) => a.liegenschaftId === filter) : anlagen;

  async function handleDelete(id: string) {
    if (!confirm("Anlage wirklich löschen (inkl. Wartungshistorie)?")) return;
    const r = await fetch(`/api/anlagen/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Löschen fehlgeschlagen.");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Wrench size={22} className="text-primary" />
            Anlagenmanagement
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Technische Anlagen, Prüftermine und Wartungshistorie.
          </p>
        </div>
        <button
          onClick={() => setFormularOffen("neu")}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Anlage anlegen
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
        <p className="text-sm text-muted-foreground">Noch keine Anlagen erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Bezeichnung</th>
                <th className="px-4 py-2 font-medium">Typ</th>
                <th className="px-4 py-2 font-medium">Liegenschaft</th>
                <th className="px-4 py-2 font-medium">Nächste Prüfung</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-border hover:bg-card/50"
                  onClick={() => setFormularOffen(a)}
                >
                  <td className="px-4 py-3">{a.bezeichnung}</td>
                  <td className="px-4 py-3">{a.typ}</td>
                  <td className="px-4 py-3">{liegenschaftName(a.liegenschaftId)}</td>
                  <td className="px-4 py-3">
                    {a.naechstePruefung ? new Date(a.naechstePruefung).toLocaleDateString("de-DE") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWartungOffen(a);
                        }}
                        className="text-muted-foreground hover:text-primary"
                        title="Wartungshistorie"
                      >
                        <ClipboardList size={15} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(a.id);
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

      {wartungOffen && <WartungModal anlage={wartungOffen} onClose={() => setWartungOffen(null)} onChanged={refresh} />}

      {formularOffen && (
        <AnlageFormular
          anlage={formularOffen === "neu" ? null : formularOffen}
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

function AnlageFormular({
  anlage,
  liegenschaften,
  vorausgewaehlteLiegenschaft,
  onClose,
  onDone,
}: {
  anlage: Anlage | null;
  liegenschaften: Liegenschaft[];
  vorausgewaehlteLiegenschaft: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState(
    anlage
      ? {
          typ: anlage.typ,
          bezeichnung: anlage.bezeichnung,
          liegenschaftId: anlage.liegenschaftId,
          standortDetail: anlage.standortDetail || "",
          hersteller: anlage.hersteller || "",
          modell: anlage.modell || "",
          seriennummer: anlage.seriennummer || "",
          baujahr: anlage.baujahr?.toString() || "",
          wartungsfirma: anlage.wartungsfirma || "",
          naechstePruefung: anlage.naechstePruefung?.slice(0, 10) || "",
          pruefintervallMonate: anlage.pruefintervallMonate?.toString() || "",
          status: anlage.status,
          notizen: anlage.notizen || "",
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
        baujahr: werte.baujahr ? Number(werte.baujahr) : undefined,
        pruefintervallMonate: werte.pruefintervallMonate ? Number(werte.pruefintervallMonate) : undefined,
      };
      const url = anlage ? `/api/anlagen/${anlage.id}` : "/api/anlagen";
      const method = anlage ? "PATCH" : "POST";
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
    <Modal title={anlage ? "Anlage bearbeiten" : "Anlage anlegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Typ</label>
            <select
              value={werte.typ}
              onChange={(e) => setWerte({ ...werte, typ: e.target.value as AnlagenTyp })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {TYPEN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={werte.status}
              onChange={(e) => setWerte({ ...werte, status: e.target.value as AnlagenStatus })}
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
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Bezeichnung</label>
          <input
            required
            value={werte.bezeichnung}
            onChange={(e) => setWerte({ ...werte, bezeichnung: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Standort (Detail)</label>
            <input
              value={werte.standortDetail}
              onChange={(e) => setWerte({ ...werte, standortDetail: e.target.value })}
              placeholder="z.B. Keller, Technikraum"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Hersteller</label>
            <input
              value={werte.hersteller}
              onChange={(e) => setWerte({ ...werte, hersteller: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Modell</label>
            <input
              value={werte.modell}
              onChange={(e) => setWerte({ ...werte, modell: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Baujahr</label>
            <input
              type="number"
              value={werte.baujahr}
              onChange={(e) => setWerte({ ...werte, baujahr: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Wartungsfirma</label>
            <input
              value={werte.wartungsfirma}
              onChange={(e) => setWerte({ ...werte, wartungsfirma: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nächste Prüfung</label>
            <input
              type="date"
              value={werte.naechstePruefung}
              onChange={(e) => setWerte({ ...werte, naechstePruefung: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervall (Monate)</label>
            <input
              type="number"
              value={werte.pruefintervallMonate}
              onChange={(e) => setWerte({ ...werte, pruefintervallMonate: e.target.value })}
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
        {werte.naechstePruefung && (
          <p className="text-xs text-muted-foreground">
            Der Prüftermin wird automatisch als Frist im Kalender angezeigt.
          </p>
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
          {busy ? "Speichere …" : anlage ? "Speichern" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}

function WartungModal({
  anlage,
  onClose,
  onChanged,
}: {
  anlage: Anlage;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [historie, setHistorie] = useState<AnlagenWartung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/anlagen/${anlage.id}/wartungen`)
      .then((r) => r.json())
      .then((j) => {
        setHistorie(j.historie || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [anlage.id]);

  return (
    <Modal title={`Wartungshistorie — ${anlage.bezeichnung}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <button
          onClick={() => setFormularOffen(true)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-card"
        >
          <Plus size={12} />
          Wartung/Prüfung dokumentieren
        </button>

        {error && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : historie.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Einträge.</p>
        ) : (
          <div className="space-y-1.5">
            {historie.map((h) => (
              <div key={h.id} className="rounded-md border border-border px-3 py-2 text-xs">
                <div className="font-medium">
                  {h.art} — {new Date(h.durchgefuehrtAm).toLocaleDateString("de-DE")}
                  {h.ergebnis && <span className="ml-2 text-muted-foreground">({h.ergebnis})</span>}
                </div>
                <div className="text-muted-foreground">
                  {h.durchgefuehrtVon && `${h.durchgefuehrtVon} · `}
                  {h.beschreibung}
                  {typeof h.kosten === "number" && ` · ${h.kosten.toLocaleString("de-DE")} EUR`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formularOffen && (
        <WartungFormular
          anlageId={anlage.id}
          onClose={() => setFormularOffen(false)}
          onDone={() => {
            setFormularOffen(false);
            refresh();
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

function WartungFormular({
  anlageId,
  onClose,
  onDone,
}: {
  anlageId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState({
    durchgefuehrtAm: new Date().toISOString().slice(0, 10),
    durchgefuehrtVon: "",
    art: "Wartung" as AnlagenWartung["art"],
    ergebnis: "Ohne Mängel" as NonNullable<AnlagenWartung["ergebnis"]>,
    beschreibung: "",
    naechsteFaelligkeit: "",
    kosten: "",
  });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch(`/api/anlagen/${anlageId}/wartungen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...werte,
          kosten: werte.kosten ? Number(werte.kosten) : undefined,
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
    <Modal title="Wartung/Prüfung dokumentieren" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Datum</label>
            <input
              type="date"
              required
              value={werte.durchgefuehrtAm}
              onChange={(e) => setWerte({ ...werte, durchgefuehrtAm: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Art</label>
            <select
              value={werte.art}
              onChange={(e) => setWerte({ ...werte, art: e.target.value as AnlagenWartung["art"] })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="Wartung">Wartung</option>
              <option value="Prüfung">Prüfung</option>
              <option value="Reparatur">Reparatur</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Durchgeführt von</label>
          <input
            value={werte.durchgefuehrtVon}
            onChange={(e) => setWerte({ ...werte, durchgefuehrtVon: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ergebnis</label>
            <select
              value={werte.ergebnis}
              onChange={(e) =>
                setWerte({ ...werte, ergebnis: e.target.value as NonNullable<AnlagenWartung["ergebnis"]> })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="Ohne Mängel">Ohne Mängel</option>
              <option value="Mängel behoben">Mängel behoben</option>
              <option value="Mängel offen">Mängel offen</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Kosten (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={werte.kosten}
              onChange={(e) => setWerte({ ...werte, kosten: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Beschreibung</label>
          <textarea
            value={werte.beschreibung}
            onChange={(e) => setWerte({ ...werte, beschreibung: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Nächste Fälligkeit (aktualisiert die Anlage)
          </label>
          <input
            type="date"
            value={werte.naechsteFaelligkeit}
            onChange={(e) => setWerte({ ...werte, naechsteFaelligkeit: e.target.value })}
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
          {busy ? "Speichere …" : "Dokumentieren"}
        </button>
      </form>
    </Modal>
  );
}
