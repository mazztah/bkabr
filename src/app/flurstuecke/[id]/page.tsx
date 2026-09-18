"use client";

// ============================================================================
// Flurstücksakte — zentrale Detailansicht mit Reitern (Pflichtenheft §7).
//
//   1. Flurstück   — Bild/Karte, Lfd. Nr., Gemarkung, Flur, Flurstück,
//                     Wirtschaftsart, Lage, Größe (IMM-Pendant: LIE-001..003)
//   2. Grundbuch   — Abt. I Eigentum, Abt. II Rechte/Lasten, Abt. III
//                     Grundpfandrechte (LIE-006/007)
//   3. Verträge    — Vertragspartner, Präambel/Sachgegenstand, Laufzeit,
//                     Zins, Bedingungen, Termine, PDF (VERTR-001..009)
//   4. Flächen     — Gesamtfläche, nutzungsbezogene nutzungsart-Verträge
//                     (Jagd/Fischerei/Kleingarten/Wiese/...), Veranstaltungs-
//                     freigabe (LIE-009/010)
//   5. Dokumente   — direkte Anhänge + zugeordnete Ablage-Dokumente (DOK-001/002)
//   6. Kalender    — aus Vertragsfristen abgeleitete + liegenschaftsbezogene
//                     Termine (KAL-001/004)
//
// UC-01 aus dem Pflichtenheft (Abnahmekriterium) wird hiermit direkt bedient:
// „Benutzer sucht Flurstück → sieht Karte/Bild, Katasterdaten, Grundbuch,
//  Flächen, Verträge und Fristen → öffnet einen Vertrag als PDF.“
//
// Bewusst als erste Migration auf den „Premium-Design-Layer“ aus globals.css
// (GlassCard/PremiumButton/FadeUp/…) umgesetzt — additiv, siehe Kommentar
// dort: „Stück für Stück auf den neuen Look migrieren“.
// ============================================================================

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  BookOpen,
  FileSignature,
  Ruler,
  FileStack,
  CalendarDays,
  Plus,
  X,
  Trash2,
  Pencil,
  Check,
  Upload,
  ExternalLink,
  Image as ImageIcon,
  PartyPopper,
} from "lucide-react";
import Modal from "@/components/Modal";
import GlassCard from "@/components/ui/GlassCard";
import PremiumButton from "@/components/ui/PremiumButton";
import MicroBadge from "@/components/ui/MicroBadge";
import StatusBadge, { StatusBadgeStatus } from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import {
  Flurstueck,
  FlurstueckWirtschaftsart,
  Liegenschaft,
  GrundbuchEintrag,
  GrundbuchAbteilung,
  Vertrag,
  VertragArt,
  VertragStatus,
  PachtNutzungsart,
  Zahlungsintervall,
  AblageDokument,
  Anhang,
  AnhangTyp,
  AbgeleitetesKalenderEreignis,
  KalenderEreignis,
} from "@/lib/types";

type Tab = "flurstueck" | "grundbuch" | "vertraege" | "flaechen" | "dokumente" | "kalender";

const TABS: { key: Tab; label: string; icon: typeof MapPin }[] = [
  { key: "flurstueck", label: "Flurstück", icon: MapPin },
  { key: "grundbuch", label: "Grundbuch", icon: BookOpen },
  { key: "vertraege", label: "Verträge", icon: FileSignature },
  { key: "flaechen", label: "Flächen", icon: Ruler },
  { key: "dokumente", label: "Dokumente", icon: FileStack },
  { key: "kalender", label: "Kalender", icon: CalendarDays },
];

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

async function patchFlurstueck(id: string, patch: Record<string, unknown>): Promise<Flurstueck | null> {
  const res = await fetch(`/api/flurstuecke/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.flurstueck as Flurstueck;
}

export default function FlurstueckAktePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [flurstueck, setFlurstueck] = useState<Flurstueck | null>(null);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("flurstueck");
  const [busyDelete, setBusyDelete] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/flurstuecke/${id}`).then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      }),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ])
      .then(([f, l]) => {
        setFlurstueck(f.flurstueck);
        setLiegenschaften(l.liegenschaften || []);
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  const liegenschaft = liegenschaften.find((l) => l.id === flurstueck?.liegenschaftId);

  async function handleDelete() {
    if (!flurstueck) return;
    if (!confirm("Flurstück inkl. Verlinkung wirklich löschen? Grundbuch- und Vertragsdaten bleiben als eigene Datensätze erhalten.")) return;
    setBusyDelete(true);
    const r = await fetch(`/api/flurstuecke/${flurstueck.id}`, { method: "DELETE" });
    setBusyDelete(false);
    if (r.ok) router.push("/flurstuecke");
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Lädt Flurstücksakte …</div>;
  }
  if (notFound || !flurstueck) {
    return (
      <div className="p-6">
        <Link href="/flurstuecke" className="mb-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ArrowLeft size={13} /> Zurück zur Übersicht
        </Link>
        <p className="text-sm text-muted-foreground">Flurstück nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
      <Link href="/flurstuecke" className="mb-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ArrowLeft size={13} /> Zurück zur Übersicht
      </Link>

      {/* ---- Kopfbereich: Akten-Identität ---- */}
      <GlassCard hover={false} className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-white glow-ring-primary">
              <MapPin size={26} />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                {flurstueck.gemarkung} · Flur {flurstueck.flur} · Nr. {flurstueck.flurstueckNummer}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {liegenschaft ? liegenschaft.name : "Ohne Liegenschaftszuordnung"}
                {flurstueck.nummer ? ` · Akte ${flurstueck.nummer}` : ""} · angelegt {formatDate(flurstueck.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MicroBadge color="primary">{flurstueck.wirtschaftsart}</MicroBadge>
                {flurstueck.flaecheQm ? (
                  <MicroBadge color="accent">{flurstueck.flaecheQm.toLocaleString("de-DE")} m²</MicroBadge>
                ) : null}
                {flurstueck.veranstaltungsfreigabe ? (
                  <MicroBadge color="success">
                    <PartyPopper size={11} /> Veranstaltungsfreigabe
                  </MicroBadge>
                ) : null}
              </div>
            </div>
          </div>
          <PremiumButton variant="danger" size="sm" onClick={handleDelete} disabled={busyDelete}>
            <Trash2 size={14} />
            {busyDelete ? "Lösche …" : "Löschen"}
          </PremiumButton>
        </div>
      </GlassCard>

      {/* ---- Reiter ---- */}
      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "interactive flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium",
              tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {tab === "flurstueck" && (
            <StammdatenTab flurstueck={flurstueck} liegenschaften={liegenschaften} onUpdate={setFlurstueck} />
          )}
          {tab === "grundbuch" && <GrundbuchTab flurstueckId={flurstueck.id} />}
          {tab === "vertraege" && <VertraegeTab flurstueck={flurstueck} />}
          {tab === "flaechen" && <FlaechenTab flurstueck={flurstueck} onUpdate={setFlurstueck} />}
          {tab === "dokumente" && <DokumenteTab flurstueck={flurstueck} onUpdate={setFlurstueck} />}
          {tab === "kalender" && <KalenderTab flurstueck={flurstueck} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// 1. Flurstück — Stammdaten mit Inline-Bearbeitung
// ============================================================================

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function StammdatenTab({
  flurstueck,
  liegenschaften,
  onUpdate,
}: {
  flurstueck: Flurstueck;
  liegenschaften: Liegenschaft[];
  onUpdate: (f: Flurstueck) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [werte, setWerte] = useState({
    liegenschaftId: flurstueck.liegenschaftId,
    gemarkung: flurstueck.gemarkung,
    flur: flurstueck.flur,
    flurstueckNummer: flurstueck.flurstueckNummer,
    wirtschaftsart: flurstueck.wirtschaftsart,
    flaecheQm: flurstueck.flaecheQm?.toString() || "",
    lage: flurstueck.lage || "",
    grundbuchblatt: flurstueck.grundbuchblatt || "",
    grundbuchamt: flurstueck.grundbuchamt || "",
    notizen: flurstueck.notizen || "",
  });

  const bild = flurstueck.anhaenge?.find((a) => a.typ === "Foto");

  async function speichern() {
    setBusy(true);
    setFehler(null);
    const updated = await patchFlurstueck(flurstueck.id, {
      ...werte,
      flaecheQm: werte.flaecheQm ? Number(werte.flaecheQm) : undefined,
    });
    setBusy(false);
    if (!updated) {
      setFehler("Speichern fehlgeschlagen.");
      return;
    }
    onUpdate(updated);
    setBearbeiten(false);
  }

  async function bildHochladen(file: File) {
    setBusy(true);
    setFehler(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      const neu: Anhang = {
        id: crypto.randomUUID(),
        typ: "Foto",
        dateiName: json.dateiName,
        storedFileName: json.storedFileName,
        mimeType: json.mimeType,
        hochgeladenAm: new Date().toISOString(),
      };
      const restAnhaenge = (flurstueck.anhaenge || []).filter((a) => a.typ !== "Foto");
      const updated = await patchFlurstueck(flurstueck.id, { anhaenge: [...restAnhaenge, neu] });
      if (updated) onUpdate(updated);
      else setFehler("Bild konnte nicht zugeordnet werden.");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
      {/* Bild/Karte */}
      <GlassCard hover={false} className="flex flex-col items-center justify-center gap-3 p-4">
        {bild ? (
          /\.(png|jpe?g|webp|gif)$/i.test(bild.dateiName) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${bild.storedFileName}?mime=${encodeURIComponent(bild.mimeType)}&name=${encodeURIComponent(bild.dateiName)}`}
              alt={`Bild/Karte ${flurstueck.gemarkung} Flur ${flurstueck.flur}`}
              className="aspect-square w-full rounded-xl object-cover"
            />
          ) : (
            <a
              href={`/api/files/${bild.storedFileName}?mime=${encodeURIComponent(bild.mimeType)}&name=${encodeURIComponent(bild.dateiName)}`}
              target="_blank"
              rel="noreferrer"
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-primary hover:bg-muted"
            >
              <ImageIcon size={28} />
              <span className="text-xs">{bild.dateiName}</span>
            </a>
          )
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground">
            <ImageIcon size={28} className="opacity-40" />
            <span className="text-xs">Kein Bild/Karte hinterlegt</span>
          </div>
        )}
        <label className="interactive flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
          <Upload size={12} />
          {bild ? "Bild ersetzen" : "Bild/Karte hochladen"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && bildHochladen(e.target.files[0])}
          />
        </label>
      </GlassCard>

      {/* Stammdaten */}
      <GlassCard hover={false} className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Katasterdaten</h2>
          {!bearbeiten ? (
            <button
              onClick={() => setBearbeiten(true)}
              className="interactive flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Pencil size={12} /> Bearbeiten
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setBearbeiten(false)} className="text-xs text-muted-foreground hover:underline">
                Abbrechen
              </button>
              <button
                onClick={speichern}
                disabled={busy}
                className="interactive flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                <Check size={12} /> {busy ? "Speichere …" : "Speichern"}
              </button>
            </div>
          )}
        </div>

        {fehler && (
          <div className="mb-3 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>
        )}

        {!bearbeiten ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Feld label="Liegenschaft">{liegenschaften.find((l) => l.id === flurstueck.liegenschaftId)?.name || "—"}</Feld>
            <Feld label="Gemarkung">{flurstueck.gemarkung}</Feld>
            <Feld label="Flur">{flurstueck.flur}</Feld>
            <Feld label="Flurstücksnummer">{flurstueck.flurstueckNummer}</Feld>
            <Feld label="Wirtschaftsart">{flurstueck.wirtschaftsart}</Feld>
            <Feld label="Größe">{flurstueck.flaecheQm ? `${flurstueck.flaecheQm.toLocaleString("de-DE")} m²` : "—"}</Feld>
            <Feld label="Lage">{flurstueck.lage || "—"}</Feld>
            <Feld label="Grundbuchblatt">{flurstueck.grundbuchblatt || "—"}</Feld>
            <Feld label="Grundbuchamt">{flurstueck.grundbuchamt || "—"}</Feld>
            {flurstueck.notizen && (
              <div className="col-span-full">
                <Feld label="Notizen">{flurstueck.notizen}</Feld>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-full">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Liegenschaft</label>
              <select
                value={werte.liegenschaftId}
                onChange={(e) => setWerte({ ...werte, liegenschaftId: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {liegenschaften.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <EditFeld label="Gemarkung" value={werte.gemarkung} onChange={(v) => setWerte({ ...werte, gemarkung: v })} />
            <EditFeld label="Flur" value={werte.flur} onChange={(v) => setWerte({ ...werte, flur: v })} />
            <EditFeld
              label="Flurstücksnummer"
              value={werte.flurstueckNummer}
              onChange={(v) => setWerte({ ...werte, flurstueckNummer: v })}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Wirtschaftsart</label>
              <select
                value={werte.wirtschaftsart}
                onChange={(e) => setWerte({ ...werte, wirtschaftsart: e.target.value as FlurstueckWirtschaftsart })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {WIRTSCHAFTSARTEN.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <EditFeld
              label="Größe (m²)"
              type="number"
              value={werte.flaecheQm}
              onChange={(v) => setWerte({ ...werte, flaecheQm: v })}
            />
            <EditFeld label="Lage" value={werte.lage} onChange={(v) => setWerte({ ...werte, lage: v })} />
            <EditFeld
              label="Grundbuchblatt"
              value={werte.grundbuchblatt}
              onChange={(v) => setWerte({ ...werte, grundbuchblatt: v })}
            />
            <EditFeld
              label="Grundbuchamt"
              value={werte.grundbuchamt}
              onChange={(v) => setWerte({ ...werte, grundbuchamt: v })}
            />
            <div className="col-span-full">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notizen</label>
              <textarea
                value={werte.notizen}
                onChange={(e) => setWerte({ ...werte, notizen: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function EditFeld({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

// ============================================================================
// 2. Grundbuch — Abt. I / II / III
// ============================================================================

const ABTEILUNGEN: { id: GrundbuchAbteilung; titel: string; hinweis: string }[] = [
  { id: "I", titel: "Abteilung I — Eigentumsverhältnisse", hinweis: "Eigentümer und Eigentumsübergänge" },
  { id: "II", titel: "Abteilung II — Rechte und Lasten", hinweis: "z. B. Wegerecht, Nießbrauch, Vorkaufsrecht, Erbbaurecht" },
  { id: "III", titel: "Abteilung III — Grundpfandrechte", hinweis: "Hypotheken, Grundschulden, Rentenschulden" },
];

function GrundbuchTab({ flurstueckId }: { flurstueckId: string }) {
  const [eintraege, setEintraege] = useState<GrundbuchEintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [neuFuer, setNeuFuer] = useState<GrundbuchAbteilung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/grundbuch?flurstueckId=${flurstueckId}`)
      .then((r) => r.json())
      .then((json) => setEintraege(json.eintraege || []))
      .catch(() => setFehler("Grundbuch konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [flurstueckId]);

  async function handleRoeten(eintrag: GrundbuchEintrag) {
    const grund = window.prompt("Grund für das Röten (erloschen/abgelöst)?", "Erloschen") || undefined;
    const r = await fetch(`/api/grundbuch/${eintrag.id}/roeten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grund }),
    });
    if (r.ok) refresh();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Lädt …</p>;

  return (
    <div className="space-y-5">
      {fehler && <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>}
      {ABTEILUNGEN.map((abt) => {
        const eintraegeAbt = eintraege.filter((e) => e.abteilung === abt.id);
        return (
          <GlassCard key={abt.id} hover={false} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{abt.titel}</h3>
                <p className="text-xs text-muted-foreground">{abt.hinweis}</p>
              </div>
              <button
                onClick={() => setNeuFuer(abt.id)}
                className="interactive flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <Plus size={12} /> Eintrag
              </button>
            </div>
            {eintraegeAbt.length === 0 ? (
              <p className="text-xs text-muted-foreground">Keine Einträge.</p>
            ) : (
              <div className="space-y-1.5">
                {eintraegeAbt.map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs",
                      e.geloeschtAm && "opacity-50"
                    )}
                  >
                    <div>
                      <div className="font-medium">
                        {e.lfdNummer ? `Nr. ${e.lfdNummer} — ` : ""}
                        {e.art} · {e.berechtigter}
                        {e.geloeschtAm && (
                          <span className="ml-2 text-[var(--destructive)]">(gerötet {formatDate(e.geloeschtAm)})</span>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        eingetragen {formatDate(e.eingetragenAm)}
                        {typeof e.betrag === "number" && ` · ${e.betrag.toLocaleString("de-DE")} ${e.waehrung || "EUR"}`}
                        {e.beschreibung && ` · ${e.beschreibung}`}
                      </div>
                    </div>
                    {!e.geloeschtAm && (
                      <button
                        onClick={() => handleRoeten(e)}
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
          </GlassCard>
        );
      })}

      {neuFuer && (
        <GrundbuchEintragFormular
          flurstueckId={flurstueckId}
          abteilung={neuFuer}
          onClose={() => setNeuFuer(null)}
          onDone={() => {
            setNeuFuer(null);
            refresh();
          }}
        />
      )}
    </div>
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
        {fehler && <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>}
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

// ============================================================================
// 3. Verträge — verknüpfte Verträge (VERTR-001 bis VERTR-009)
// ============================================================================

const VERTRAG_ARTEN: VertragArt[] = ["Pacht", "Dienstleistung", "Wartung", "Versicherung", "Erbbaurecht", "Sonstige"];
const NUTZUNGSARTEN: PachtNutzungsart[] = ["Jagd", "Fischerei", "Kleingarten", "Wiese", "Ackerland", "Sonstige Nutzung"];
const INTERVALLE: Zahlungsintervall[] = ["Einmalig", "Monatlich", "Quartalsweise", "Halbjährlich", "Jährlich"];

const VERTRAG_STATUS_ICON: Record<VertragStatus, StatusBadgeStatus> = {
  Entwurf: "pending",
  Aktiv: "ok",
  Gekündigt: "warning",
  Beendet: "error",
};

function VertraegeTab({ flurstueck }: { flurstueck: Flurstueck }) {
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [neuOffen, setNeuOffen] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/vertraege?flurstueckId=${flurstueck.id}`)
      .then((r) => r.json())
      .then((json) => setVertraege(json.vertraege || []))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [flurstueck.id]);

  if (loading) return <p className="text-sm text-muted-foreground">Lädt …</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {vertraege.length} {vertraege.length === 1 ? "Vertrag" : "Verträge"} zu diesem Flurstück verknüpft.
        </p>
        <PremiumButton size="sm" onClick={() => setNeuOffen(true)}>
          <Plus size={14} /> Neuer Vertrag
        </PremiumButton>
      </div>

      {vertraege.length === 0 ? (
        <EmptyState title="Noch keine Verträge" hint="Lege einen Pacht-, Dienstleistungs- oder sonstigen Vertrag für dieses Flurstück an." />
      ) : (
        <div className="space-y-2">
          {vertraege.map((v) => (
            <GlassCard key={v.id} hover={false} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{v.bezeichnung}</span>
                    <MicroBadge color="primary">{v.art}</MicroBadge>
                    {v.nutzungsart && <MicroBadge color="accent">{v.nutzungsart}</MicroBadge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {v.vertragspartner} · {formatDate(v.beginn)} – {v.unbefristet ? "unbefristet" : v.ende ? formatDate(v.ende) : "offen"}
                    {typeof v.betrag === "number" && ` · ${v.betrag.toLocaleString("de-DE")} € ${v.zahlungsintervall || ""}`}
                  </p>
                  {v.kuendigungsfrist && <p className="text-xs text-muted-foreground">Kündigungsfrist: {v.kuendigungsfrist}</p>}
                  {v.notizen && <p className="mt-1 text-xs text-muted-foreground">{v.notizen}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={VERTRAG_STATUS_ICON[v.status]} text={v.status} />
                  {v.storedFileName && (
                    <a
                      href={`/api/files/${v.storedFileName}?mime=${encodeURIComponent(v.mimeType || "application/pdf")}&name=${encodeURIComponent(v.dateiName || "vertrag.pdf")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="interactive flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink size={12} /> PDF
                    </a>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {neuOffen && (
        <VertragFormular
          flurstueck={flurstueck}
          onClose={() => setNeuOffen(false)}
          onDone={() => {
            setNeuOffen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VertragFormular({
  flurstueck,
  onClose,
  onDone,
}: {
  flurstueck: Flurstueck;
  onClose: () => void;
  onDone: () => void;
}) {
  const [werte, setWerte] = useState({
    art: "Pacht" as VertragArt,
    bezeichnung: "",
    vertragspartner: "",
    nutzungsart: "Sonstige Nutzung" as PachtNutzungsart,
    beginn: new Date().toISOString().slice(0, 10),
    ende: "",
    unbefristet: false,
    kuendigungsfrist: "",
    betrag: "",
    zahlungsintervall: "Jährlich" as Zahlungsintervall,
    notizen: "",
  });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      const r = await fetch("/api/vertraege", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...werte,
          flurstueckId: flurstueck.id,
          liegenschaftId: flurstueck.liegenschaftId,
          nutzungsart: werte.art === "Pacht" ? werte.nutzungsart : undefined,
          ende: werte.unbefristet ? undefined : werte.ende || undefined,
          betrag: werte.betrag ? Number(werte.betrag) : undefined,
          status: "Aktiv",
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
    <Modal title={`Neuer Vertrag — ${flurstueck.gemarkung} Flur ${flurstueck.flur} Nr. ${flurstueck.flurstueckNummer}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Vertragsart</label>
            <select
              value={werte.art}
              onChange={(e) => setWerte({ ...werte, art: e.target.value as VertragArt })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {VERTRAG_ARTEN.map((a) => (
                <option key={a} value={a}>
                  {a}
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
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Bezeichnung / Sachgegenstand</label>
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ende</label>
            <input
              type="date"
              disabled={werte.unbefristet}
              value={werte.ende}
              onChange={(e) => setWerte({ ...werte, ende: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={werte.unbefristet}
            onChange={(e) => setWerte({ ...werte, unbefristet: e.target.checked })}
          />
          Unbefristet
        </label>
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Entgelt/Zins (EUR)</label>
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
              onChange={(e) => setWerte({ ...werte, zahlungsintervall: e.target.value as Zahlungsintervall })}
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
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Bedingungen / Notizen</label>
          <textarea
            value={werte.notizen}
            onChange={(e) => setWerte({ ...werte, notizen: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {fehler && <div className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Speichere …" : "Vertrag anlegen"}
        </button>
      </form>
    </Modal>
  );
}

// ============================================================================
// 4. Flächen — Gesamtfläche, Nutzungsflächen (Pacht-Verträge), Veranstaltungsfreigabe
// ============================================================================

function FlaechenTab({ flurstueck, onUpdate }: { flurstueck: Flurstueck; onUpdate: (f: Flurstueck) => void }) {
  const [pachtVertraege, setPachtVertraege] = useState<Vertrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/vertraege?flurstueckId=${flurstueck.id}&art=Pacht`)
      .then((r) => r.json())
      .then((json) => setPachtVertraege(json.vertraege || []))
      .finally(() => setLoading(false));
  }, [flurstueck.id]);

  async function toggleFreigabe() {
    setBusy(true);
    const updated = await patchFlurstueck(flurstueck.id, { veranstaltungsfreigabe: !flurstueck.veranstaltungsfreigabe });
    setBusy(false);
    if (updated) onUpdate(updated);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GlassCard hover={false} className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Gesamtfläche (Flurstück)</p>
          <p className="mt-1 text-2xl font-bold">
            {flurstueck.flaecheQm ? `${flurstueck.flaecheQm.toLocaleString("de-DE")} m²` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{flurstueck.wirtschaftsart}</p>
        </GlassCard>

        <GlassCard hover={false} className="flex flex-col justify-between p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Kurzzeitvermietung / Veranstaltungen (LIE-010)</p>
            <p className="mt-1 text-sm">
              {flurstueck.veranstaltungsfreigabe
                ? "Fläche ist für Kurzzeitvermietung/Veranstaltungen freigegeben."
                : "Fläche ist aktuell gesperrt."}
            </p>
          </div>
          <button
            onClick={toggleFreigabe}
            disabled={busy}
            className={cn(
              "interactive mt-3 self-start rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50",
              flurstueck.veranstaltungsfreigabe
                ? "border border-border hover:bg-muted"
                : "bg-primary text-primary-foreground"
            )}
          >
            {flurstueck.veranstaltungsfreigabe ? "Freigabe entziehen" : "Für Veranstaltungen freigeben"}
          </button>
        </GlassCard>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Nutzungsflächen aus Pachtverträgen</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Jagd, Fischerei, Kleingarten, Wiese und weitere Nutzungsarten werden über Pachtverträge (Reiter „Verträge“) erfasst.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : pachtVertraege.length === 0 ? (
          <EmptyState
            title="Keine Nutzungsflächen erfasst"
            hint="Lege im Reiter „Verträge“ einen Pachtvertrag mit passender Nutzungsart an."
          />
        ) : (
          <div className="space-y-2">
            {pachtVertraege.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{v.nutzungsart}</span> · {v.vertragspartner}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(v.beginn)} – {v.unbefristet ? "unbefristet" : v.ende ? formatDate(v.ende) : "offen"}
                  </p>
                </div>
                <StatusBadge status={VERTRAG_STATUS_ICON[v.status]} text={v.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 5. Dokumente — direkte Anhänge + zugeordnete Ablage-Dokumente
// ============================================================================

const ANHANG_TYPEN: AnhangTyp[] = ["Grundbuchauszug", "Kaufvertrag", "Foto", "Sonstiges"];

function DokumenteTab({ flurstueck, onUpdate }: { flurstueck: Flurstueck; onUpdate: (f: Flurstueck) => void }) {
  const [ablage, setAblage] = useState<AblageDokument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [typ, setTyp] = useState<AnhangTyp>("Sonstiges");
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/ablage")
      .then((r) => r.json())
      .then((json) => {
        const alle: AblageDokument[] = json.ablage || [];
        setAblage(alle.filter((d) => d.zugeordnetAn?.art === "Flurstueck" && d.zugeordnetAn.id === flurstueck.id));
      })
      .finally(() => setLoading(false));
  }, [flurstueck.id]);

  const anhaenge = flurstueck.anhaenge || [];

  async function hochladen(file: File) {
    setBusy(true);
    setFehler(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      const neu: Anhang = {
        id: crypto.randomUUID(),
        typ,
        dateiName: json.dateiName,
        storedFileName: json.storedFileName,
        mimeType: json.mimeType,
        hochgeladenAm: new Date().toISOString(),
      };
      const updated = await patchFlurstueck(flurstueck.id, { anhaenge: [...anhaenge, neu] });
      if (updated) onUpdate(updated);
      else setFehler("Dokument konnte nicht zugeordnet werden.");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function entfernen(id: string) {
    if (!confirm("Dokument aus der Akte entfernen?")) return;
    const updated = await patchFlurstueck(flurstueck.id, { anhaenge: anhaenge.filter((a) => a.id !== id) });
    if (updated) onUpdate(updated);
  }

  return (
    <div className="space-y-5">
      <GlassCard hover={false} className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Neues Dokument ablegen</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typ}
            onChange={(e) => setTyp(e.target.value as AnhangTyp)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ANHANG_TYPEN.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="interactive flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            <Upload size={14} />
            {busy ? "Lädt hoch …" : "Datei wählen"}
            <input
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && hochladen(e.target.files[0])}
            />
          </label>
        </div>
        {fehler && (
          <div className="mt-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--destructive)]">{fehler}</div>
        )}
      </GlassCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Direkt abgelegte Dokumente</h3>
        {anhaenge.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Dokumente in dieser Akte.</p>
        ) : (
          <div className="space-y-1.5">
            {anhaenge.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <MicroBadge color="primary">{a.typ}</MicroBadge>
                  <a
                    href={`/api/files/${a.storedFileName}?mime=${encodeURIComponent(a.mimeType)}&name=${encodeURIComponent(a.dateiName)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {a.dateiName}
                  </a>
                  <span className="text-xs text-muted-foreground">{formatDate(a.hochgeladenAm)}</span>
                </div>
                <button onClick={() => entfernen(a.id)} className="text-muted-foreground hover:text-[var(--destructive)]">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Aus der zentralen Ablage zugeordnet</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : ablage.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Ablage-Dokumente diesem Flurstück zugeordnet. Zuordnung erfolgt über den intelligenten Upload in „Ablage“.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ablage.map((d) => (
              <a
                key={d.id}
                href={`/api/files/${d.storedFileName}?mime=${encodeURIComponent(d.mimeType)}&name=${encodeURIComponent(d.dateiName)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span>{d.dateiName}</span>
                <span className="text-xs text-muted-foreground">{formatDate(d.hochgeladenAm)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 6. Kalender — Vertragsfristen + liegenschaftsbezogene Termine
// ============================================================================

function KalenderTab({ flurstueck }: { flurstueck: Flurstueck }) {
  const [ereignisse, setEreignisse] = useState<KalenderEreignis[]>([]);
  const [abgeleitet, setAbgeleitet] = useState<AbgeleitetesKalenderEreignis[]>([]);
  const [vertragIds, setVertragIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/kalender-ereignisse").then((r) => r.json()),
      fetch(`/api/vertraege?flurstueckId=${flurstueck.id}`).then((r) => r.json()),
    ])
      .then(([kal, vt]) => {
        setEreignisse(kal.ereignisse || []);
        setAbgeleitet(kal.abgeleitet || []);
        setVertragIds(new Set((vt.vertraege || []).map((v: Vertrag) => v.id)));
      })
      .finally(() => setLoading(false));
  }, [flurstueck.id]);

  if (loading) return <p className="text-sm text-muted-foreground">Lädt …</p>;

  const vertragsfristen = abgeleitet.filter((a) => a.quelle === "Vertrag" && vertragIds.has(a.id.replace("vertrag-ende-", "")));
  const liegenschaftsTermine = ereignisse.filter((e) => flurstueck.liegenschaftId && e.liegenschaftId === flurstueck.liegenschaftId);

  const alle = [
    ...vertragsfristen.map((a) => ({ titel: a.titel, datum: a.datum, kategorie: a.kategorie, link: a.link })),
    ...liegenschaftsTermine.map((e) => ({ titel: e.titel, datum: e.datum, kategorie: e.kategorie, link: "/kalender" })),
  ].sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime());

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Vertragsfristen dieses Flurstücks sowie Termine der zugehörigen Liegenschaft — automatisch aus den Fachmodulen
        abgeleitet (KAL-001/004), nicht manuell gepflegt.
      </p>
      {alle.length === 0 ? (
        <EmptyState title="Keine Termine" hint="Sobald Verträge mit Enddatum oder Liegenschaftstermine bestehen, erscheinen sie hier." />
      ) : (
        <div className="space-y-1.5">
          {alle.map((e, i) => (
            <Link
              key={i}
              href={e.link || "/kalender"}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <MicroBadge color={e.kategorie === "Frist" ? "accent" : "primary"}>{e.kategorie}</MicroBadge>
                {e.titel}
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(e.datum)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
