"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  Investor,
  InvestorAnschreiben,
  InvestorStatus,
  InvestorStrategieBericht,
  INVESTOR_STATUS_LABEL,
} from "@/lib/types";
import { INVESTOR_KRITERIEN } from "@/lib/investoren";

type Tab = "stammdaten" | "strategie" | "anschreiben";

const STATUS_FARBE: Record<InvestorStatus, string> = {
  vorschlag: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  freigegeben: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  kontaktiert: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_gespraech: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  abgelehnt: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export default function InvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("stammdaten");
  const [notizen, setNotizen] = useState("");
  const [savingNotizen, setSavingNotizen] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/investoren/${id}`)
      .then((r) => r.json())
      .then((json) => {
        setInvestor(json.investor || null);
        setNotizen(json.investor?.notizen || "");
      })
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  const setStatus = async (status: InvestorStatus) => {
    await fetch(`/api/investoren/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  };

  const notizenSpeichern = async () => {
    setSavingNotizen(true);
    try {
      await fetch(`/api/investoren/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notizen }),
      });
      refresh();
    } finally {
      setSavingNotizen(false);
    }
  };

  const loeschen = async () => {
    if (!confirm(`Investor „${investor?.firma}" wirklich endgültig löschen?`)) return;
    await fetch(`/api/investoren/${id}`, { method: "DELETE" });
    router.push("/investoren");
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Lade …</div>;
  if (!investor) return <div className="p-6 text-sm text-muted-foreground">Investor nicht gefunden.</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <Link href="/investoren" className="mb-3 inline-block text-xs text-primary hover:underline">
        ← Zurück zur Übersicht
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{investor.firma}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_FARBE[investor.status]}`}>
              {INVESTOR_STATUS_LABEL[investor.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {investor.land}
            {investor.hub ? ` · ${investor.hub}` : ""}
            {typeof investor.score === "number" ? ` · Score ${investor.score}/10` : ""}
            {" · "}Angelegt {formatDate(investor.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {investor.status !== "freigegeben" && (
            <button
              onClick={() => setStatus("freigegeben")}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              ✓ Freigeben
            </button>
          )}
          {investor.status !== "abgelehnt" && (
            <button
              onClick={() => setStatus("abgelehnt")}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Ablehnen
            </button>
          )}
          {investor.status === "freigegeben" && (
            <button
              onClick={() => setStatus("kontaktiert")}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Als kontaktiert markieren
            </button>
          )}
          <button
            onClick={loeschen}
            className="rounded-md border border-[var(--destructive)] px-3 py-1.5 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
          >
            Löschen
          </button>
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        {(
          [
            ["stammdaten", "Stammdaten"],
            ["strategie", "Strategie-Bericht"],
            ["anschreiben", "Anschreiben"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stammdaten" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-2">
            <Feld label="Ansprechpartner" wert={investor.ansprechpartnerName} zusatz={investor.ansprechpartnerRolle} />
            <Feld label="E-Mail" wert={investor.email} href={investor.email ? `mailto:${investor.email}` : undefined} />
            <Feld label="Telefon" wert={investor.telefon} />
            <Feld label="Webseite" wert={investor.webseite} href={investor.webseite} extern />
            <Feld label="LinkedIn" wert={investor.linkedinUrl} href={investor.linkedinUrl} extern />
            <Feld label="Xing" wert={investor.xingUrl} href={investor.xingUrl} extern />
            <Feld label="Ticketgröße" wert={investor.tickeGroesse} />
            <Feld label="Sprache" wert={investor.sprache} />
            <Feld label="Quelle" wert={investor.quelle} href={investor.quelle} extern zusatz={investor.quelleDatum} />
          </div>

          {investor.sektoren.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {investor.sektoren.map((s) => (
                <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}

          {investor.kurzprofil && (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Kurzprofil</p>
              <p className="whitespace-pre-wrap">{investor.kurzprofil}</p>
            </div>
          )}

          {investor.kriterienErgebnis && investor.kriterienErgebnis.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Kriterien-Bewertung ({investor.kriterienErgebnis.filter((k) => k.erfuellt).length}/10 erfüllt)
              </p>
              <ul className="space-y-1.5">
                {investor.kriterienErgebnis.map((erg) => {
                  const def = INVESTOR_KRITERIEN.find((k) => k.id === erg.kriteriumId);
                  return (
                    <li key={erg.kriteriumId} className="flex gap-2 text-xs">
                      <span className={erg.erfuellt ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                        {erg.erfuellt ? "✓" : "✗"}
                      </span>
                      <span>
                        <span className="font-medium">{def?.label || erg.kriteriumId}</span>
                        {erg.begruendung && <span className="text-muted-foreground"> — {erg.begruendung}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Notizen</p>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Interne Notizen zu diesem Investor …"
            />
            <button
              onClick={notizenSpeichern}
              disabled={savingNotizen}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingNotizen ? "Speichere…" : "Notizen speichern"}
            </button>
          </div>
        </div>
      )}

      {tab === "strategie" && <StrategieTab investorId={id} />}
      {tab === "anschreiben" && <AnschreibenTab investorId={id} />}
    </div>
  );
}

function Feld({
  label,
  wert,
  zusatz,
  href,
  extern,
}: {
  label: string;
  wert?: string;
  zusatz?: string;
  href?: string;
  extern?: boolean;
}) {
  if (!wert) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {href ? (
        <a
          href={href}
          target={extern ? "_blank" : undefined}
          rel={extern ? "noreferrer" : undefined}
          className="text-primary hover:underline"
        >
          {wert}
        </a>
      ) : (
        <p>{wert}</p>
      )}
      {zusatz && <p className="text-xs text-muted-foreground">{zusatz}</p>}
    </div>
  );
}

function StrategieTab({ investorId }: { investorId: string }) {
  const [berichte, setBerichte] = useState<InvestorStrategieBericht[]>([]);
  const [loading, setLoading] = useState(true);
  const [generiere, setGeneriere] = useState(false);
  const [ziele, setZiele] = useState("");
  const [offen, setOffen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/investoren/${investorId}/strategie`)
      .then((r) => r.json())
      .then((json) => setBerichte(json.berichte || []))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [investorId]);

  const generieren = async () => {
    setGeneriere(true);
    setError(null);
    try {
      const res = await fetch(`/api/investoren/${investorId}/strategie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wirtschaftlicheZiele: ziele || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Generierung fehlgeschlagen");
        return;
      }
      setOffen(json.bericht.id);
      refresh();
    } finally {
      setGeneriere(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Neuen Strategie-Bericht generieren (mind. 20 individuelle Strategiepunkte)
        </p>
        <textarea
          value={ziele}
          onChange={(e) => setZiele(e.target.value)}
          rows={2}
          placeholder="Optional: deine wirtschaftlichen Ziele/Kontext für diesen Bericht (z.B. 'Wachstumskapital für internationale Skalierung' oder 'Offen für vollständige Übernahme')"
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        {error && <p className="mt-2 text-xs text-[var(--destructive)]">⚠️ {error}</p>}
        <button
          onClick={generieren}
          disabled={generiere}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {generiere ? "Generiere… (kann etwas dauern)" : "🧠 Strategie-Bericht generieren"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : berichte.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Strategie-Bericht erstellt.</p>
      ) : (
        <div className="space-y-2">
          {berichte.map((b) => (
            <div key={b.id} className="rounded-lg border border-border bg-card p-4 text-sm">
              <button
                onClick={() => setOffen(offen === b.id ? null : b.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="font-medium">
                  Bericht vom {formatDate(b.createdAt)} · {b.punkte.length} Strategiepunkte
                </span>
                <span className="text-xs text-muted-foreground">{offen === b.id ? "▲" : "▼"}</span>
              </button>
              {offen === b.id && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">{b.zusammenfassung}</p>
                  <ol className="space-y-2">
                    {b.punkte.map((p, i) => (
                      <li key={i} className="text-xs">
                        <span className="font-medium">
                          {i + 1}. {p.titel}
                        </span>
                        <p className="text-muted-foreground">{p.beschreibung}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnschreibenTab({ investorId }: { investorId: string }) {
  const [liste, setListe] = useState<InvestorAnschreiben[]>([]);
  const [loading, setLoading] = useState(true);
  const [generiere, setGeneriere] = useState(false);
  const [philosophie, setPhilosophie] = useState("");
  const [anlass, setAnlass] = useState("");
  const [offen, setOffen] = useState<string | null>(null);
  const [bearbeitungsText, setBearbeitungsText] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/investoren/${investorId}/anschreiben`)
      .then((r) => r.json())
      .then((json) => setListe(json.anschreiben || []))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [investorId]);

  const generieren = async () => {
    setGeneriere(true);
    setError(null);
    try {
      const res = await fetch(`/api/investoren/${investorId}/anschreiben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ philosophie: philosophie || undefined, anlass: anlass || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Generierung fehlgeschlagen");
        return;
      }
      setOffen(json.anschreiben.id);
      refresh();
    } finally {
      setGeneriere(false);
    }
  };

  const textSpeichern = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/investoren/anschreiben/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bearbeitungsText[id] }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const fertigstellen = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/investoren/anschreiben/${id}/fertigstellen`, { method: "POST" });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Neues Anschreiben generieren — Vorstellung von Person, Philosophie und App, Offenheit für
          Zusammenarbeit, Kaufangebote oder Stellenangebote
        </p>
        <textarea
          value={philosophie}
          onChange={(e) => setPhilosophie(e.target.value)}
          rows={2}
          placeholder="Optional: individuelle Philosophie/Botschaft statt Standardtext"
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          value={anlass}
          onChange={(e) => setAnlass(e.target.value)}
          placeholder="Optional: konkreter Anlass (Standard: Erstansprache)"
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        {error && <p className="mt-2 text-xs text-[var(--destructive)]">⚠️ {error}</p>}
        <button
          onClick={generieren}
          disabled={generiere}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {generiere ? "Generiere…" : "✍️ Anschreiben generieren"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : liste.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Anschreiben erstellt.</p>
      ) : (
        <div className="space-y-2">
          {liste.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-4 text-sm">
              <button
                onClick={() => {
                  setOffen(offen === a.id ? null : a.id);
                  if (bearbeitungsText[a.id] === undefined) {
                    setBearbeitungsText((prev) => ({ ...prev, [a.id]: a.text }));
                  }
                }}
                className="flex w-full items-center justify-between text-left"
              >
                <span>
                  <span className="font-medium">{a.betreff}</span>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {a.status}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{offen === a.id ? "▲" : "▼"}</span>
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground">Erstellt: {formatDate(a.createdAt)}</p>

              {offen === a.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={bearbeitungsText[a.id] ?? a.text}
                    onChange={(e) => setBearbeitungsText((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    rows={14}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => textSpeichern(a.id)}
                      disabled={busyId === a.id}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      Änderungen speichern
                    </button>
                    <button
                      onClick={() => fertigstellen(a.id)}
                      disabled={busyId === a.id}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      📄 Als PDF fertigstellen (Corporate Design)
                    </button>
                    {a.finalStoredFileName && (
                      <a
                        href={`/api/files/${a.finalStoredFileName}?mime=application/pdf&name=${encodeURIComponent(
                          a.finalDateiName || "Anschreiben.pdf"
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        ⬇️ PDF herunterladen
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
