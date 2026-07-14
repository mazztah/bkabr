"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { formatCurrency, uid } from "@/lib/utils";
import { Position, Status, ObjektTyp } from "@/lib/types";
import PreviewModal from "./PreviewModal";

type Tab = "rohdaten" | "workspace" | "recht";

export default function WorkspacePanel() {
  const { abrechnungen, selectedId, patchAbrechnung, generateAbrechnung, generateAnschreiben, runRechtCheck, isGenerating, isChecking } =
    useStore();
  const abr = abrechnungen.find((a) => a.id === selectedId);
  const [tab, setTab] = useState<Tab>("rohdaten");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rechtResult, setRechtResult] = useState<string>("");

  if (!abr) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground p-10 text-center">
        <div>
          <div className="text-4xl mb-3">🗂️</div>
          <p>Wähle links eine Abrechnung aus oder lade ein Dokument hoch, um zu starten.</p>
        </div>
      </div>
    );
  }

  const updatePositionen = (positionen: Position[]) => {
    const nebenkosten = positionen.reduce((sum, p) => sum + (Number(p.betrag) || 0), 0);
    patchAbrechnung(abr.id, { workspace: { ...abr.workspace, positionen, nebenkosten } });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <div className="border-b border-border p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <input
            value={abr.name}
            onChange={(e) => patchAbrechnung(abr.id, { name: e.target.value })}
            className="text-xl font-bold bg-transparent outline-none w-full"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            Version {abr.version} • Zuletzt aktualisiert{" "}
            {new Date(abr.updatedAt).toLocaleString("de-DE")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <select
            value={abr.status}
            onChange={(e) => patchAbrechnung(abr.id, { status: e.target.value as Status })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option>Rohdaten</option>
            <option>Validierung</option>
            <option>Fertig</option>
          </select>
          <button
            onClick={() => setPreviewOpen(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            👁️ Vorschau öffnen
          </button>
        </div>
      </div>

      <div className="flex border-b border-border px-5 gap-1">
        {(["rohdaten", "workspace", "recht"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "rohdaten" ? "Rohdaten" : t === "workspace" ? "Live-Workspace" : "Recht & Urteile"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "rohdaten" && (
          <div className="max-w-2xl space-y-4">
            <Field label="Adresse / Objektname">
              <input
                value={abr.adresse}
                onChange={(e) => patchAbrechnung(abr.id, { adresse: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </Field>
            <Field label="Objekttyp">
              <select
                value={abr.objektTyp}
                onChange={(e) => patchAbrechnung(abr.id, { objektTyp: e.target.value as ObjektTyp })}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option>Wohnung</option>
                <option>Haus</option>
                <option>Gewerbe</option>
              </select>
            </Field>
            <Field label="Zeitraum">
              <input
                value={abr.zeitraum}
                onChange={(e) => patchAbrechnung(abr.id, { zeitraum: e.target.value })}
                placeholder="z.B. 01.01.2025 - 31.12.2025"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </Field>
            <Field label="Gesamtsumme (€)">
              <input
                type="number"
                step="0.01"
                value={abr.gesamtSumme}
                onChange={(e) => patchAbrechnung(abr.id, { gesamtSumme: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </Field>

            {abr.dokumente.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 mt-6">Hochgeladene Dokumente</h3>
                <div className="space-y-2">
                  {abr.dokumente.map((d) => (
                    <div key={d.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="font-medium">📄 {d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(d.size / 1024).toFixed(0)} KB • {new Date(d.uploadedAt).toLocaleString("de-DE")}
                      </div>
                      {d.extraktText && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                          {d.extraktText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-4">
              <button
                onClick={() => generateAbrechnung(abr.id)}
                disabled={isGenerating}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isGenerating ? "Generiere …" : "📝 Betriebskostenabrechnung erstellen"}
              </button>
              <button
                onClick={() => generateAnschreiben(abr.id, "Übersendung der Betriebskostenabrechnung")}
                disabled={isGenerating}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {isGenerating ? "Generiere …" : "✉️ Anschreiben erstellen"}
              </button>
            </div>

            {abr.workspace.abrechnungstext && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Generierte Abrechnung</h3>
                <textarea
                  value={abr.workspace.abrechnungstext}
                  onChange={(e) =>
                    patchAbrechnung(abr.id, { workspace: { ...abr.workspace, abrechnungstext: e.target.value } })
                  }
                  rows={10}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
            {abr.workspace.anschreiben && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Generiertes Anschreiben</h3>
                <textarea
                  value={abr.workspace.anschreiben}
                  onChange={(e) =>
                    patchAbrechnung(abr.id, { workspace: { ...abr.workspace, anschreiben: e.target.value } })
                  }
                  rows={10}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
          </div>
        )}

        {tab === "workspace" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Live-Workspace (bearbeitbar)</h3>
              <button
                onClick={() =>
                  updatePositionen([
                    ...abr.workspace.positionen,
                    { id: uid(), name: "Neue Position", betrag: 0, beschreibung: "" },
                  ])
                }
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                ＋ Position hinzufügen
              </button>
            </div>

            <div className="space-y-2">
              {abr.workspace.positionen.map((pos, i) => (
                <div key={pos.id} className="flex flex-wrap gap-2 items-center rounded-md border border-border p-2">
                  <input
                    value={pos.name}
                    onChange={(e) => {
                      const next = [...abr.workspace.positionen];
                      next[i] = { ...pos, name: e.target.value };
                      updatePositionen(next);
                    }}
                    className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="Bezeichnung"
                  />
                  <input
                    value={pos.beschreibung || ""}
                    onChange={(e) => {
                      const next = [...abr.workspace.positionen];
                      next[i] = { ...pos, beschreibung: e.target.value };
                      updatePositionen(next);
                    }}
                    className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="Beschreibung"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={pos.betrag}
                    onChange={(e) => {
                      const next = [...abr.workspace.positionen];
                      next[i] = { ...pos, betrag: parseFloat(e.target.value) || 0 };
                      updatePositionen(next);
                    }}
                    className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => updatePositionen(abr.workspace.positionen.filter((p) => p.id !== pos.id))}
                    className="text-muted-foreground hover:text-destructive px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {abr.workspace.positionen.length === 0 && (
                <p className="text-sm text-muted-foreground">Noch keine Positionen erfasst.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 max-w-md">
              <Field label="Mieteinnahmen (€)">
                <input
                  type="number"
                  step="0.01"
                  value={abr.workspace.mieteinnahmen}
                  onChange={(e) =>
                    patchAbrechnung(abr.id, {
                      workspace: { ...abr.workspace, mieteinnahmen: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </Field>
              <Field label="Nebenkosten Summe (€)">
                <div className="px-3 py-2 rounded-md bg-muted font-mono">
                  {formatCurrency(abr.workspace.nebenkosten)}
                </div>
              </Field>
            </div>
          </div>
        )}

        {tab === "recht" && (
          <div className="max-w-2xl">
            <button
              onClick={async () => setRechtResult(await runRechtCheck(abr.id))}
              disabled={isChecking}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isChecking ? "Prüfe …" : "⚖️ Recht & Urteile prüfen"}
            </button>
            <div className="mt-6 text-sm bg-muted p-4 rounded-xl whitespace-pre-wrap leading-relaxed">
              {rechtResult ||
                "Klicke auf „Recht & Urteile prüfen“, um eine KI-gestützte Einschätzung zur aktuellen Rechtslage (BetrKV, HeizkostenV, BGB) für diese Abrechnung zu erhalten."}
            </div>
          </div>
        )}
      </div>

      {previewOpen && <PreviewModal abrechnung={abr} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}
