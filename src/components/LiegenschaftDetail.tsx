"use client";

import { useMemo, useRef, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Abrechnung, Gebaeude, Liegenschaft, Mieter, SollIstEintrag, Wohnung } from "@/lib/types";
import { HierarchyData } from "@/app/liegenschaften/page";
import { NodeSelection } from "./LiegenschaftenTree";

interface Props {
  data: HierarchyData;
  selection: NodeSelection;
  onSelect: (sel: NodeSelection) => void;
  onChanged: () => void;
}

const TABS = [
  "Stammdaten",
  "Struktur",
  "Abrechnungen",
  "Dokumente",
  "Soll/Ist Vorauszahlungen",
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
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onSave(String(val))}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

export default function LiegenschaftDetail({ data, selection, onSelect, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("Stammdaten");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

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

  const visibleTabs = TABS.filter((t) => {
    if (t === "Struktur" && mieter) return false;
    if (t === "Soll/Ist Vorauszahlungen" && !mieter) return false;
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
            ? `✅ Rechnung erkannt (${pct}% der Merkmale) und im Workspace abgelegt.`
            : `⚠️ Nur ${pct}% der Rechnungsmerkmale erkannt – bitte prüfen.`
        );
        onChanged();
      }
    } catch {
      setUploadMsg("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{subtitle}</p>
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

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
              </>
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
                      <span className="font-medium">{a.name}</span>
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

        {tab === "Dokumente" && (
          <div className="space-y-2">
            {scopedDokumente.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>
            )}
            {scopedDokumente.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.name}</span>
                  {d.pruefung && (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs",
                        d.pruefung.akzeptiert
                          ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : "bg-[var(--danger-bg)] text-[var(--destructive)]"
                      )}
                    >
                      {Math.round(d.pruefung.score * 100)}% Merkmale
                    </span>
                  )}
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
            ))}
          </div>
        )}

        {tab === "Soll/Ist Vorauszahlungen" && mieter && (
          <SollIstTab mieter={mieter} onChanged={onChanged} />
        )}
      </div>
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
