"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Plus, Trash2, CalendarPlus, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Liegenschaft, Reservierung, Veranstaltungsflaeche, VeranstaltungsflaecheStatus } from "@/lib/types";

const STATUS: VeranstaltungsflaecheStatus[] = ["Verfügbar", "Gesperrt"];
const STATUS_FARBE: Record<VeranstaltungsflaecheStatus, string> = {
  Verfügbar: "bg-[var(--success-bg)] text-[var(--success)]",
  Gesperrt: "bg-[var(--danger-bg)] text-[var(--destructive)]",
};
const RES_STATUS_FARBE: Record<Reservierung["status"], string> = {
  Angefragt: "bg-[var(--warning-bg,var(--danger-bg))] text-[var(--warning,var(--destructive))]",
  Bestätigt: "bg-[var(--success-bg)] text-[var(--success)]",
  Storniert: "bg-muted text-muted-foreground",
};

const LEER = {
  bezeichnung: "",
  liegenschaftId: "",
  flaecheQm: "",
  kapazitaet: "",
  ausstattung: "",
  preisProTag: "",
  status: "Verfügbar" as VeranstaltungsflaecheStatus,
  notizen: "",
};

export default function VeranstaltungsflaechenPage() {
  const [flaechen, setFlaechen] = useState<Veranstaltungsflaeche[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState<Veranstaltungsflaeche | null | "neu">(null);
  const [reservierungenOffen, setReservierungenOffen] = useState<Veranstaltungsflaeche | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/veranstaltungsflaechen").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([f, l]) => {
        setFlaechen(f.flaechen || []);
        setLiegenschaften(l.liegenschaften || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const liegenschaftName = (id: string) => liegenschaften.find((l) => l.id === id)?.name || "—";
  const gefiltert = filter ? flaechen.filter((f) => f.liegenschaftId === filter) : flaechen;

  async function handleDelete(id: string) {
    if (!confirm("Fläche wirklich löschen (inkl. aller Reservierungen)?")) return;
    const r = await fetch(`/api/veranstaltungsflaechen/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Löschen fehlgeschlagen.");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <PartyPopper size={22} className="text-primary" />
            Veranstaltungsflächen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kurzzeitvermietung mit automatischer Belegungs-/Konfliktprüfung.
          </p>
        </div>
        <button
          onClick={() => setFormularOffen("neu")}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Fläche anlegen
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
        <p className="text-sm text-muted-foreground">Noch keine Veranstaltungsflächen erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Bezeichnung</th>
                <th className="px-4 py-2 font-medium">Liegenschaft</th>
                <th className="px-4 py-2 font-medium">Kapazität</th>
                <th className="px-4 py-2 font-medium">Preis/Tag</th>
                <th className="px-4 py-2 font-medium">Status</th>
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
                  <td className="px-4 py-3">{f.bezeichnung}</td>
                  <td className="px-4 py-3">{liegenschaftName(f.liegenschaftId)}</td>
                  <td className="px-4 py-3">{f.kapazitaet ? `${f.kapazitaet} Pers.` : "—"}</td>
                  <td className="px-4 py-3">
                    {typeof f.preisProTag === "number" ? `${f.preisProTag.toLocaleString("de-DE")} €` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[f.status]}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReservierungenOffen(f);
                        }}
                        className="text-muted-foreground hover:text-primary"
                        title="Reservierungen"
                      >
                        <CalendarPlus size={15} />
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

      {reservierungenOffen && (
        <ReservierungenModal flaeche={reservierungenOffen} onClose={() => setReservierungenOffen(null)} />
      )}

      {formularOffen && (
        <FlaecheFormular
          flaeche={formularOffen === "neu" ? null : formularOffen}
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

function FlaecheFormular({
  flaeche,
  liegenschaften,
  vorausgewaehlteLiegenschaft,
  onClose,
  onDone,
}: {
  flaeche: Veranstaltungsflaeche | null;
  liegenschaften: Liegenschaft[];
  vorausgewaehlteLiegenschaft: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState(
    flaeche
      ? {
          bezeichnung: flaeche.bezeichnung,
          liegenschaftId: flaeche.liegenschaftId,
          flaecheQm: flaeche.flaecheQm?.toString() || "",
          kapazitaet: flaeche.kapazitaet?.toString() || "",
          ausstattung: flaeche.ausstattung || "",
          preisProTag: flaeche.preisProTag?.toString() || "",
          status: flaeche.status,
          notizen: flaeche.notizen || "",
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
        kapazitaet: werte.kapazitaet ? Number(werte.kapazitaet) : undefined,
        preisProTag: werte.preisProTag ? Number(werte.preisProTag) : undefined,
      };
      const url = flaeche ? `/api/veranstaltungsflaechen/${flaeche.id}` : "/api/veranstaltungsflaechen";
      const method = flaeche ? "PATCH" : "POST";
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
    <Modal title={flaeche ? "Fläche bearbeiten" : "Fläche anlegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={werte.status}
              onChange={(e) => setWerte({ ...werte, status: e.target.value as VeranstaltungsflaecheStatus })}
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
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fläche (m²)</label>
            <input
              type="number"
              value={werte.flaecheQm}
              onChange={(e) => setWerte({ ...werte, flaecheQm: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Kapazität (Pers.)</label>
            <input
              type="number"
              value={werte.kapazitaet}
              onChange={(e) => setWerte({ ...werte, kapazitaet: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Preis/Tag (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={werte.preisProTag}
              onChange={(e) => setWerte({ ...werte, preisProTag: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ausstattung</label>
          <input
            value={werte.ausstattung}
            onChange={(e) => setWerte({ ...werte, ausstattung: e.target.value })}
            placeholder="z.B. Bestuhlung, Beamer, Küche"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
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
          {busy ? "Speichere …" : flaeche ? "Speichern" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}

function ReservierungenModal({ flaeche, onClose }: { flaeche: Veranstaltungsflaeche; onClose: () => void }) {
  const [reservierungen, setReservierungen] = useState<Reservierung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/veranstaltungsflaechen/${flaeche.id}/reservierungen`)
      .then((r) => r.json())
      .then((j) => {
        setReservierungen(j.reservierungen || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [flaeche.id]);

  async function stornieren(id: string) {
    if (!confirm("Reservierung wirklich stornieren?")) return;
    const r = await fetch(`/api/reservierungen/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Storniert" }),
    });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Stornieren fehlgeschlagen.");
  }

  return (
    <Modal title={`Reservierungen — ${flaeche.bezeichnung}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <button
          onClick={() => setFormularOffen(true)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-card"
        >
          <Plus size={12} />
          Reservierung anlegen
        </button>

        {error && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : reservierungen.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Reservierungen.</p>
        ) : (
          <div className="space-y-1.5">
            {reservierungen.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                <div>
                  <div className="font-medium">
                    {r.titel} — {r.mieter}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${RES_STATUS_FARBE[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(r.beginn).toLocaleString("de-DE")} – {new Date(r.ende).toLocaleString("de-DE")}
                    {typeof r.preis === "number" && ` · ${r.preis.toLocaleString("de-DE")} €`}
                  </div>
                </div>
                {r.status !== "Storniert" && (
                  <button
                    onClick={() => stornieren(r.id)}
                    className="text-muted-foreground hover:text-[var(--destructive)]"
                    title="Stornieren"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {formularOffen && (
        <ReservierungFormular
          flaecheId={flaeche.id}
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

function ReservierungFormular({
  flaecheId,
  onClose,
  onDone,
}: {
  flaecheId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState({
    titel: "",
    mieter: "",
    kontakt: "",
    beginn: "",
    ende: "",
    status: "Bestätigt" as Reservierung["status"],
    preis: "",
    notizen: "",
  });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [konflikte, setKonflikte] = useState<{ titel: string; beginn: string; ende: string }[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    setKonflikte(null);
    try {
      const r = await fetch(`/api/veranstaltungsflaechen/${flaecheId}/reservierungen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...werte, preis: werte.preis ? Number(werte.preis) : undefined }),
      });
      const json = await r.json();
      if (r.status === 409) {
        setKonflikte(json.konflikte || []);
        setFehler(json.error);
        return;
      }
      if (!r.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      onDone();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reservierung anlegen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Titel</label>
          <input
            required
            value={werte.titel}
            onChange={(e) => setWerte({ ...werte, titel: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mieter/Veranstalter</label>
            <input
              required
              value={werte.mieter}
              onChange={(e) => setWerte({ ...werte, mieter: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Kontakt</label>
            <input
              value={werte.kontakt}
              onChange={(e) => setWerte({ ...werte, kontakt: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Beginn</label>
            <input
              type="datetime-local"
              required
              value={werte.beginn}
              onChange={(e) => setWerte({ ...werte, beginn: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ende</label>
            <input
              type="datetime-local"
              required
              value={werte.ende}
              onChange={(e) => setWerte({ ...werte, ende: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={werte.status}
              onChange={(e) => setWerte({ ...werte, status: e.target.value as Reservierung["status"] })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="Angefragt">Angefragt</option>
              <option value="Bestätigt">Bestätigt</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Preis (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={werte.preis}
              onChange={(e) => setWerte({ ...werte, preis: e.target.value })}
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
        {konflikte && konflikte.length > 0 && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            <p className="font-medium">Kollidiert mit:</p>
            <ul className="mt-1 list-disc pl-4">
              {konflikte.map((k, i) => (
                <li key={i}>
                  {k.titel}: {new Date(k.beginn).toLocaleString("de-DE")} – {new Date(k.ende).toLocaleString("de-DE")}
                </li>
              ))}
            </ul>
          </div>
        )}
        {fehler && !konflikte && (
          <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">
            {fehler}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Prüfe & speichere …" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}
