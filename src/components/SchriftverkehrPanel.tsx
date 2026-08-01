"use client";

import { useEffect, useState } from "react";
import { Mieter, Wohnung, Gebaeude, Liegenschaft } from "@/lib/types";
import {
  SCHRIFTVERKEHR_TEMPLATES,
  SchriftverkehrTemplate,
  renderBrief,
  initialWerte,
  heuteDe,
} from "@/lib/schriftverkehr";
import { cn } from "@/lib/utils";

interface Props {
  mieter: Mieter;
  wohnung?: Wohnung;
  gebaeude?: Gebaeude;
  liegenschaft?: Liegenschaft;
}

export default function SchriftverkehrPanel({ mieter, wohnung, gebaeude, liegenschaft }: Props) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [kopiert, setKopiert] = useState(false);

  const template = SCHRIFTVERKEHR_TEMPLATES.find((t) => t.id === templateId) || null;
  const basisKontext = { mieter, wohnung, gebaeude, liegenschaft, heute: heuteDe() };

  useEffect(() => {
    if (!template) return;
    const initial = initialWerte(template, basisKontext);
    setWerte(initial);
    setText(renderBrief(template, { ...basisKontext, werte: initial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const aktualisieren = (patch: Record<string, string>) => {
    const neueWerte = { ...werte, ...patch };
    setWerte(neueWerte);
    if (template) setText(renderBrief(template, { ...basisKontext, werte: neueWerte }));
  };

  const kopieren = async () => {
    await navigator.clipboard.writeText(text);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 1500);
  };

  const herunterladen = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template?.id || "schreiben"}_${mieter.name.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Vorlage wählen – Stammdaten von <strong>{mieter.name}</strong>
        {wohnung ? ` (${wohnung.bezeichnung})` : ""} werden automatisch übernommen.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {SCHRIFTVERKEHR_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors",
              templateId === t.id
                ? "border-primary bg-secondary font-medium"
                : "border-border hover:bg-muted"
            )}
          >
            <span className="text-base">{t.icon}</span>
            <span className="leading-tight">{t.label}</span>
          </button>
        ))}
      </div>

      {template && (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-2">
            {template.fields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Diese Vorlage benötigt keine zusätzlichen Angaben.
              </p>
            )}
            {template.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{f.label}</span>
                {f.type === "textarea" ? (
                  <textarea
                    value={werte[f.key] || ""}
                    onChange={(e) => aktualisieren({ [f.key]: e.target.value })}
                    rows={3}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  />
                ) : (
                  <input
                    type={f.type}
                    value={werte[f.key] || ""}
                    onChange={(e) => aktualisieren({ [f.key]: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  />
                )}
              </label>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Vorschau (editierbar)</span>
              <div className="flex gap-2">
                <button
                  onClick={kopieren}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {kopiert ? "✓ Kopiert" : "📋 Kopieren"}
                </button>
                <button
                  onClick={herunterladen}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                >
                  ⬇️ Als .txt herunterladen
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={22}
              className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
