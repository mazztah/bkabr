"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HierarchyData } from "@/app/liegenschaften/page";

export type NodeSelection =
  | { type: "liegenschaft"; id: string }
  | { type: "gebaeude"; id: string }
  | { type: "wohnung"; id: string }
  | { type: "mieter"; id: string }
  | null;

interface Props {
  data: HierarchyData;
  selection: NodeSelection;
  onSelect: (sel: NodeSelection) => void;
  onChanged: () => void;
}

function isSel(sel: NodeSelection, type: string, id: string) {
  return !!sel && sel.type === type && sel.id === id;
}

async function createEntity(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function removeEntity(url: string) {
  await fetch(url, { method: "DELETE" });
}

function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        ＋ {placeholder}
      </button>
    );
  }

  const submit = () => {
    if (value.trim()) onAdd(value.trim());
    setValue("");
    setOpen(false);
  };

  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setValue("");
          setOpen(false);
        }
      }}
      className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
    />
  );
}

export default function LiegenschaftenTree({ data, selection, onSelect, onChanged }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (data.liegenschaften.length === 0) {
    return (
      <div className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">Noch keine Liegenschaft angelegt.</p>
        <AddRow
          placeholder="Liegenschaft anlegen…"
          onAdd={async (name) => {
            const { liegenschaft } = await createEntity("/api/liegenschaften", { name });
            onChanged();
            if (liegenschaft) onSelect({ type: "liegenschaft", id: liegenschaft.id });
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-2 text-sm">
      {data.liegenschaften.map((l) => {
        const lOpen = expanded.has(l.id);
        const lGebaeude = data.gebaeude.filter((g) => g.liegenschaftId === l.id);
        return (
          <div key={l.id} className="mb-1">
            <div
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer",
                isSel(selection, "liegenschaft", l.id) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(l.id);
                }}
                className="w-4 shrink-0 text-xs opacity-70"
              >
                {lOpen ? "▾" : "▸"}
              </button>
              <span
                className="flex-1 truncate font-medium"
                onClick={() => onSelect({ type: "liegenschaft", id: l.id })}
              >
                🏠 {l.name}
              </span>
            </div>

            {lOpen && (
              <div className="ml-4 border-l border-border pl-2">
                {lGebaeude.map((g) => {
                  const gOpen = expanded.has(g.id);
                  const gWohnungen = data.wohnungen.filter((w) => w.gebaeudeId === g.id);
                  return (
                    <div key={g.id} className="mb-1">
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer",
                          isSel(selection, "gebaeude", g.id)
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(g.id);
                          }}
                          className="w-4 shrink-0 text-xs opacity-70"
                        >
                          {gOpen ? "▾" : "▸"}
                        </button>
                        <span
                          className="flex-1 truncate"
                          onClick={() => onSelect({ type: "gebaeude", id: g.id })}
                        >
                          🏢 {g.name}
                        </span>
                      </div>

                      {gOpen && (
                        <div className="ml-4 border-l border-border pl-2">
                          {gWohnungen.map((w) => {
                            const wOpen = expanded.has(w.id);
                            const wMieter = data.mieter.filter((m) => m.wohnungId === w.id);
                            return (
                              <div key={w.id} className="mb-1">
                                <div
                                  className={cn(
                                    "flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer",
                                    isSel(selection, "wohnung", w.id)
                                      ? "bg-primary text-primary-foreground"
                                      : "hover:bg-muted"
                                  )}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggle(w.id);
                                    }}
                                    className="w-4 shrink-0 text-xs opacity-70"
                                  >
                                    {wOpen ? "▾" : "▸"}
                                  </button>
                                  <span
                                    className="flex-1 truncate"
                                    onClick={() => onSelect({ type: "wohnung", id: w.id })}
                                  >
                                    🚪 {w.bezeichnung}
                                  </span>
                                </div>

                                {wOpen && (
                                  <div className="ml-4 border-l border-border pl-2">
                                    {wMieter.map((m) => (
                                      <div
                                        key={m.id}
                                        onClick={() => onSelect({ type: "mieter", id: m.id })}
                                        className={cn(
                                          "cursor-pointer truncate rounded px-2 py-1.5",
                                          isSel(selection, "mieter", m.id)
                                            ? "bg-primary text-primary-foreground"
                                            : "hover:bg-muted"
                                        )}
                                      >
                                        🧑 {m.name}
                                      </div>
                                    ))}
                                    <AddRow
                                      placeholder="Mieter…"
                                      onAdd={async (name) => {
                                        const { mieter } = await createEntity("/api/mieter", {
                                          wohnungId: w.id,
                                          name,
                                        });
                                        onChanged();
                                        if (mieter) onSelect({ type: "mieter", id: mieter.id });
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <AddRow
                            placeholder="Wohnung/Einheit…"
                            onAdd={async (name) => {
                              const { wohnung } = await createEntity("/api/wohnungen", {
                                gebaeudeId: g.id,
                                bezeichnung: name,
                              });
                              onChanged();
                              if (wohnung) onSelect({ type: "wohnung", id: wohnung.id });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <AddRow
                  placeholder="Gebäude…"
                  onAdd={async (name) => {
                    const { gebaeude } = await createEntity("/api/gebaeude", {
                      liegenschaftId: l.id,
                      name,
                    });
                    onChanged();
                    if (gebaeude) onSelect({ type: "gebaeude", id: gebaeude.id });
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-2 border-t border-border pt-2">
        <AddRow
          placeholder="Liegenschaft anlegen…"
          onAdd={async (name) => {
            const { liegenschaft } = await createEntity("/api/liegenschaften", { name });
            onChanged();
            if (liegenschaft) onSelect({ type: "liegenschaft", id: liegenschaft.id });
          }}
        />
      </div>
    </div>
  );
}

export { createEntity, removeEntity };
