"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  Abrechnung,
  Eigentuemer,
  Gebaeude,
  Liegenschaft,
  Mieter,
  MietkontoBuchung,
  MietkontoBuchungTyp,
  PmVertrag,
  SollIstEintrag,
  Wohnung,
} from "@/lib/types";
import { mietRueckstand, fehlendeSollstellungen } from "@/lib/mietkonto";
import SchriftverkehrPanel from "./SchriftverkehrPanel";
import { HierarchyData } from "@/lib/use-hierarchy-data";
import { NodeSelection } from "./LiegenschaftenTree";
import Modal from "./Modal";
import ProgressRing from "./ProgressRing";

interface Props {
  data: HierarchyData;
  selection: NodeSelection;
  onSelect: (sel: NodeSelection) => void;
  onChanged: () => void;
  /** Öffnet beim Anspringen per Deep-Link (z.B. ?tab=PM-Vertrag) direkt den passenden Tab. */
  initialTab?: string;
}

const TABS = [
  "Stammdaten",
  "Struktur",
  "Eigentümer",
  "PM-Vertrag",
  "Abrechnungen",
  "Dokumente",
  "Soll/Ist Vorauszahlungen",
  "Mietkonto",
  "Schriftverkehr",
] as const;
type Tab = (typeof TABS)[number];

async function patchEntity(url: string, patch: Record<string, unknown>) {
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function Field({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string | number | undefined;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [val, setVal] = useState(value ?? "");
  const [saved, setSaved] = useState(false);
  // Prop-Änderungen (nach Speichern/Refresh oder Wechsel des Mieters) in den lokalen State übernehmen
  useEffect(() => {
    setVal(value ?? "");
  }, [value]);
  const dirty = String(val) !== String(value ?? "");

  const save = () => {
    onSave(String(val));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        <input
          type={type}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) save();
          }}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={save}
          disabled={!dirty}
          title="Speichern"
          className={cn(
            "shrink-0 rounded px-2 text-xs font-medium transition-colors",
            saved
              ? "bg-[var(--success-bg)] text-[var(--success)]"
              : dirty
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {saved ? "✓" : "💾"}
        </button>
      </div>
    </label>
  );
}

export default function LiegenschaftDetail({ data, selection, onSelect, onChanged, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>("Stammdaten");
  useEffect(() => {
    if (initialTab && TABS.includes(initialTab as Tab)) {
      setTab(initialTab as Tab);
    }
    // Nur reagieren, wenn sich der Deep-Link-Tab oder die Auswahl ändert –
    // manuelle Tab-Klicks des Nutzers danach nicht überschreiben.
  }, [initialTab, selection?.type, selection?.id]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [liegenschaftVorschlag, setLiegenschaftVorschlag] = useState<{
    strasse: string;
    hausnummer: string;
    plz: string;
    ort: string;
    grund: string;
  } | null>(null);
  const [neueAbrechnungId, setNeueAbrechnungId] = useState<string | undefined>();

  const eigFileInputRef = useRef<HTMLInputElement>(null);
  const [eigUploading, setEigUploading] = useState(false);
  const [eigMsg, setEigMsg] = useState<string | null>(null);
  const [eigManuellOpen, setEigManuellOpen] = useState(false);
  const [eigForm, setEigForm] = useState({
    name: "",
    anschrift: "",
    email: "",
    telefon: "",
    miteigentumsanteil: "",
  });

  const pmFileInputRef = useRef<HTMLInputElement>(null);
  const [pmUploading, setPmUploading] = useState(false);
  const [pmMsg, setPmMsg] = useState<string | null>(null);
  const [pmManuellOpen, setPmManuellOpen] = useState(false);
  const [pmForm, setPmForm] = useState({
    verwalterName: "",
    auftraggeberName: "",
    honorarModell: "",
    honorarSatz: "",
    leistungsumfang: "",
    laufzeitBeginn: "",
    kuendigungsfrist: "",
  });

  const liegenschaft = data.liegenschaften.find(
    (l) => selection?.type === "liegenschaft" && l.id === selection.id
  );
  const gebaeude = data.gebaeude.find(
    (g) => selection?.type === "gebaeude" && g.id === selection.id
  );
  const wohnung = data.wohnungen.find(
    (w) => selection?.type === "wohnung" && w.id === selection.id
  );
  const mieter = data.mieter.find((m) => selection?.type === "mieter" && m.id === selection.id);
  const mieterWohnung = mieter ? data.wohnungen.find((w) => w.id === mieter.wohnungId) : undefined;
  const mieterGebaeude = mieterWohnung
    ? data.gebaeude.find((g) => g.id === mieterWohnung.gebaeudeId)
    : undefined;
  const mieterLiegenschaft = mieterGebaeude
    ? data.liegenschaften.find((l) => l.id === mieterGebaeude.liegenschaftId)
    : undefined;

  // Deszendenten-IDs ermitteln, um Abrechnungen/Dokumente auf allen Ebenen filtern zu können
  const scope = useMemo(() => {
    if (liegenschaft) {
      const gIds = data.gebaeude.filter((g) => g.liegenschaftId === liegenschaft.id).map((g) => g.id);
      const wIds = data.wohnungen.filter((w) => gIds.includes(w.gebaeudeId)).map((w) => w.id);
      return { liegenschaftIds: [liegenschaft.id], gebaeudeIds: gIds, wohnungIds: wIds };
    }
    if (gebaeude) {
      const wIds = data.wohnungen.filter((w) => w.gebaeudeId === gebaeude.id).map((w) => w.id);
      return { liegenschaftIds: [], gebaeudeIds: [gebaeude.id], wohnungIds: wIds };
    }
    if (wohnung) {
      return { liegenschaftIds: [], gebaeudeIds: [], wohnungIds: [wohnung.id] };
    }
    return { liegenschaftIds: [], gebaeudeIds: [], wohnungIds: [] };
  }, [liegenschaft, gebaeude, wohnung, data]);

  const scopedAbrechnungen: Abrechnung[] = useMemo(() => {
    if (mieter) return [];
    return data.abrechnungen.filter(
      (a) =>
        (a.liegenschaftId && scope.liegenschaftIds.includes(a.liegenschaftId)) ||
        (a.gebaeudeId && scope.gebaeudeIds.includes(a.gebaeudeId)) ||
        (a.wohnungId && scope.wohnungIds.includes(a.wohnungId))
    );
  }, [data.abrechnungen, scope, mieter]);

  const scopedDokumente = useMemo(
    () => scopedAbrechnungen.flatMap((a) => a.dokumente.map((d) => ({ ...d, abrechnung: a }))),
    [scopedAbrechnungen]
  );

  const scopedEigentuemer: Eigentuemer[] = useMemo(
    () => (liegenschaft ? data.eigentuemer.filter((e) => e.liegenschaftId === liegenschaft.id) : []),
    [data.eigentuemer, liegenschaft]
  );

  const scopedPmVertraege: PmVertrag[] = useMemo(
    () => (liegenschaft ? data.pmVertraege.filter((p) => p.liegenschaftId === liegenschaft.id) : []),
    [data.pmVertraege, liegenschaft]
  );

  // Mietverträge + deren Nachträge/Übergabeprotokolle des ausgewählten Mieters –
  // eigener, direkter Dokumente-Bestand (scopedDokumente deckt nur Abrechnungs-
  // Rechnungen ab und ist auf Mieter-Ebene bewusst leer).
  const mieterDokumente = useMemo(() => {
    if (!mieter) return [];
    const eigene = (data.mietvertraege || []).filter((mv) => mv.mieterId === mieter.id);
    const items: {
      id: string;
      art: string;
      name: string;
      storedFileName?: string;
      mimeType: string;
      datum?: string;
    }[] = [];
    for (const mv of eigene) {
      items.push({
        id: mv.id,
        art: "Mietvertrag",
        name: mv.dateiName || mv.nummer || "Mietvertrag",
        storedFileName: mv.storedFileName,
        mimeType: mv.mimeType,
        datum: mv.hochgeladenAm,
      });
      for (const a of mv.anhaenge || []) {
        items.push({
          id: a.id,
          art: a.typ || "Nachtrag",
          name: a.dateiName || "Nachtrag/Übergabeprotokoll",
          storedFileName: a.storedFileName,
          mimeType: a.mimeType,
          datum: a.hochgeladenAm,
        });
      }
    }
    return items;
  }, [data.mietvertraege, mieter]);

  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
        <div>
          <p className="mb-1 text-2xl">🏘️</p>
          <p>Wähle links eine Liegenschaft, ein Gebäude, eine Wohnung oder einen Mieter aus.</p>
        </div>
      </div>
    );
  }

  const title =
    liegenschaft?.name || gebaeude?.name || wohnung?.bezeichnung || mieter?.name || "";
  const subtitle = liegenschaft
    ? "Liegenschaft"
    : gebaeude
    ? "Gebäude"
    : wohnung
    ? "Wohnung / Einheit"
    : "Mieter";

  const nummer = liegenschaft?.nummer || gebaeude?.nummer || wohnung?.nummer || mieter?.nummer;

  const visibleTabs = TABS.filter((t) => {
    if (t === "Struktur" && mieter) return false;
    if ((t === "Soll/Ist Vorauszahlungen" || t === "Mietkonto" || t === "Schriftverkehr") && !mieter)
      return false;
    if ((t === "Eigentümer" || t === "PM-Vertrag") && !liegenschaft) return false;
    return true;
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    if (liegenschaft) fd.append("liegenschaftId", liegenschaft.id);
    if (gebaeude) fd.append("gebaeudeId", gebaeude.id);
    if (wohnung) fd.append("wohnungId", wohnung.id);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadMsg(json.error || "Analyse fehlgeschlagen");
      } else {
        const pct = Math.round((json.pruefung?.score || 0) * 100);
        setUploadMsg(
          json.pruefung?.akzeptiert
            ? `✅ Rechnung erkannt (${pct}% der Merkmale)${
                json.ergaenzt ? " und der bestehenden Abrechnung des Zeitraums hinzugefügt." : " und im Workspace abgelegt."
              }`
            : `⚠️ Nur ${pct}% der Rechnungsmerkmale erkannt – bitte prüfen.`
        );
        if (json.liegenschaftVorschlag) {
          setLiegenschaftVorschlag(json.liegenschaftVorschlag);
          setNeueAbrechnungId(json.abrechnung?.id);
        }
        onChanged();
      }
    } catch {
      setUploadMsg("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const liegenschaftAnlegen = async () => {
    if (!liegenschaftVorschlag) return;
    const res = await fetch("/api/liegenschaften", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${liegenschaftVorschlag.strasse} ${liegenschaftVorschlag.hausnummer}`.trim() || "Neue Liegenschaft",
        strasse: liegenschaftVorschlag.strasse,
        hausnummer: liegenschaftVorschlag.hausnummer,
        plz: liegenschaftVorschlag.plz,
        ort: liegenschaftVorschlag.ort,
      }),
    });
    const { liegenschaft: neu } = await res.json();
    if (neu && neueAbrechnungId) {
      await patchEntity(`/api/abrechnungen/${neueAbrechnungId}`, { liegenschaftId: neu.id });
    }
    setLiegenschaftVorschlag(null);
    setNeueAbrechnungId(undefined);
    onChanged();
    if (neu) onSelect({ type: "liegenschaft", id: neu.id });
  };

  const handleEigentuemerUpload = async (file: File) => {
    if (!liegenschaft) return;
    setEigUploading(true);
    setEigMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/eigentuemer/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setEigMsg(json.error || "Analyse fehlgeschlagen");
      } else {
        const e = json.extraktion;
        await fetch("/api/eigentuemer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            liegenschaftId: liegenschaft.id,
            name: e.eigentuemerName || "Unbekannter Eigentümer",
            anschrift: e.anschrift,
            email: e.email,
            telefon: e.telefon,
            miteigentumsanteil: e.miteigentumsanteil,
            vollmachtVon: e.vollmachtBeginn,
            vollmachtBis: e.vollmachtEnde,
            dateiName: json.dateiName,
            storedFileName: json.storedFileName,
            mimeType: json.mimeType,
            notizen: e.dokumentTyp ? `Dokumenttyp: ${e.dokumentTyp}` : undefined,
          }),
        });
        setEigMsg(`✅ „${e.eigentuemerName || "Eigentümer"}“ erkannt und zugeordnet.`);
        onChanged();
      }
    } catch {
      setEigMsg("Analyse fehlgeschlagen");
    } finally {
      setEigUploading(false);
    }
  };

  const submitEigentuemerManuell = async () => {
    if (!liegenschaft || !eigForm.name.trim()) return;
    await fetch("/api/eigentuemer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liegenschaftId: liegenschaft.id,
        name: eigForm.name,
        anschrift: eigForm.anschrift || undefined,
        email: eigForm.email || undefined,
        telefon: eigForm.telefon || undefined,
        miteigentumsanteil: eigForm.miteigentumsanteil ? Number(eigForm.miteigentumsanteil) : undefined,
      }),
    });
    setEigForm({ name: "", anschrift: "", email: "", telefon: "", miteigentumsanteil: "" });
    setEigManuellOpen(false);
    onChanged();
  };

  const handlePmVertragUpload = async (file: File) => {
    if (!liegenschaft) return;
    setPmUploading(true);
    setPmMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/pm-vertrag/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setPmMsg(json.error || "Analyse fehlgeschlagen");
      } else {
        const e = json.extraktion;
        await fetch("/api/pm-vertrag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            liegenschaftId: liegenschaft.id,
            dateiName: json.dateiName,
            storedFileName: json.storedFileName,
            mimeType: json.mimeType,
            verwalterName: e.verwalterName,
            auftraggeberName: e.auftraggeberName,
            honorarModell: e.honorarModell,
            honorarSatz: e.honorarSatz,
            leistungsumfang: e.leistungsumfang,
            laufzeitBeginn: e.laufzeitBeginn,
            laufzeitEnde: e.laufzeitEnde,
            kuendigungsfrist: e.kuendigungsfrist,
            status: "Aktiv",
          }),
        });
        setPmMsg(`✅ Vertrag mit „${e.verwalterName || "Verwalter"}“ erkannt und zugeordnet.`);
        onChanged();
      }
    } catch {
      setPmMsg("Analyse fehlgeschlagen");
    } finally {
      setPmUploading(false);
    }
  };

  const submitPmVertragManuell = async () => {
    if (!liegenschaft || !pmForm.verwalterName.trim()) return;
    await fetch("/api/pm-vertrag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liegenschaftId: liegenschaft.id,
        dateiName: `PM-Vertrag ${pmForm.verwalterName}`,
        mimeType: "text/plain",
        verwalterName: pmForm.verwalterName,
        auftraggeberName: pmForm.auftraggeberName || undefined,
        honorarModell: pmForm.honorarModell || undefined,
        honorarSatz: pmForm.honorarSatz ? Number(pmForm.honorarSatz) : undefined,
        leistungsumfang: pmForm.leistungsumfang || undefined,
        laufzeitBeginn: pmForm.laufzeitBeginn || undefined,
        kuendigungsfrist: pmForm.kuendigungsfrist || undefined,
        status: "Aktiv",
      }),
    });
    setPmForm({
      verwalterName: "",
      auftraggeberName: "",
      honorarModell: "",
      honorarSatz: "",
      leistungsumfang: "",
      laufzeitBeginn: "",
      kuendigungsfrist: "",
    });
    setPmManuellOpen(false);
    onChanged();
  };

  const freigeben = async (abrechnung: Abrechnung, dok: (typeof scopedDokumente)[number]) => {
    const status = dok.pruefung?.zahlungsfreigabe?.status === "freigegeben" ? "offen" : "freigegeben";
    const updatedDokumente = abrechnung.dokumente.map((d) =>
      d.id === dok.id
        ? {
            ...d,
            pruefung: {
              ...(d.pruefung || { erkannteMerkmale: [], score: 0, akzeptiert: false }),
              zahlungsfreigabe: { status, timestamp: new Date().toISOString() },
            },
          }
        : d
    );
    await patchEntity(`/api/abrechnungen/${abrechnung.id}`, { dokumente: updatedDokumente });
    onChanged();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-card/80 p-5 backdrop-blur-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {subtitle} {nummer && <span className="font-mono">· {nummer}</span>}
        </p>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border px-4">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div key={tab} className="min-h-0 flex-1 overflow-y-auto p-5 animate-[fadein_0.2s_ease]">
        {tab === "Stammdaten" && (
          <div className="grid max-w-xl grid-cols-2 gap-4">
            {liegenschaft && (
              <>
                <Field
                  label="Name"
                  value={liegenschaft.name}
                  onSave={(v) => {
                    patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { name: v }).then(onChanged);
                  }}
                />
                <Field
                  label="Straße"
                  value={liegenschaft.strasse}
                  onSave={(v) => patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { strasse: v }).then(onChanged)}
                />
                <Field
                  label="Hausnummer"
                  value={liegenschaft.hausnummer}
                  onSave={(v) =>
                    patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { hausnummer: v }).then(onChanged)
                  }
                />
                <Field
                  label="PLZ"
                  value={liegenschaft.plz}
                  onSave={(v) => patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { plz: v }).then(onChanged)}
                />
                <Field
                  label="Ort"
                  value={liegenschaft.ort}
                  onSave={(v) => patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { ort: v }).then(onChanged)}
                />
                <Field
                  label="Grundstücksfläche (m²)"
                  type="number"
                  value={liegenschaft.grundstuecksflaeche}
                  onSave={(v) =>
                    patchEntity(`/api/liegenschaften/${liegenschaft.id}`, {
                      grundstuecksflaeche: Number(v) || undefined,
                    }).then(onChanged)
                  }
                />
                <Field
                  label="Flurstück"
                  value={liegenschaft.flurstueck}
                  onSave={(v) =>
                    patchEntity(`/api/liegenschaften/${liegenschaft.id}`, { flurstueck: v }).then(onChanged)
                  }
                />
              </>
            )}
            {gebaeude && (
              <>
                <Field
                  label="Name"
                  value={gebaeude.name}
                  onSave={(v) => patchEntity(`/api/gebaeude/${gebaeude.id}`, { name: v }).then(onChanged)}
                />
                <Field
                  label="Baujahr"
                  type="number"
                  value={gebaeude.baujahr}
                  onSave={(v) =>
                    patchEntity(`/api/gebaeude/${gebaeude.id}`, { baujahr: Number(v) || undefined }).then(onChanged)
                  }
                />
                <Field
                  label="Anzahl Einheiten"
                  type="number"
                  value={gebaeude.anzahlEinheiten}
                  onSave={(v) =>
                    patchEntity(`/api/gebaeude/${gebaeude.id}`, {
                      anzahlEinheiten: Number(v) || undefined,
                    }).then(onChanged)
                  }
                />
                <Field
                  label="Heizungsart"
                  value={gebaeude.heizungsart}
                  onSave={(v) => patchEntity(`/api/gebaeude/${gebaeude.id}`, { heizungsart: v }).then(onChanged)}
                />
              </>
            )}
            {wohnung && (
              <>
                <Field
                  label="Bezeichnung"
                  value={wohnung.bezeichnung}
                  onSave={(v) =>
                    patchEntity(`/api/wohnungen/${wohnung.id}`, { bezeichnung: v }).then(onChanged)
                  }
                />
                <Field
                  label="Fläche (m²)"
                  type="number"
                  value={wohnung.flaeche}
                  onSave={(v) =>
                    patchEntity(`/api/wohnungen/${wohnung.id}`, { flaeche: Number(v) || undefined }).then(
                      onChanged
                    )
                  }
                />
                <Field
                  label="Zimmer"
                  type="number"
                  value={wohnung.zimmer}
                  onSave={(v) =>
                    patchEntity(`/api/wohnungen/${wohnung.id}`, { zimmer: Number(v) || undefined }).then(onChanged)
                  }
                />
                <Field
                  label="Miteigentumsanteil"
                  type="number"
                  value={wohnung.miteigentumsanteil}
                  onSave={(v) =>
                    patchEntity(`/api/wohnungen/${wohnung.id}`, {
                      miteigentumsanteil: Number(v) || undefined,
                    }).then(onChanged)
                  }
                />
              </>
            )}
            {mieter && (
              <>
                <Field
                  label="Name"
                  value={mieter.name}
                  onSave={(v) => patchEntity(`/api/mieter/${mieter.id}`, { name: v }).then(onChanged)}
                />
                <Field
                  label="E-Mail"
                  value={mieter.email}
                  onSave={(v) => patchEntity(`/api/mieter/${mieter.id}`, { email: v }).then(onChanged)}
                />
                <Field
                  label="Telefon"
                  value={mieter.telefon}
                  onSave={(v) => patchEntity(`/api/mieter/${mieter.id}`, { telefon: v }).then(onChanged)}
                />
                <Field
                  label="Mietbeginn"
                  type="date"
                  value={mieter.mietbeginn}
                  onSave={(v) => patchEntity(`/api/mieter/${mieter.id}`, { mietbeginn: v }).then(onChanged)}
                />
                <Field
                  label="Mietende"
                  type="date"
                  value={mieter.mietende}
                  onSave={(v) => patchEntity(`/api/mieter/${mieter.id}`, { mietende: v }).then(onChanged)}
                />
                <Field
                  label="Kaltmiete (€)"
                  type="number"
                  value={mieter.kaltmiete}
                  onSave={(v) =>
                    patchEntity(`/api/mieter/${mieter.id}`, { kaltmiete: Number(v) || undefined }).then(
                      onChanged
                    )
                  }
                />
                <Field
                  label="NK-Vorauszahlung (€)"
                  type="number"
                  value={mieter.nebenkostenVorauszahlung}
                  onSave={(v) =>
                    patchEntity(`/api/mieter/${mieter.id}`, {
                      nebenkostenVorauszahlung: Number(v) || undefined,
                    }).then(onChanged)
                  }
                />
                {/* Verknüpfte Mietverträge + Wohnung */}
                <div className="col-span-full mt-2 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Verknüpfungen</p>
                  {mieterWohnung && (
                    <p>
                      Wohnung:{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => onSelect({ type: "wohnung", id: mieterWohnung.id })}
                      >
                        {mieterWohnung.bezeichnung} ↗
                      </button>
                    </p>
                  )}
                  {(() => {
                    const linked = (data.mietvertraege || []).filter(
                      (mv) =>
                        mv.mieterId === mieter.id ||
                        (!mv.mieterId && mv.wohnungId === mieter.wohnungId)
                    );
                    if (linked.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          Kein Mietvertrag verknüpft.{" "}
                          <a href="/mietvertraege" className="text-primary hover:underline">
                            Hochladen / zuordnen ↗
                          </a>
                        </p>
                      );
                    }
                    return linked.map((mv) => (
                      <p key={mv.id}>
                        Mietvertrag:{" "}
                        <a href={`/mietvertraege?id=${mv.id}`} className="text-primary hover:underline">
                          {mv.dateiName || mv.nummer || mv.id.slice(0, 8)} ↗
                        </a>
                        {mv.storedFileName && (
                          <>
                            {" · "}
                            <a
                              href={`/api/files/${mv.storedFileName}?mime=${encodeURIComponent(
                                mv.mimeType
                              )}&name=${encodeURIComponent(mv.dateiName)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              👁 Datei ansehen
                            </a>
                          </>
                        )}
                        {mv.sollMiete != null ? ` · ${mv.sollMiete} €` : ""}
                        {mv.mietbeginn ? ` · ab ${mv.mietbeginn}` : ""}
                        {!mv.mieterId ? " · (nur über Wohnung verknüpft)" : ""}
                      </p>
                    ));
                  })()}
                  {mieterLiegenschaft && (
                    <p>
                      PM-Vertrag:{" "}
                      <a
                        href={`/liegenschaften?select=liegenschaft:${mieterLiegenschaft.id}&tab=PM-Vertrag`}
                        className="text-primary hover:underline"
                      >
                        {mieterLiegenschaft.name} ↗
                      </a>
                    </p>
                  )}
                </div>
              </>
            )}
            {wohnung && (
              <div className="col-span-full mt-2 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">Mietverträge & Mieter dieser Einheit</p>
                {(data.mieter || [])
                  .filter((m) => m.wohnungId === wohnung.id)
                  .map((m) => (
                    <p key={m.id}>
                      Mieter:{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => onSelect({ type: "mieter", id: m.id })}
                      >
                        {m.name} ↗
                      </button>
                    </p>
                  ))}
                {(data.mietvertraege || [])
                  .filter((mv) => mv.wohnungId === wohnung.id)
                  .map((mv) => (
                    <p key={mv.id}>
                      Vertrag:{" "}
                      <a href={`/mietvertraege?id=${mv.id}`} className="text-primary hover:underline">
                        {mv.dateiName || mv.nummer || "Dokument"} ↗
                      </a>
                    </p>
                  ))}
                {(data.mietvertraege || []).filter((mv) => mv.wohnungId === wohnung.id).length === 0 && (
                  <p className="text-xs text-muted-foreground">Noch kein Mietvertrag für diese Wohnung.</p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "Struktur" && (
          <StructureTab
            data={data}
            liegenschaft={liegenschaft}
            gebaeude={gebaeude}
            wohnung={wohnung}
            onSelect={onSelect}
            onChanged={onChanged}
          />
        )}

        {tab === "Eigentümer" && liegenschaft && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                ref={eigFileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleEigentuemerUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                disabled={eigUploading}
                onClick={() => eigFileInputRef.current?.click()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {eigUploading ? "Analysiere…" : "＋ Dokument hochladen"}
              </button>
              <button
                onClick={() => setEigManuellOpen((v) => !v)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                {eigManuellOpen ? "Abbrechen" : "＋ Eigentümer manuell anlegen"}
              </button>
            </div>
            {eigMsg && <p className="mb-4 text-sm">{eigMsg}</p>}

            {eigManuellOpen && (
              <div className="mb-4 grid max-w-xl grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3">
                <input
                  value={eigForm.name}
                  onChange={(e) => setEigForm({ ...eigForm, name: e.target.value })}
                  placeholder="Name"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={eigForm.anschrift}
                  onChange={(e) => setEigForm({ ...eigForm, anschrift: e.target.value })}
                  placeholder="Anschrift"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={eigForm.email}
                  onChange={(e) => setEigForm({ ...eigForm, email: e.target.value })}
                  placeholder="E-Mail"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={eigForm.telefon}
                  onChange={(e) => setEigForm({ ...eigForm, telefon: e.target.value })}
                  placeholder="Telefon"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  value={eigForm.miteigentumsanteil}
                  onChange={(e) => setEigForm({ ...eigForm, miteigentumsanteil: e.target.value })}
                  placeholder="MEA (‰)"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <button
                  onClick={submitEigentuemerManuell}
                  disabled={!eigForm.name.trim()}
                  className="col-span-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Anlegen
                </button>
              </div>
            )}

            {scopedEigentuemer.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Eigentümer hinterlegt.</p>
            ) : (
              <div className="space-y-2">
                {scopedEigentuemer.map((eg) => (
                  <div key={eg.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{eg.name}</span>
                      {eg.storedFileName && (
                        <a
                          href={`/api/files/${eg.storedFileName}?mime=${encodeURIComponent(
                            eg.mimeType || "application/pdf"
                          )}&name=${encodeURIComponent(eg.dateiName || eg.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          👁 Ansehen
                        </a>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {eg.anschrift && <span>{eg.anschrift}</span>}
                      {eg.email && <span>{eg.email}</span>}
                      {eg.miteigentumsanteil ? <span>MEA: {eg.miteigentumsanteil}/1000</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "PM-Vertrag" && liegenschaft && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                ref={pmFileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePmVertragUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                disabled={pmUploading}
                onClick={() => pmFileInputRef.current?.click()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pmUploading ? "Analysiere…" : "＋ PM-Vertrag hochladen"}
              </button>
              <button
                onClick={() => setPmManuellOpen((v) => !v)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                {pmManuellOpen ? "Abbrechen" : "＋ PM-Vertrag manuell anlegen"}
              </button>
            </div>
            {pmMsg && <p className="mb-4 text-sm">{pmMsg}</p>}

            {pmManuellOpen && (
              <div className="mb-4 grid max-w-xl grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3">
                <input
                  value={pmForm.verwalterName}
                  onChange={(e) => setPmForm({ ...pmForm, verwalterName: e.target.value })}
                  placeholder="Verwalter / Property Manager"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={pmForm.auftraggeberName}
                  onChange={(e) => setPmForm({ ...pmForm, auftraggeberName: e.target.value })}
                  placeholder="Auftraggeber"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={pmForm.honorarModell}
                  onChange={(e) => setPmForm({ ...pmForm, honorarModell: e.target.value })}
                  placeholder="Honorarmodell (z.B. je Einheit)"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  value={pmForm.honorarSatz}
                  onChange={(e) => setPmForm({ ...pmForm, honorarSatz: e.target.value })}
                  placeholder="Honorarsatz"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={pmForm.laufzeitBeginn}
                  onChange={(e) => setPmForm({ ...pmForm, laufzeitBeginn: e.target.value })}
                  placeholder="Laufzeitbeginn"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={pmForm.kuendigungsfrist}
                  onChange={(e) => setPmForm({ ...pmForm, kuendigungsfrist: e.target.value })}
                  placeholder="Kündigungsfrist"
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={pmForm.leistungsumfang}
                  onChange={(e) => setPmForm({ ...pmForm, leistungsumfang: e.target.value })}
                  placeholder="Leistungsumfang"
                  className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                />
                <button
                  onClick={submitPmVertragManuell}
                  disabled={!pmForm.verwalterName.trim()}
                  className="col-span-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Anlegen
                </button>
              </div>
            )}

            {scopedPmVertraege.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine PM-Verträge hinterlegt.</p>
            ) : (
              <div className="space-y-2">
                {scopedPmVertraege.map((pm) => (
                  <div key={pm.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{pm.verwalterName || pm.dateiName}</span>
                      {pm.storedFileName && (
                        <a
                          href={`/api/files/${pm.storedFileName}?mime=${encodeURIComponent(
                            pm.mimeType
                          )}&name=${encodeURIComponent(pm.dateiName)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          👁 Ansehen
                        </a>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {pm.honorarModell && <span>Honorar: {pm.honorarModell}</span>}
                      {pm.laufzeitBeginn && <span>Beginn: {pm.laufzeitBeginn}</span>}
                      {pm.kuendigungsfrist && <span>Kündigung: {pm.kuendigungsfrist}</span>}
                      <span>Status: {pm.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Abrechnungen" && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {uploading ? "Analysiere…" : "＋ Rechnung/Abrechnung hochladen"}
              </button>
            </div>
            {uploadMsg && <p className="mb-4 text-sm">{uploadMsg}</p>}

            {scopedAbrechnungen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Abrechnungen zugeordnet.
              </p>
            ) : (
              <div className="space-y-2">
                {scopedAbrechnungen.map((a) => (
                  <a
                    key={a.id}
                    href="/"
                    className="block rounded-md border border-border p-3 text-sm hover:bg-muted"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {a.nummer && (
                          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                            {a.nummer}
                          </span>
                        )}
                        {a.name}
                      </span>
                      <span className="text-muted-foreground">{formatCurrency(a.gesamtSumme)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.zeitraum} · {a.status}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Dokumente" && mieter && (
          <div className="space-y-2">
            {mieterDokumente.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine Dokumente für diesen Mieter.{" "}
                <a href="/mietvertraege" className="text-primary hover:underline">
                  Mietvertrag hochladen ↗
                </a>
              </p>
            )}
            {mieterDokumente.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                <div>
                  <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {d.art}
                  </span>
                  <span className="font-medium">{d.name}</span>
                  {d.datum && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      · {new Date(d.datum).toLocaleDateString("de-DE")}
                    </span>
                  )}
                </div>
                {d.storedFileName && (
                  <a
                    href={`/api/files/${d.storedFileName}?mime=${encodeURIComponent(
                      d.mimeType
                    )}&name=${encodeURIComponent(d.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    👁 Ansehen
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "Dokumente" && !mieter && (
          <div className="space-y-2">
            {scopedDokumente.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>
            )}
            {scopedDokumente.map((d) => {
              const freigegeben = d.pruefung?.zahlungsfreigabe?.status === "freigegeben";
              return (
                <div key={d.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {d.nummer && (
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {d.nummer}
                        </span>
                      )}
                      {d.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {d.pruefung && <ProgressRing percent={d.pruefung.score * 100} />}
                      {d.storedFileName && (
                        <a
                          href={`/api/files/${d.storedFileName}?mime=${encodeURIComponent(
                            d.mimeType
                          )}&name=${encodeURIComponent(d.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          👁 Ansehen
                        </a>
                      )}
                      <button
                        onClick={() => freigeben(d.abrechnung, d)}
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-medium",
                          freigegeben
                            ? "bg-[var(--success-bg)] text-[var(--success)]"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {freigegeben ? "✓ Freigegeben" : "Freigeben"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {d.rechnungsnummer && <span>Nr.: {d.rechnungsnummer}</span>}
                    {d.rechnungsdatum && <span>Datum: {d.rechnungsdatum}</span>}
                    {d.firma && <span>Firma: {d.firma}</span>}
                    {typeof d.betrag === "number" && d.betrag > 0 && (
                      <span>Betrag: {formatCurrency(d.betrag)}</span>
                    )}
                    {d.leistungsart && <span>Leistung: {d.leistungsart}</span>}
                    {d.leistungsort && <span>Ort: {d.leistungsort}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "Soll/Ist Vorauszahlungen" && mieter && (
          <SollIstTab mieter={mieter} onChanged={onChanged} />
        )}

        {tab === "Mietkonto" && mieter && (
          <MietkontoTab mieter={mieter} onChanged={onChanged} />
        )}

        {tab === "Schriftverkehr" && mieter && (
          <SchriftverkehrPanel
            mieter={mieter}
            wohnung={mieterWohnung}
            gebaeude={mieterGebaeude}
            liegenschaft={mieterLiegenschaft}
          />
        )}
      </div>

      {liegenschaftVorschlag && (
        <Modal title="Neue Liegenschaft anlegen?" onClose={() => setLiegenschaftVorschlag(null)}>
          <p className="mb-3 text-sm text-muted-foreground">
            Die erkannte Adresse <strong>„{liegenschaftVorschlag.grund}"</strong> passt zu keiner
            bestehenden Liegenschaft. Soll eine neue angelegt werden? Die Stammdaten werden
            automatisch vorausgefüllt.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-xs">
            <span>Straße: {liegenschaftVorschlag.strasse || "–"}</span>
            <span>Hausnr.: {liegenschaftVorschlag.hausnummer || "–"}</span>
            <span>PLZ: {liegenschaftVorschlag.plz || "–"}</span>
            <span>Ort: {liegenschaftVorschlag.ort || "–"}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setLiegenschaftVorschlag(null)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Nicht jetzt
            </button>
            <button
              onClick={liegenschaftAnlegen}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Liegenschaft anlegen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StructureTab({
  data,
  liegenschaft,
  gebaeude,
  wohnung,
  onSelect,
  onChanged,
}: {
  data: HierarchyData;
  liegenschaft?: Liegenschaft;
  gebaeude?: Gebaeude;
  wohnung?: Wohnung;
  onSelect: (sel: NodeSelection) => void;
  onChanged: () => void;
}) {
  if (liegenschaft) {
    const list = data.gebaeude.filter((g) => g.liegenschaftId === liegenschaft.id);
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Gebäude dieser Liegenschaft</h3>
        {list.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Gebäude.</p>}
        {list.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelect({ type: "gebaeude", id: g.id })}
            className="block w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted"
          >
            🏢 {g.name} {g.baujahr ? `· Baujahr ${g.baujahr}` : ""}
          </button>
        ))}
      </div>
    );
  }
  if (gebaeude) {
    const list = data.wohnungen.filter((w) => w.gebaeudeId === gebaeude.id);
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Wohnungen/Einheiten dieses Gebäudes</h3>
        {list.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Einheiten.</p>}
        {list.map((w) => (
          <button
            key={w.id}
            onClick={() => onSelect({ type: "wohnung", id: w.id })}
            className="block w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted"
          >
            🚪 {w.bezeichnung} {w.flaeche ? `· ${w.flaeche} m²` : ""}
          </button>
        ))}
      </div>
    );
  }
  if (wohnung) {
    const list = data.mieter.filter((m) => m.wohnungId === wohnung.id);
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Mieter dieser Einheit</h3>
        {list.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Mieter hinterlegt.</p>}
        {list.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect({ type: "mieter", id: m.id })}
            className="block w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted"
          >
            🧑 {m.name} {m.mietbeginn ? `· seit ${formatDate(m.mietbeginn)}` : ""}
          </button>
        ))}
      </div>
    );
  }
  return null;
}

function SollIstTab({ mieter, onChanged }: { mieter: Mieter; onChanged: () => void }) {
  const [jahr, setJahr] = useState(String(new Date().getFullYear()));
  const [soll, setSoll] = useState("");
  const [ist, setIst] = useState("");
  const entries = mieter.sollIst || [];

  const addEntry = async () => {
    const eintrag: SollIstEintrag = {
      id: crypto.randomUUID(),
      jahr,
      sollVorauszahlung: Number(soll) || 0,
      istZahlungen: Number(ist) || 0,
    };
    await patchEntity(`/api/mieter/${mieter.id}`, { sollIst: [...entries, eintrag] });
    setSoll("");
    setIst("");
    onChanged();
  };

  const removeEntry = async (id: string) => {
    await patchEntity(`/api/mieter/${mieter.id}`, {
      sollIst: entries.filter((e) => e.id !== id),
    });
    onChanged();
  };

  return (
    <div>
      <table className="mb-4 w-full max-w-xl text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5">Jahr</th>
            <th className="py-1.5">Soll</th>
            <th className="py-1.5">Ist</th>
            <th className="py-1.5">Differenz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/50">
              <td className="py-1.5">{e.jahr}</td>
              <td className="py-1.5">{formatCurrency(e.sollVorauszahlung)}</td>
              <td className="py-1.5">{formatCurrency(e.istZahlungen)}</td>
              <td
                className={cn(
                  "py-1.5",
                  e.istZahlungen - e.sollVorauszahlung < 0
                    ? "text-[var(--destructive)]"
                    : "text-[var(--success)]"
                )}
              >
                {formatCurrency(e.istZahlungen - e.sollVorauszahlung)}
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => removeEntry(e.id)}
                  className="text-xs text-muted-foreground hover:text-[var(--destructive)]"
                >
                  entfernen
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-sm text-muted-foreground">
                Noch keine Einträge.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex max-w-xl items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Jahr</span>
          <input
            value={jahr}
            onChange={(e) => setJahr(e.target.value)}
            className="w-24 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Soll (€)</span>
          <input
            type="number"
            value={soll}
            onChange={(e) => setSoll(e.target.value)}
            className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Ist (€)</span>
          <input
            type="number"
            value={ist}
            onChange={(e) => setIst(e.target.value)}
            className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={addEntry}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Hinzufügen
        </button>
      </div>
    </div>
  );
}

const MIETKONTO_TYPEN: MietkontoBuchungTyp[] = ["Miete", "Nebenkosten", "Kaution", "Sonstiges"];

function MietkontoTab({ mieter, onChanged }: { mieter: Mieter; onChanged: () => void }) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [typ, setTyp] = useState<MietkontoBuchungTyp>("Miete");
  const [soll, setSoll] = useState(mieter.kaltmiete ? String(mieter.kaltmiete) : "");
  const [ist, setIst] = useState("");
  const [text, setText] = useState("");
  const entries = mieter.mietkonto || [];
  const rueckstand = mietRueckstand(mieter);
  const fehlend = fehlendeSollstellungen(mieter);

  const nachbuchen = async () => {
    if (fehlend.length === 0) return;
    const sorted = [...entries, ...fehlend].sort((a, b) => a.datum.localeCompare(b.datum));
    await patchEntity(`/api/mieter/${mieter.id}`, { mietkonto: sorted });
    onChanged();
  };

  const addEntry = async () => {
    const buchung: MietkontoBuchung = {
      id: crypto.randomUUID(),
      datum,
      typ,
      soll: Number(soll) || 0,
      ist: Number(ist) || 0,
      text: text || undefined,
    };
    const sorted = [...entries, buchung].sort((a, b) => a.datum.localeCompare(b.datum));
    await patchEntity(`/api/mieter/${mieter.id}`, { mietkonto: sorted });
    setIst("");
    setText("");
    onChanged();
  };

  const removeEntry = async (id: string) => {
    await patchEntity(`/api/mieter/${mieter.id}`, {
      mietkonto: entries.filter((e) => e.id !== id),
    });
    onChanged();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className={cn(
            "inline-flex max-w-xl items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            rueckstand > 0
              ? "border-[var(--destructive)]/30 bg-[var(--danger-bg)] text-[var(--destructive)]"
              : "border-[var(--success)]/30 bg-[var(--success-bg)] text-[var(--success)]"
          )}
        >
          {rueckstand > 0
            ? `⚠️ Mietrückstand: ${formatCurrency(rueckstand)}`
            : rueckstand < 0
            ? `Guthaben: ${formatCurrency(-rueckstand)}`
            : "✅ Mietkonto ausgeglichen"}
        </div>
        {fehlend.length > 0 && (
          <button
            onClick={nachbuchen}
            className="rounded-lg border border-primary/40 bg-secondary px-3 py-2 text-sm font-medium text-primary hover:bg-secondary/80"
            title={`Bucht ${fehlend.length} fehlende Monats-Sollstellung(en) nach`}
          >
            📅 {fehlend.length} fehlende Sollstellung{fehlend.length > 1 ? "en" : ""} nachbuchen
          </button>
        )}
      </div>

      <table className="mb-4 w-full max-w-2xl text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5">Datum</th>
            <th className="py-1.5">Typ</th>
            <th className="py-1.5">Soll</th>
            <th className="py-1.5">Ist</th>
            <th className="py-1.5">Saldo</th>
            <th className="py-1.5">Notiz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/50">
              <td className="py-1.5">{formatDate(e.datum)}</td>
              <td className="py-1.5">{e.typ}</td>
              <td className="py-1.5">{formatCurrency(e.soll)}</td>
              <td className="py-1.5">{formatCurrency(e.ist)}</td>
              <td
                className={cn(
                  "py-1.5",
                  e.soll - e.ist > 0 ? "text-[var(--destructive)]" : "text-[var(--success)]"
                )}
              >
                {formatCurrency(e.soll - e.ist)}
              </td>
              <td className="py-1.5 text-muted-foreground">{e.text}</td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => removeEntry(e.id)}
                  className="text-xs text-muted-foreground hover:text-[var(--destructive)]"
                >
                  entfernen
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-sm text-muted-foreground">
                Noch keine Buchungen. Lege z.B. pro Monat eine Miet-Buchung mit Soll/Ist an.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex max-w-2xl flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Datum</span>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="w-36 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Typ</span>
          <select
            value={typ}
            onChange={(e) => setTyp(e.target.value as MietkontoBuchungTyp)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            {MIETKONTO_TYPEN.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Soll (€)</span>
          <input
            type="number"
            value={soll}
            onChange={(e) => setSoll(e.target.value)}
            className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Ist (€)</span>
          <input
            type="number"
            value={ist}
            onChange={(e) => setIst(e.target.value)}
            className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block flex-1 min-w-[10rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Notiz</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z.B. Überweisung Mai"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={addEntry}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Buchen
        </button>
      </div>
    </div>
  );
}
