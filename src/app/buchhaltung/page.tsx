"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  Abrechnungskreis,
  AbrechnungskreisSplitErgebnis,
  AUSGABE_KATEGORIEN,
  Buchung,
  BuchhaltungsUebersicht,
  BuchungsTyp,
  EINNAHME_KATEGORIEN,
  Konto,
  KontoArt,
  KontoKategorie,
  Umlageschluessel,
  UMLAGESCHLUESSEL_LABEL,
} from "@/lib/types";

interface LiegenschaftOption {
  id: string;
  name: string;
}

const KONTO_KATEGORIEN: Record<KontoArt, KontoKategorie[]> = {
  Aktiva: ["Anlagevermögen", "Umlaufvermögen", "Liquide Mittel"],
  Passiva: ["Eigenkapital", "Verbindlichkeiten", "Rückstellungen"],
};

type Tab = "journal" | "bilanz" | "kreise";

export default function BuchhaltungPage() {
  const [tab, setTab] = useState<Tab>("journal");
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [konten, setKonten] = useState<Konto[]>([]);
  const [kreise, setKreise] = useState<Abrechnungskreis[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<LiegenschaftOption[]>([]);
  const [uebersicht, setUebersicht] = useState<BuchhaltungsUebersicht | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/buchhaltung/buchungen").then((r) => r.json()),
      fetch("/api/buchhaltung/konten").then((r) => r.json()),
      fetch("/api/buchhaltung/uebersicht").then((r) => r.json()),
      fetch("/api/buchhaltung/abrechnungskreise").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ]).then(([b, k, u, ak, lg]) => {
      setBuchungen(b.buchungen || []);
      setKonten(k.konten || []);
      setUebersicht(u.uebersicht || null);
      setKreise(ak.kreise || []);
      setLiegenschaften((lg.liegenschaften || []).map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));
      setLoading(false);
    });
  };

  useEffect(refresh, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-bold">🧮 Buchhaltung</h1>
        <p className="text-sm text-muted-foreground">
          Einnahmen, Ausgaben und Bilanz an einem Ort — Grundlage für die Unternehmenskennzahlen im
          Dashboard. Jede Buchung braucht einen Beleg; Kosten können direkt beim Buchen über einen
          Abrechnungskreis auf einzelne Mieter umgelegt werden.
        </p>
      </div>

      <KpiRow uebersicht={uebersicht} loading={loading} />

      <div className="mb-4 flex gap-2 border-b border-border text-sm">
        {(
          [
            { key: "journal", label: "Einnahmen & Ausgaben" },
            { key: "bilanz", label: "Bilanz" },
            { key: "kreise", label: "Abrechnungskreise" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 font-medium",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "journal" ? (
        <JournalTab
          buchungen={buchungen}
          kreise={kreise}
          liegenschaften={liegenschaften}
          loading={loading}
          onChanged={refresh}
        />
      ) : tab === "bilanz" ? (
        <BilanzTab konten={konten} uebersicht={uebersicht} loading={loading} onChanged={refresh} />
      ) : (
        <AbrechnungskreiseTab kreise={kreise} liegenschaften={liegenschaften} loading={loading} onChanged={refresh} />
      )}
    </div>
  );
}

function KpiRow({ uebersicht, loading }: { uebersicht: BuchhaltungsUebersicht | null; loading: boolean }) {
  const cards = [
    { label: "Einnahmen", value: uebersicht?.einnahmen ?? 0, tone: "success" as const },
    { label: "Ausgaben", value: uebersicht?.ausgaben ?? 0, tone: "destructive" as const },
    { label: "Gewinn", value: uebersicht?.gewinn ?? 0, tone: (uebersicht?.gewinn ?? 0) >= 0 ? "success" as const : "destructive" as const },
    {
      label: "Bilanzsumme (Aktiva)",
      value: uebersicht?.bilanz.summeAktiva ?? 0,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div
            className={cn(
              "mt-1 text-lg font-bold tabular-nums",
              c.tone === "success" && "text-[var(--success)]",
              c.tone === "destructive" && "text-[var(--destructive)]"
            )}
          >
            {loading ? "…" : formatCurrency(c.value)}
          </div>
        </div>
      ))}
      {uebersicht && !uebersicht.bilanz.imGleichgewicht && (
        <div className="col-span-2 rounded-lg border border-[var(--destructive)] bg-[var(--destructive-bg,transparent)] p-3 text-xs text-[var(--destructive)] sm:col-span-4">
          ⚠️ Aktiva ({formatCurrency(uebersicht.bilanz.summeAktiva)}) und Passiva (
          {formatCurrency(uebersicht.bilanz.summePassiva)}) sind nicht im Gleichgewicht — Bilanz
          bitte prüfen.
        </div>
      )}
    </div>
  );
}

function JournalTab({
  buchungen,
  kreise,
  liegenschaften,
  loading,
  onChanged,
}: {
  buchungen: Buchung[];
  kreise: Abrechnungskreis[];
  liegenschaften: LiegenschaftOption[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [typ, setTyp] = useState<BuchungsTyp>("Einnahme");
  const [kategorie, setKategorie] = useState<string>(EINNAHME_KATEGORIEN[0]);
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [beschreibung, setBeschreibung] = useState("");
  const [belegFreitext, setBelegFreitext] = useState("");
  const [liegenschaftId, setLiegenschaftId] = useState("");
  const [abrechnungskreisId, setAbrechnungskreisId] = useState("");
  const [split, setSplit] = useState<AbrechnungskreisSplitErgebnis | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const kategorien = typ === "Einnahme" ? EINNAHME_KATEGORIEN : AUSGABE_KATEGORIEN;

  const ladeVorschau = async () => {
    const betragNum = parseFloat(betrag.replace(",", "."));
    if (!abrechnungskreisId || !liegenschaftId || !betragNum) {
      setSplit(null);
      return;
    }
    setSplitLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/abrechnungskreise/vorschau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abrechnungskreisId, liegenschaftId, betrag: betragNum }),
      });
      const data = await res.json();
      setSplit(data.split || null);
    } finally {
      setSplitLoading(false);
    }
  };

  const create = async () => {
    const betragNum = parseFloat(betrag.replace(",", "."));
    if (!betragNum || betragNum <= 0) return;
    if (!belegFreitext.trim()) {
      setFehler("Keine Buchung ohne Beleg — bitte eine Belegreferenz angeben (z.B. Rechnungsnummer, Kaufvertrag-Notiz).");
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const res = await fetch("/api/buchhaltung/buchungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typ,
          kategorie,
          betrag: betragNum,
          datum: new Date(datum).toISOString(),
          beschreibung: beschreibung || undefined,
          belegFreitext,
          liegenschaftId: liegenschaftId || undefined,
          abrechnungskreisId: abrechnungskreisId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFehler(data.error || "Buchung konnte nicht angelegt werden.");
        return;
      }
      setBetrag("");
      setBeschreibung("");
      setBelegFreitext("");
      setAbrechnungskreisId("");
      setSplit(null);
      setShowForm(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const stornieren = async (id: string) => {
    await fetch(`/api/buchhaltung/buchungen/${id}/stornieren`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    onChanged();
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          {showForm ? "Abbrechen" : "＋ Buchung erfassen"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            <select
              value={typ}
              onChange={(e) => {
                const t = e.target.value as BuchungsTyp;
                setTyp(t);
                setKategorie(t === "Einnahme" ? EINNAHME_KATEGORIEN[0] : AUSGABE_KATEGORIEN[0]);
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="Einnahme">Einnahme</option>
              <option value="Ausgabe">Ausgabe</option>
            </select>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {kategorien.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              onBlur={ladeVorschau}
              placeholder="Betrag in €"
              inputMode="decimal"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Beschreibung (optional)"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={belegFreitext}
              onChange={(e) => setBelegFreitext(e.target.value)}
              placeholder="Beleg (Pflicht) — z.B. Rechnungs-Nr. oder Kaufvertrag-Notiz"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
            />
            <select
              value={liegenschaftId}
              onChange={(e) => {
                setLiegenschaftId(e.target.value);
                setSplit(null);
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Liegenschaft (für Umlage)</option>
              {liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={abrechnungskreisId}
              onChange={(e) => {
                setAbrechnungskreisId(e.target.value);
                setSplit(null);
              }}
              disabled={!liegenschaftId}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50 sm:col-span-2"
            >
              <option value="">Keine Umlage (volle Kosten als Buchung)</option>
              {kreise.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <button
              onClick={ladeVorschau}
              disabled={!abrechnungskreisId || !liegenschaftId || !betrag || splitLoading}
              className="rounded-md border border-border px-2 py-1.5 text-sm disabled:opacity-50"
            >
              {splitLoading ? "Berechne…" : "Aufteilung anzeigen"}
            </button>
          </div>

          {split && (
            <div className="rounded-lg border border-border bg-background p-2.5 text-xs">
              <div className="mb-1 font-medium">
                Aufteilung auf {split.positionen.length} Mieter (Summe {formatCurrency(split.summeVerteilt)})
              </div>
              <div className="space-y-0.5">
                {split.positionen.map((p) => (
                  <div key={p.wohnungId} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {p.wohnungBezeichnung} · {p.mieterName}
                    </span>
                    <span className="tabular-nums">{formatCurrency(p.betrag)}</span>
                  </div>
                ))}
              </div>
              {split.nichtZugeordneteWohnungen.length > 0 && (
                <div className="mt-1 text-[var(--destructive)]">
                  ⚠️ Ohne Zuordnung: {split.nichtZugeordneteWohnungen.join(", ")}
                </div>
              )}
            </div>
          )}

          {fehler && (
            <div className="rounded-lg border border-[var(--destructive)] p-2 text-xs text-[var(--destructive)]">
              {fehler}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={busy || !betrag || !belegFreitext.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Buchen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : buchungen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Buchungen erfasst. Lege oben die erste Einnahme oder Ausgabe an.
        </p>
      ) : (
        <div className="space-y-1.5">
          {buchungen.map((b) => (
            <div
              key={b.id}
              className={cn(
                "rounded-lg border border-border bg-card px-4 py-2.5 text-sm",
                b.storniert && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                      b.typ === "Einnahme"
                        ? "bg-[var(--success-bg)] text-[var(--success)]"
                        : "bg-[var(--destructive-bg,transparent)] text-[var(--destructive)]"
                    )}
                  >
                    {b.typ}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {b.kategorie}
                      {b.istStornoBuchung && <span className="ml-1.5 text-[10px] text-muted-foreground">(Storno)</span>}
                      {b.storniert && <span className="ml-1.5 text-[10px] text-[var(--destructive)]">storniert</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(b.datum)}
                      {b.beschreibung ? ` · ${b.beschreibung}` : ""}
                      {b.belegFreitext ? ` · Beleg: ${b.belegFreitext}` : ""}
                      {b.aufteilung ? ` · umgelegt auf ${b.aufteilung.length} Mieter` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      b.typ === "Einnahme" ? "text-[var(--success)]" : "text-[var(--destructive)]"
                    )}
                  >
                    {b.typ === "Einnahme" ? "+" : "−"}
                    {formatCurrency(b.betrag)}
                  </span>
                  {!b.storniert && !b.istStornoBuchung && (
                    <button
                      onClick={() => stornieren(b.id)}
                      className="text-xs text-muted-foreground hover:text-[var(--destructive)]"
                      title="Buchung stornieren (Gegenbuchung)"
                    >
                      Stornieren
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BilanzTab({
  konten,
  uebersicht,
  loading,
  onChanged,
}: {
  konten: Konto[];
  uebersicht: BuchhaltungsUebersicht | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [art, setArt] = useState<KontoArt>("Aktiva");
  const [kategorie, setKategorie] = useState<KontoKategorie>(KONTO_KATEGORIEN.Aktiva[0]);
  const [saldo, setSaldo] = useState("");
  const [busy, setBusy] = useState(false);

  const aktiva = useMemo(() => konten.filter((k) => k.art === "Aktiva"), [konten]);
  const passiva = useMemo(() => konten.filter((k) => k.art === "Passiva"), [konten]);

  const seed = async () => {
    setBusy(true);
    try {
      await fetch("/api/buchhaltung/konten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/buchhaltung/konten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          art,
          kategorie,
          saldo: parseFloat(saldo.replace(",", ".")) || 0,
        }),
      });
      setName("");
      setSaldo("");
      setShowForm(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const updateSaldo = async (id: string, saldoNeu: number) => {
    await fetch(`/api/buchhaltung/konten/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saldo: saldoNeu }),
    });
    onChanged();
  };

  const remove = async (id: string) => {
    await fetch(`/api/buchhaltung/konten/${id}`, { method: "DELETE" });
    onChanged();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Lade…</p>;

  if (konten.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          Noch keine Konten angelegt. Starte mit einem einfachen Standard-Kontenrahmen (Bankguthaben,
          Forderungen, Eigenkapital, Verbindlichkeiten …) und passe ihn danach an.
        </p>
        <button
          onClick={seed}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Standard-Kontenrahmen anlegen
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          {showForm ? "Abbrechen" : "＋ Konto anlegen"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kontoname"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
          />
          <select
            value={art}
            onChange={(e) => {
              const a = e.target.value as KontoArt;
              setArt(a);
              setKategorie(KONTO_KATEGORIEN[a][0]);
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="Aktiva">Aktiva</option>
            <option value="Passiva">Passiva</option>
          </select>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value as KontoKategorie)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            {KONTO_KATEGORIEN[art].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            placeholder="Saldo in €"
            inputMode="decimal"
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            onClick={create}
            disabled={busy || !name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:col-span-1"
          >
            Anlegen
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KontenSpalte
          titel="Aktiva"
          konten={aktiva}
          summe={uebersicht?.bilanz.summeAktiva ?? 0}
          onUpdateSaldo={updateSaldo}
          onRemove={remove}
        />
        <KontenSpalte
          titel="Passiva"
          konten={passiva}
          summe={uebersicht?.bilanz.summePassiva ?? 0}
          onUpdateSaldo={updateSaldo}
          onRemove={remove}
        />
      </div>
    </div>
  );
}

function AbrechnungskreiseTab({
  kreise,
  liegenschaften,
  loading,
  onChanged,
}: {
  kreise: Abrechnungskreis[];
  liegenschaften: LiegenschaftOption[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [umlageschluessel, setUmlageschluessel] = useState<Umlageschluessel>("Wohnflaeche");
  const [liegenschaftId, setLiegenschaftId] = useState("");
  const [wohnungen, setWohnungen] = useState<{ id: string; bezeichnung: string }[]>([]);
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const standard = useMemo(() => kreise.filter((k) => k.istStandard), [kreise]);
  const individuell = useMemo(() => kreise.filter((k) => !k.istStandard), [kreise]);

  const seed = async () => {
    setBusy(true);
    try {
      await fetch("/api/buchhaltung/abrechnungskreise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const ladeWohnungen = async (lgId: string) => {
    setLiegenschaftId(lgId);
    setAusgewaehlt(new Set());
    if (!lgId) {
      setWohnungen([]);
      return;
    }
    const gebRes = await fetch(`/api/gebaeude?liegenschaftId=${lgId}`).then((r) => r.json());
    const gebIds: string[] = (gebRes.gebaeude || []).map((g: { id: string }) => g.id);
    const alleWohnungen: { id: string; bezeichnung: string }[] = [];
    for (const gid of gebIds) {
      const wRes = await fetch(`/api/wohnungen?gebaeudeId=${gid}`).then((r) => r.json());
      for (const w of wRes.wohnungen || []) {
        alleWohnungen.push({ id: w.id, bezeichnung: w.bezeichnung || w.nummer || w.id });
      }
    }
    setWohnungen(alleWohnungen);
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/buchhaltung/abrechnungskreise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          beschreibung: beschreibung || undefined,
          umlageschluessel,
          liegenschaftId: liegenschaftId || undefined,
          wohnungIds: ausgewaehlt.size > 0 ? [...ausgewaehlt] : undefined,
        }),
      });
      setName("");
      setBeschreibung("");
      setLiegenschaftId("");
      setWohnungen([]);
      setAusgewaehlt(new Set());
      setShowForm(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/buchhaltung/abrechnungskreise/${id}`, { method: "DELETE" });
    onChanged();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Lade…</p>;

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        Abrechnungskreise legen fest, wie Kosten beim Buchen auf Mieter umgelegt werden. Der
        Standardkatalog gilt liegenschaftsübergreifend für alle Wohnungen; individuelle Kreise
        (z.B. „nur Erdgeschoss&rdquo;) lassen sich auf konkrete Wohnungen einschränken.
      </p>

      {standard.length === 0 && (
        <button
          onClick={seed}
          disabled={busy}
          className="mb-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Standard-Abrechnungskreiskatalog anwenden
        </button>
      )}

      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
        >
          {showForm ? "Abbrechen" : "＋ Individuellen Kreis anlegen"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, z.B. 'Nur Erdgeschoss'"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <select
              value={umlageschluessel}
              onChange={(e) => setUmlageschluessel(e.target.value as Umlageschluessel)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {(Object.keys(UMLAGESCHLUESSEL_LABEL) as Umlageschluessel[]).map((u) => (
                <option key={u} value={u}>
                  {UMLAGESCHLUESSEL_LABEL[u]}
                </option>
              ))}
            </select>
            <select
              value={liegenschaftId}
              onChange={(e) => ladeWohnungen(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Liegenschaft wählen…</option>
              {liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <input
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Beschreibung (optional)"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />

          {wohnungen.length > 0 && (
            <div className="rounded-lg border border-border p-2">
              <div className="mb-1 text-xs text-muted-foreground">
                Betroffene Wohnungen wählen (leer = alle Wohnungen dieser Liegenschaft):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {wohnungen.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() =>
                      setAusgewaehlt((prev) => {
                        const next = new Set(prev);
                        if (next.has(w.id)) next.delete(w.id);
                        else next.add(w.id);
                        return next;
                      })
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      ausgewaehlt.has(w.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {w.bezeichnung}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={busy || !name.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Anlegen
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">Standardkatalog</div>
          {standard.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Noch nicht angewendet.</p>
          ) : (
            <div className="divide-y divide-border">
              {standard.map((k) => (
                <div key={k.id} className="p-3 text-sm">
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground">{k.beschreibung}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">Individuelle Kreise</div>
          {individuell.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Noch keine individuellen Kreise angelegt.</p>
          ) : (
            <div className="divide-y divide-border">
              {individuell.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{k.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {UMLAGESCHLUESSEL_LABEL[k.umlageschluessel]}
                      {k.wohnungIds ? ` · ${k.wohnungIds.length} Wohnung(en)` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(k.id)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-[var(--destructive)]"
                    title="Kreis löschen"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KontenSpalte({
  titel,
  konten,
  summe,
  onUpdateSaldo,
  onRemove,
}: {
  titel: string;
  konten: Konto[];
  summe: number;
  onUpdateSaldo: (id: string, saldo: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-semibold">{titel}</h2>
        <span className="text-sm font-bold tabular-nums">{formatCurrency(summe)}</span>
      </div>
      {konten.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">Keine Konten dieser Art.</p>
      ) : (
        <div className="divide-y divide-border">
          {konten.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{k.name}</div>
                <div className="truncate text-xs text-muted-foreground">{k.kategorie}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  defaultValue={k.saldo}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    if (!Number.isNaN(v) && v !== k.saldo) onUpdateSaldo(k.id, v);
                  }}
                  inputMode="decimal"
                  className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
                />
                <button
                  onClick={() => onRemove(k.id)}
                  className="text-xs text-muted-foreground hover:text-[var(--destructive)]"
                  title="Konto löschen"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
