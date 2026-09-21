"use client";

import { useEffect, useState } from "react";
import { FileSignature, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { Anhaenge, hochladenUndAnhaengen } from "@/components/Anhaenge";
import { Anhang, AnhangTyp, Liegenschaft, Vertrag, VertragArt, VertragStatus, Zahlungsintervall, PachtNutzungsart } from "@/lib/types";

const ARTEN: VertragArt[] = ["Pacht", "Dienstleistung", "Wartung", "Versicherung", "Erbbaurecht", "Sonstige"];
const NUTZUNGSARTEN: PachtNutzungsart[] = ["Jagd", "Fischerei", "Kleingarten", "Wiese", "Ackerland", "Sonstige Nutzung"];
const STATUS: VertragStatus[] = ["Entwurf", "Aktiv", "Gekündigt", "Beendet"];
const INTERVALLE: Zahlungsintervall[] = ["Einmalig", "Monatlich", "Quartalsweise", "Halbjährlich", "Jährlich"];

const STATUS_FARBE: Record<VertragStatus, string> = {
  Entwurf: "bg-muted text-muted-foreground",
  Aktiv: "bg-[var(--success-bg)] text-[var(--success)]",
  Gekündigt: "bg-[var(--warning-bg,var(--danger-bg))] text-[var(--warning,var(--destructive))]",
  Beendet: "bg-[var(--danger-bg)] text-[var(--destructive)]",
};

const LEER = {
  art: "Sonstige" as VertragArt,
  bezeichnung: "",
  vertragspartner: "",
  liegenschaftId: "",
  nutzungsart: "Sonstige Nutzung" as PachtNutzungsart,
  beginn: new Date().toISOString().slice(0, 10),
  ende: "",
  unbefristet: false,
  kuendigungsfrist: "",
  betrag: "",
  zahlungsintervall: "Jährlich" as Zahlungsintervall,
  status: "Aktiv" as VertragStatus,
  notizen: "",
};

export default function VertraegePage() {
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [artFilter, setArtFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [liegenschaftFilter, setLiegenschaftFilter] = useState("");
  const [suche, setSuche] = useState("");
  const [fristFilter, setFristFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularOffen, setFormularOffen] = useState<Vertrag | null | "neu">(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/vertraege").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([v, l]) => {
        setVertraege(v.vertraege || []);
        setLiegenschaften(l.liegenschaften || []);
        setError(null);
      })
      .catch(() => setError("Fehler beim Laden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const liegenschaftName = (id?: string) =>
    id ? liegenschaften.find((l) => l.id === id)?.name || "—" : "—";

  // VERTR-009: Filter nach Art, Status, Liegenschaft sowie Freitextsuche (Bezeichnung, Partner)
  const sucheKlein = suche.trim().toLowerCase();
  // Frist: Vertragsende innerhalb der nächsten N Tage (nur befristete, noch nicht beendete Verträge) bzw. abgelaufen
  const heute = new Date();
  const tageBisEnde = (v: Vertrag) =>
    !v.unbefristet && v.ende ? Math.ceil((new Date(v.ende).getTime() - heute.getTime()) / 86_400_000) : null;
  const passtZurFrist = (v: Vertrag) => {
    if (!fristFilter) return true;
    const t = tageBisEnde(v);
    if (t === null) return false;
    if (fristFilter === "abgelaufen") return t < 0;
    return t >= 0 && t <= Number(fristFilter);
  };
  const gefiltert = vertraege.filter(
    (v) =>
      passtZurFrist(v) &&
      (!artFilter || v.art === artFilter) &&
      (!statusFilter || v.status === statusFilter) &&
      (!liegenschaftFilter || v.liegenschaftId === liegenschaftFilter) &&
      (!sucheKlein ||
        v.bezeichnung.toLowerCase().includes(sucheKlein) ||
        v.vertragspartner.toLowerCase().includes(sucheKlein))
  );

  async function handleDelete(id: string) {
    if (!confirm("Vertrag wirklich löschen?")) return;
    const r = await fetch(`/api/vertraege/${id}`, { method: "DELETE" });
    if (r.ok) refresh();
    else setError((await r.json()).error || "Löschen fehlgeschlagen.");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileSignature size={22} className="text-primary" />
            Verträge
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pacht-, Dienstleistungs-, Wartungs- und sonstige Verträge. Mietverträge und
            Property-Management-Verträge haben eigene Bereiche.
          </p>
        </div>
        <button
          onClick={() => setFormularOffen("neu")}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Vertrag anlegen
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche: Bezeichnung oder Partner"
          className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          value={artFilter}
          onChange={(e) => setArtFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Alle Vertragsarten</option>
          {ARTEN.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Alle Status</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={fristFilter}
          onChange={(e) => setFristFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Alle Fristen</option>
          <option value="30">Ende in ≤ 30 Tagen</option>
          <option value="90">Ende in ≤ 90 Tagen</option>
          <option value="365">Ende in ≤ 12 Monaten</option>
          <option value="abgelaufen">Bereits abgelaufen</option>
        </select>
        <select
          value={liegenschaftFilter}
          onChange={(e) => setLiegenschaftFilter(e.target.value)}
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
        <p className="text-sm text-muted-foreground">Noch keine Verträge erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Bezeichnung</th>
                <th className="px-4 py-2 font-medium">Art</th>
                <th className="px-4 py-2 font-medium">Vertragspartner</th>
                <th className="px-4 py-2 font-medium">Laufzeit</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((v) => (
                <tr
                  key={v.id}
                  className="cursor-pointer border-t border-border hover:bg-card/50"
                  onClick={() => setFormularOffen(v)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{v.bezeichnung}</div>
                    <div className="text-xs text-muted-foreground">{liegenschaftName(v.liegenschaftId)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {v.art}
                    {v.nutzungsart && <span className="text-xs text-muted-foreground"> ({v.nutzungsart})</span>}
                  </td>
                  <td className="px-4 py-3">{v.vertragspartner}</td>
                  <td className="px-4 py-3">
                    {new Date(v.beginn).toLocaleDateString("de-DE")} –{" "}
                    {v.unbefristet ? "unbefristet" : v.ende ? new Date(v.ende).toLocaleDateString("de-DE") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[v.status]}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(v.id);
                      }}
                      className="text-muted-foreground hover:text-[var(--destructive)]"
                      title="Löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formularOffen && (
        <VertragFormular
          vertrag={formularOffen === "neu" ? null : formularOffen}
          liegenschaften={liegenschaften}
          onClose={() => setFormularOffen(null)}
          onAnhaengeChanged={refresh}
          onDone={() => {
            setFormularOffen(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VertragFormular({
  vertrag,
  liegenschaften,
  onClose,
  onDone,
  onAnhaengeChanged,
}: {
  vertrag: Vertrag | null;
  liegenschaften: Liegenschaft[];
  onClose: () => void;
  onDone: () => void;
  onAnhaengeChanged?: () => void;
}) {
  const [werte, setWerte] = useState(
    vertrag
      ? {
          art: vertrag.art,
          bezeichnung: vertrag.bezeichnung,
          vertragspartner: vertrag.vertragspartner,
          liegenschaftId: vertrag.liegenschaftId || "",
          nutzungsart: vertrag.nutzungsart || "Sonstige Nutzung",
          beginn: vertrag.beginn.slice(0, 10),
          ende: vertrag.ende?.slice(0, 10) || "",
          unbefristet: vertrag.unbefristet,
          kuendigungsfrist: vertrag.kuendigungsfrist || "",
          betrag: vertrag.betrag?.toString() || "",
          zahlungsintervall: vertrag.zahlungsintervall || "Jährlich",
          status: vertrag.status,
          notizen: vertrag.notizen || "",
        }
      : LEER
  );
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [anhaenge, setAnhaenge] = useState<Anhang[]>(vertrag?.anhaenge || []);

  // VERTR-005/006: Vertrags-PDF und Nachträge an bestehenden Vertrag hängen (sofort gespeichert)
  async function anhangHochladen(typ: AnhangTyp, file: File) {
    if (!vertrag) return;
    const neu = await hochladenUndAnhaengen(file, typ);
    if (!neu) return;
    const liste = [...anhaenge, neu];
    const r = await fetch(`/api/vertraege/${vertrag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anhaenge: liste }),
    });
    if (r.ok) {
      setAnhaenge(liste);
      onAnhaengeChanged?.();
    } else {
      setFehler("Dokument konnte nicht am Vertrag gespeichert werden.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const payload = {
        ...werte,
        liegenschaftId: werte.liegenschaftId || undefined,
        betrag: werte.betrag ? Number(werte.betrag) : undefined,
      };
      const url = vertrag ? `/api/vertraege/${vertrag.id}` : "/api/vertraege";
      const method = vertrag ? "PATCH" : "POST";
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
    <Modal title={vertrag ? "Vertrag bearbeiten" : "Vertrag anlegen"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Art</label>
            <select
              value={werte.art}
              onChange={(e) => setWerte({ ...werte, art: e.target.value as VertragArt })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {ARTEN.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={werte.status}
              onChange={(e) => setWerte({ ...werte, status: e.target.value as VertragStatus })}
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
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vertragspartner</label>
          <input
            required
            value={werte.vertragspartner}
            onChange={(e) => setWerte({ ...werte, vertragspartner: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Liegenschaft (optional)</label>
          <select
            value={werte.liegenschaftId}
            onChange={(e) => setWerte({ ...werte, liegenschaftId: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Keine Zuordnung</option>
            {liegenschaften.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {werte.art === "Pacht" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nutzungsart</label>
            <select
              value={werte.nutzungsart}
              onChange={(e) => setWerte({ ...werte, nutzungsart: e.target.value as PachtNutzungsart })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {NUTZUNGSARTEN.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Beginn</label>
            <input
              type="date"
              required
              value={werte.beginn}
              onChange={(e) => setWerte({ ...werte, beginn: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
              Ende
              <span className="flex items-center gap-1 font-normal normal-case">
                <input
                  type="checkbox"
                  checked={werte.unbefristet}
                  onChange={(e) => setWerte({ ...werte, unbefristet: e.target.checked })}
                />
                unbefristet
              </span>
            </label>
            <input
              type="date"
              disabled={werte.unbefristet}
              value={werte.ende}
              onChange={(e) => setWerte({ ...werte, ende: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Kündigungsfrist</label>
          <input
            value={werte.kuendigungsfrist}
            onChange={(e) => setWerte({ ...werte, kuendigungsfrist: e.target.value })}
            placeholder="z.B. 3 Monate zum Quartalsende"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Zahlungsintervall</label>
            <select
              value={werte.zahlungsintervall}
              onChange={(e) =>
                setWerte({ ...werte, zahlungsintervall: e.target.value as Zahlungsintervall })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {INTERVALLE.map((i) => (
                <option key={i} value={i}>
                  {i}
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
        {vertrag ? (
          <Anhaenge
            anhaenge={anhaenge}
            typen={["Vertrag", "Nachtrag", "Sonstiges"]}
            onUpload={anhangHochladen}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Dokumente (PDF) können nach dem Anlegen am Vertrag hinterlegt werden.
          </p>
        )}
        {werte.ende && !werte.unbefristet && (
          <p className="text-xs text-muted-foreground">
            Das Vertragsende wird automatisch als Frist im Kalender angezeigt.
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
          {busy ? "Speichere …" : vertrag ? "Speichern" : "Anlegen"}
        </button>
      </form>
    </Modal>
  );
}
