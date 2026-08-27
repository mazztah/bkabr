"use client";

import { useEffect, useState } from "react";
import { UserPlus, Shield, X } from "lucide-react";
import Modal from "@/components/Modal";

// Muss exakt den Rollen-Slugs aus supabase/schema_auth.sql entsprechen.
const ROLE_LABELS: Record<string, string> = {
  systemadministration: "Systemadministration",
  immobilienverwaltung: "Immobilienverwaltung",
  liegenschaftsverwaltung: "Liegenschaftsverwaltung",
  vertragsmanagement: "Vertragsmanagement",
  veranstaltungsmanagement: "Veranstaltungsmanagement",
  haustechnik: "Haustechnik",
  finanzen: "Finanzen/Kostenstellen",
  lesebrechtigte: "Leseberechtigte",
  ticketbearbeiter: "Ticketbearbeiter",
};
const ROLE_IDS = Object.keys(ROLE_LABELS);

interface Nutzer {
  id: string;
  email: string;
  displayName: string | null;
  aktiv: boolean;
  createdAt: string;
  rollen: string[];
}

export default function NutzerverwaltungPage() {
  const [nutzer, setNutzer] = useState<Nutzer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [einladenOffen, setEinladenOffen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch("/api/systemadministration/nutzer")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Fehler beim Laden.");
        setNutzer(json.nutzer || []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  async function rolleZuweisen(userId: string, roleId: string) {
    setBusyId(userId);
    try {
      const r = await fetch(`/api/systemadministration/nutzer/${userId}/rollen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Fehler");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function rolleEntfernen(userId: string, roleId: string) {
    setBusyId(userId);
    try {
      const r = await fetch(`/api/systemadministration/nutzer/${userId}/rollen/${roleId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Fehler");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAktiv(userId: string, aktiv: boolean) {
    setBusyId(userId);
    try {
      const r = await fetch(`/api/systemadministration/nutzer/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktiv }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Fehler");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Shield size={22} className="text-primary" />
            Nutzerverwaltung
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Benutzer, Rollen und Zugriff — §3 des Pflichtenhefts.
          </p>
        </div>
        <button
          onClick={() => setEinladenOffen(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <UserPlus size={16} />
          Nutzer einladen
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : nutzer.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Nutzer. Lade den ersten über &bdquo;Nutzer einladen&ldquo; ein.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name / E-Mail</th>
                <th className="px-4 py-2 font-medium">Rollen</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {nutzer.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{n.displayName || n.email}</div>
                    <div className="text-xs text-muted-foreground">{n.email}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {n.rollen.map((r) => (
                        <span
                          key={r}
                          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {ROLE_LABELS[r] || r}
                          <button
                            onClick={() => rolleEntfernen(n.id, r)}
                            disabled={busyId === n.id}
                            className="text-primary/60 hover:text-primary"
                            title="Rolle entfernen"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      <select
                        defaultValue=""
                        disabled={busyId === n.id}
                        onChange={(e) => {
                          if (e.target.value) rolleZuweisen(n.id, e.target.value);
                          e.target.value = "";
                        }}
                        className="rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        <option value="">+ Rolle</option>
                        {ROLE_IDS.filter((r) => !n.rollen.includes(r)).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      onClick={() => toggleAktiv(n.id, !n.aktiv)}
                      disabled={busyId === n.id}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        n.aktiv
                          ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : "bg-[var(--danger-bg)] text-[var(--destructive)]"
                      }`}
                    >
                      {n.aktiv ? "Aktiv" : "Deaktiviert"}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {einladenOffen && (
        <EinladenModal
          onClose={() => setEinladenOffen(false)}
          onDone={() => {
            setEinladenOffen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EinladenModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [rolleId, setRolleId] = useState("lesebrechtigte");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch("/api/systemadministration/nutzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rolleId }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Einladen fehlgeschlagen.");
      onDone();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nutzer einladen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">E-Mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="name@organisation.de"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Startrolle</label>
          <select
            value={rolleId}
            onChange={(e) => setRolleId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Weitere Rollen können nach der Einladung ergänzt werden.
          </p>
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
          {busy ? "Sende Einladung …" : "Einladen"}
        </button>
      </form>
    </Modal>
  );
}
