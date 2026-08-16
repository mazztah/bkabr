"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/utils";
import {
  Investor,
  InvestorAnschreiben,
  InvestorStatus,
  InvestorStrategieBericht,
  InvestorStrategiePunkt,
  INVESTOR_STATUS_LABEL,
} from "@/lib/types";
import { INVESTOR_KRITERIEN } from "@/lib/investoren";

type BuiltinTab = "stammdaten" | "projekte" | "kennzahlen" | "berichte" | "dokumente" | "strategie" | "anschreiben";
/** "custom:<id>" adressiert einen frei vom Nutzer angelegten Zusatz-Tab (investor.customTabs) */
type Tab = BuiltinTab | `custom:${string}`;

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

  const neuenTabAnlegen = async () => {
    const titel = window.prompt("Titel des neuen Tabs (z.B. „Due-Diligence-Notizen“):");
    if (!titel || !titel.trim()) return;
    const neu = {
      id: crypto.randomUUID(),
      titel: titel.trim(),
      inhalt: "",
      aktualisiertAm: new Date().toISOString(),
    };
    const res = await fetch(`/api/investoren/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customTabs: [...(investor?.customTabs || []), neu] }),
    });
    if (res.ok) {
      const json = await res.json();
      setInvestor(json.investor);
      setTab(`custom:${neu.id}`);
    }
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

      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-border">
        {(
          [
            ["stammdaten", "Stammdaten"],
            ["projekte", "Aktuelle Projekte"],
            ["kennzahlen", "Unternehmenskennzahlen"],
            ["berichte", "Wirtschaftsberichte"],
            ["dokumente", "Dokumente"],
            ["strategie", "Strategie-Bericht"],
            ["anschreiben", "Anschreiben"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {(investor.customTabs || []).map((ct) => (
          <button
            key={ct.id}
            onClick={() => setTab(`custom:${ct.id}`)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === `custom:${ct.id}`
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {ct.titel}
          </button>
        ))}
        <button
          onClick={neuenTabAnlegen}
          title="Neuen Tab anlegen"
          className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ＋ Tab
        </button>
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
            <Feld label="Unternehmensgröße" wert={investor.unternehmensgroesse} />
            <Feld label="Mitarbeiterzahl" wert={investor.mitarbeiterzahl} />
            <Feld label="Investiertes Kapital gesamt" wert={investor.investiertesKapitalGesamt} />
            <Feld label="Gegründet" wert={investor.gegruendet} />
            <Feld label="Adresse" wert={investor.adresse} />
            <Feld label="Quelle" wert={investor.quelle} href={investor.quelle} extern zusatz={investor.quelleDatum} />
          </div>

          {investor.partner && investor.partner.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Wichtige Partner / Beteiligungen</p>
              <div className="flex flex-wrap gap-1">
                {investor.partner.map((p, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

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

      {tab === "projekte" && <ProjekteTab investorId={id} investor={investor} onUpdate={setInvestor} />}
      {tab === "kennzahlen" && <KennzahlenTab investorId={id} investor={investor} onUpdate={setInvestor} />}
      {tab === "berichte" && <BerichteTab investorId={id} investor={investor} onUpdate={setInvestor} />}
      {tab === "dokumente" && <DokumenteTab investorId={id} investor={investor} onUpdate={setInvestor} />}
      {tab === "strategie" && <StrategieTab investorId={id} />}
      {tab === "anschreiben" && <AnschreibenTab investorId={id} />}
      {tab.startsWith("custom:") && (
        <CustomTabView
          investorId={id}
          investor={investor}
          tabId={tab.slice("custom:".length)}
          onUpdate={setInvestor}
          onDeleted={() => setTab("stammdaten")}
        />
      )}
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

async function patchInvestor(id: string, patch: Record<string, unknown>): Promise<Investor | null> {
  const res = await fetch(`/api/investoren/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.investor as Investor;
}

function ProjekteTab({
  investorId,
  investor,
  onUpdate,
}: {
  investorId: string;
  investor: Investor;
  onUpdate: (i: Investor) => void;
}) {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [status, setStatus] = useState("");
  const [jahr, setJahr] = useState("");
  const [busy, setBusy] = useState(false);
  const projekte = investor.aktuelleProjekte || [];

  const hinzufuegen = async () => {
    if (!titel.trim() || !beschreibung.trim()) return;
    setBusy(true);
    try {
      const neu = { titel: titel.trim(), beschreibung: beschreibung.trim(), status: status || undefined, jahr: jahr || undefined };
      const updated = await patchInvestor(investorId, { aktuelleProjekte: [...projekte, neu] });
      if (updated) {
        onUpdate(updated);
        setTitel("");
        setBeschreibung("");
        setStatus("");
        setJahr("");
      }
    } finally {
      setBusy(false);
    }
  };

  const entfernen = async (idx: number) => {
    const updated = await patchInvestor(investorId, { aktuelleProjekte: projekte.filter((_, i) => i !== idx) });
    if (updated) onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Projekt manuell hinzufügen</p>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="Titel"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Status (optional)"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={jahr}
              onChange={(e) => setJahr(e.target.value)}
              placeholder="Jahr (optional)"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <textarea
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          rows={2}
          placeholder="Beschreibung"
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={hinzufuegen}
          disabled={busy || !titel.trim() || !beschreibung.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          + Hinzufügen
        </button>
      </div>

      {projekte.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine aktuellen Projekte hinterlegt. Der Agent trägt hier bei „Stammdaten updaten" automatisch ein,
          was er recherchiert – oder leg selbst eines an.
        </p>
      ) : (
        <div className="space-y-2">
          {projekte.map((p, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">
                  {p.titel}
                  {p.jahr ? ` (${p.jahr})` : ""}
                  {p.status && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {p.status}
                    </span>
                  )}
                </p>
                <button onClick={() => entfernen(i)} className="shrink-0 text-xs text-muted-foreground hover:text-[var(--destructive)]">
                  ✕
                </button>
              </div>
              <p className="mt-1 text-muted-foreground">{p.beschreibung}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KennzahlenTab({
  investorId,
  investor,
  onUpdate,
}: {
  investorId: string;
  investor: Investor;
  onUpdate: (i: Investor) => void;
}) {
  const [label, setLabel] = useState("");
  const [wert, setWert] = useState("");
  const [jahr, setJahr] = useState("");
  const [busy, setBusy] = useState(false);
  const kennzahlen = investor.kennzahlen || [];

  const hinzufuegen = async () => {
    if (!label.trim() || !wert.trim()) return;
    setBusy(true);
    try {
      const neu = { label: label.trim(), wert: wert.trim(), jahr: jahr || undefined };
      const updated = await patchInvestor(investorId, { kennzahlen: [...kennzahlen, neu] });
      if (updated) {
        onUpdate(updated);
        setLabel("");
        setWert("");
        setJahr("");
      }
    } finally {
      setBusy(false);
    }
  };

  const entfernen = async (idx: number) => {
    const updated = await patchInvestor(investorId, { kennzahlen: kennzahlen.filter((_, i) => i !== idx) });
    if (updated) onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Kennzahl manuell hinzufügen</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="z.B. Umsatz, AUM, EBITDA"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
          />
          <input
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            placeholder="Wert"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            value={jahr}
            onChange={(e) => setJahr(e.target.value)}
            placeholder="Jahr (optional)"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={hinzufuegen}
          disabled={busy || !label.trim() || !wert.trim()}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          + Hinzufügen
        </button>
      </div>

      {kennzahlen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Unternehmenskennzahlen hinterlegt. Der Agent trägt hier bei „Stammdaten updaten" automatisch
          ein, was er recherchiert – oder leg selbst welche an.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {kennzahlen.map((k, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="bg-card px-4 py-2 font-medium">{k.label}</td>
                  <td className="bg-card px-4 py-2">{k.wert}</td>
                  <td className="bg-card px-4 py-2 text-xs text-muted-foreground">{k.jahr || ""}</td>
                  <td className="bg-card px-2 py-2 text-right">
                    <button onClick={() => entfernen(i)} className="text-xs text-muted-foreground hover:text-[var(--destructive)]">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BerichteTab({
  investorId,
  investor,
  onUpdate,
}: {
  investorId: string;
  investor: Investor;
  onUpdate: (i: Investor) => void;
}) {
  const [titel, setTitel] = useState("");
  const [zusammenfassung, setZusammenfassung] = useState("");
  const [jahr, setJahr] = useState("");
  const [quelle, setQuelle] = useState("");
  const [busy, setBusy] = useState(false);
  const berichte = investor.wirtschaftsberichte || [];

  const hinzufuegen = async () => {
    if (!titel.trim() || !zusammenfassung.trim()) return;
    setBusy(true);
    try {
      const neu = { titel: titel.trim(), zusammenfassung: zusammenfassung.trim(), jahr: jahr || undefined, quelle: quelle || undefined };
      const updated = await patchInvestor(investorId, { wirtschaftsberichte: [...berichte, neu] });
      if (updated) {
        onUpdate(updated);
        setTitel("");
        setZusammenfassung("");
        setJahr("");
        setQuelle("");
      }
    } finally {
      setBusy(false);
    }
  };

  const entfernen = async (idx: number) => {
    const updated = await patchInvestor(investorId, { wirtschaftsberichte: berichte.filter((_, i) => i !== idx) });
    if (updated) onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Wirtschaftsbericht manuell hinzufügen</p>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="Titel"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
          />
          <input
            value={jahr}
            onChange={(e) => setJahr(e.target.value)}
            placeholder="Jahr (optional)"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={zusammenfassung}
          onChange={(e) => setZusammenfassung(e.target.value)}
          rows={2}
          placeholder="Zusammenfassung"
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          value={quelle}
          onChange={(e) => setQuelle(e.target.value)}
          placeholder="Quelle/URL (optional)"
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={hinzufuegen}
          disabled={busy || !titel.trim() || !zusammenfassung.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          + Hinzufügen
        </button>
      </div>

      {berichte.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Wirtschaftsberichte hinterlegt. Der Agent trägt hier bei „Stammdaten updaten" automatisch ein,
          was er recherchiert – oder leg selbst einen an.
        </p>
      ) : (
        <div className="space-y-2">
          {berichte.map((b, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">
                  {b.titel}
                  {b.jahr ? ` (${b.jahr})` : ""}
                </p>
                <button onClick={() => entfernen(i)} className="shrink-0 text-xs text-muted-foreground hover:text-[var(--destructive)]">
                  ✕
                </button>
              </div>
              <p className="mt-1 text-muted-foreground">{b.zusammenfassung}</p>
              {b.quelle && (
                <a href={b.quelle} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                  Quelle ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DokumenteTab({
  investorId,
  investor,
  onUpdate,
}: {
  investorId: string;
  investor: Investor;
  onUpdate: (i: Investor) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dokumente = investor.dokumente || [];

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload fehlgeschlagen");
        return;
      }
      const neu = {
        id: crypto.randomUUID(),
        dateiName: json.dateiName,
        storedFileName: json.storedFileName,
        mimeType: json.mimeType,
        size: json.size,
        hochgeladenAm: new Date().toISOString(),
        hochgeladenVon: "user" as const,
      };
      const updated = await patchInvestor(investorId, { dokumente: [...dokumente, neu] });
      if (updated) onUpdate(updated);
    } finally {
      setUploading(false);
    }
  };

  const entfernen = async (id: string) => {
    const updated = await patchInvestor(investorId, { dokumente: dokumente.filter((d) => d.id !== id) });
    if (updated) onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Dokument hochladen (z.B. Präsentation, Geschäftsbericht, Vertragsentwurf) — auch der Agent kann hier per
          Chat-Auftrag Rechercheergebnisse ablegen.
        </p>
        <input
          type="file"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
          className="text-sm"
        />
        {uploading && <p className="mt-2 text-xs text-muted-foreground">Lade hoch …</p>}
        {error && <p className="mt-2 text-xs text-[var(--destructive)]">⚠️ {error}</p>}
      </div>

      {dokumente.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Dokumente hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {dokumente.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              <div>
                <a
                  href={`/api/files/${d.storedFileName}?mime=${encodeURIComponent(d.mimeType)}&name=${encodeURIComponent(d.dateiName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {d.dateiName}
                </a>
                <p className="text-xs text-muted-foreground">
                  {(d.size / 1024).toFixed(0)} KB · {formatDate(d.hochgeladenAm)} ·{" "}
                  {d.hochgeladenVon === "agent" ? "vom Agenten" : "manuell hochgeladen"}
                </p>
              </div>
              <button onClick={() => entfernen(d.id)} className="text-xs text-muted-foreground hover:text-[var(--destructive)]">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomTabView({
  investorId,
  investor,
  tabId,
  onUpdate,
  onDeleted,
}: {
  investorId: string;
  investor: Investor;
  tabId: string;
  onUpdate: (i: Investor) => void;
  onDeleted: () => void;
}) {
  const alle = investor.customTabs || [];
  const eintrag = alle.find((t) => t.id === tabId);
  const [inhalt, setInhalt] = useState(eintrag?.inhalt || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInhalt(eintrag?.inhalt || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  if (!eintrag) return <p className="text-sm text-muted-foreground">Tab nicht gefunden.</p>;

  const speichern = async () => {
    setBusy(true);
    try {
      const neueTabs = alle.map((t) => (t.id === tabId ? { ...t, inhalt, aktualisiertAm: new Date().toISOString() } : t));
      const updated = await patchInvestor(investorId, { customTabs: neueTabs });
      if (updated) onUpdate(updated);
    } finally {
      setBusy(false);
    }
  };

  const loeschen = async () => {
    if (!window.confirm(`Tab „${eintrag.titel}" wirklich löschen?`)) return;
    const neueTabs = alle.filter((t) => t.id !== tabId);
    const updated = await patchInvestor(investorId, { customTabs: neueTabs });
    if (updated) {
      onUpdate(updated);
      onDeleted();
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Zuletzt aktualisiert: {formatDate(eintrag.aktualisiertAm)}
          </p>
          <button onClick={loeschen} className="text-xs text-muted-foreground hover:text-[var(--destructive)]">
            Tab löschen
          </button>
        </div>
        <textarea
          value={inhalt}
          onChange={(e) => setInhalt(e.target.value)}
          rows={12}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          placeholder="Freitext für diesen Zusatz-Tab …"
        />
        <button
          onClick={speichern}
          disabled={busy}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Speichere…" : "Speichern"}
        </button>
      </div>
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

  const berichtAktualisiert = (aktualisiert: InvestorStrategieBericht) => {
    setBerichte((prev) => prev.map((b) => (b.id === aktualisiert.id ? aktualisiert : b)));
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

                  <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                    <span className="text-base leading-none">🤖</span>
                    <p>
                      Sagt dir diese Strategie so zu, oder soll ich noch etwas anpassen? Bei jedem Punkt unten kannst
                      du auf <span className="font-medium">„Optimieren"</span> klicken, deinen Änderungswunsch
                      eintragen (oder mich frei optimieren lassen) und die neue Fassung per{" "}
                      <span className="font-medium">„Übernehmen"</span> speichern. Über{" "}
                      <span className="font-medium">„Historie"</span> siehst du alle bisherigen Fassungen eines
                      Punktes.
                    </p>
                  </div>

                  <ol className="space-y-2">
                    {b.punkte.map((p, i) => (
                      <StrategiePunktZeile
                        key={p.id}
                        investorId={investorId}
                        berichtId={b.id}
                        punkt={p}
                        index={i}
                        onUpdated={berichtAktualisiert}
                      />
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

function StrategiePunktZeile({
  investorId,
  berichtId,
  punkt,
  index,
  onUpdated,
}: {
  investorId: string;
  berichtId: string;
  punkt: InvestorStrategiePunkt;
  index: number;
  onUpdated: (bericht: InvestorStrategieBericht) => void;
}) {
  const [optimierenOffen, setOptimierenOffen] = useState(false);
  const [wunsch, setWunsch] = useState("");
  const [vorschlag, setVorschlag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historieOffen, setHistorieOffen] = useState(false);

  const vonLlmOptimierenLassen = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/investoren/${investorId}/strategie/${berichtId}/punkte/${punkt.id}/optimieren`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wunsch }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Optimierung fehlgeschlagen");
        return;
      }
      setVorschlag(json.vorschlag);
    } finally {
      setBusy(false);
    }
  };

  const uebernehmen = async () => {
    if (!vorschlag) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/investoren/${investorId}/strategie/${berichtId}/punkte/${punkt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beschreibung: vorschlag, quelle: "ki-optimierung", hinweis: wunsch || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        onUpdated(json.bericht);
        setOptimierenOffen(false);
        setVorschlag(null);
        setWunsch("");
      } else {
        setError(json.error || "Speichern fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-border/60 p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-medium">
            {index + 1}. {punkt.titel}
          </span>
          <p className="text-xs text-muted-foreground">{punkt.beschreibung}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {punkt.historie && punkt.historie.length > 0 && (
            <button
              onClick={() => setHistorieOffen(true)}
              className="whitespace-nowrap rounded border border-border px-2 py-1 text-[10px] hover:bg-muted"
            >
              Historie ({punkt.historie.length})
            </button>
          )}
          <button
            onClick={() => setOptimierenOffen((v) => !v)}
            className="whitespace-nowrap rounded border border-border px-2 py-1 text-[10px] hover:bg-muted"
          >
            {optimierenOffen ? "Schließen" : "Optimieren"}
          </button>
        </div>
      </div>

      {optimierenOffen && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/40 p-2">
          <p className="flex items-start gap-1 text-[10px] font-medium text-muted-foreground">
            <span>🤖</span>
            <span>Was soll an diesem Punkt angepasst werden?</span>
          </p>
          <textarea
            value={wunsch}
            onChange={(e) => setWunsch(e.target.value)}
            rows={2}
            placeholder="Änderungswunsch eintragen – oder leer lassen und frei optimieren lassen"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          />
          {error && <p className="text-[10px] text-[var(--destructive)]">⚠️ {error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={vonLlmOptimierenLassen}
              disabled={busy}
              className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-50"
            >
              {busy && !vorschlag ? "Optimiere…" : "🧠 Vorschlag generieren"}
            </button>
          </div>
          {vorschlag && (
            <div className="mt-1 rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Vorschlag:</p>
              <p className="text-xs">{vorschlag}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={uebernehmen}
                  disabled={busy}
                  className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  ✓ Übernehmen
                </button>
                <button
                  onClick={() => setVorschlag(null)}
                  className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
                >
                  Verwerfen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {historieOffen && (
        <Modal title={`Historie: ${punkt.titel}`} onClose={() => setHistorieOffen(false)}>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {[...(punkt.historie || [])].reverse().map((v, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-xs">
                <p className="mb-1 text-[10px] text-muted-foreground">
                  {formatDate(v.aktualisiertAm)} · abgelöst durch{" "}
                  {v.quelle === "user" ? "manuelle Bearbeitung" : "KI-Optimierung"}
                  {v.hinweis ? ` (Wunsch: „${v.hinweis}")` : ""}
                </p>
                <p>{v.beschreibung}</p>
              </div>
            ))}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
              <p className="mb-1 text-[10px] text-muted-foreground">Aktuelle Fassung</p>
              <p>{punkt.beschreibung}</p>
            </div>
          </div>
        </Modal>
      )}
    </li>
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
