"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Gebaeude, Liegenschaft, Wohnung } from "@/lib/types";

type Kind = "liegenschaft" | "gebaeude" | "wohnung" | "mieter" | "rechnung" | "mietvertrag" | "abrechnung";

const OPTIONS: { kind: Kind; label: string; icon: string; needsParent?: "liegenschaft" | "gebaeude" | "wohnung" }[] = [
  { kind: "liegenschaft", label: "Liegenschaft", icon: "🏠" },
  { kind: "gebaeude", label: "Gebäude", icon: "🏢", needsParent: "liegenschaft" },
  { kind: "wohnung", label: "Wohnung/Einheit", icon: "🚪", needsParent: "gebaeude" },
  { kind: "mieter", label: "Mieter", icon: "🧑", needsParent: "wohnung" },
  { kind: "rechnung", label: "Rechnung hochladen", icon: "🧾" },
  { kind: "mietvertrag", label: "Mietvertrag hochladen", icon: "📄" },
];

export default function QuickCreate() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/liegenschaften").then((r) => r.json()),
      fetch("/api/gebaeude").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
    ]).then(([l, g, w]) => {
      setLiegenschaften(l.liegenschaften || []);
      setGebaeude(g.gebaeude || []);
      setWohnungen(w.wohnungen || []);
    });
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActive(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const option = OPTIONS.find((o) => o.kind === active);
  const parentOptions =
    option?.needsParent === "liegenschaft"
      ? liegenschaften.map((l) => ({ id: l.id, label: l.name }))
      : option?.needsParent === "gebaeude"
      ? gebaeude.map((g) => ({ id: g.id, label: g.name }))
      : option?.needsParent === "wohnung"
      ? wohnungen.map((w) => ({ id: w.id, label: w.bezeichnung }))
      : [];

  const reset = () => {
    setActive(null);
    setName("");
    setParentId("");
    setMsg(null);
  };

  const submit = async () => {
    if (!active || !option) return;
    if (option.needsParent && !parentId) return;
    if (!name.trim() && active !== "rechnung" && active !== "mietvertrag") return;

    setBusy(true);
    try {
      let url = "";
      let body: Record<string, unknown> = {};
      if (active === "liegenschaft") {
        url = "/api/liegenschaften";
        body = { name };
      } else if (active === "gebaeude") {
        url = "/api/gebaeude";
        body = { liegenschaftId: parentId, name };
      } else if (active === "wohnung") {
        url = "/api/wohnungen";
        body = { gebaeudeId: parentId, bezeichnung: name };
      } else if (active === "mieter") {
        url = "/api/mieter";
        body = { wohnungId: parentId, name };
      }
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMsg("✅ Angelegt");
      router.push("/liegenschaften");
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 600);
    } finally {
      setBusy(false);
    }
  };

  const startUpload = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    setBusy(true);
    setMsg("Analysiere…");
    const fd = new FormData();
    fd.append("file", file);
    const endpoint = active === "mietvertrag" ? "/api/mietvertraege/analyze" : "/api/analyze";
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Fehlgeschlagen");
      } else {
        setMsg("✅ Erkannt");
        router.push(active === "mietvertrag" ? "/mietvertraege" : "/rechnungen");
        setTimeout(() => {
          setOpen(false);
          reset();
        }, 600);
      }
    } catch {
      setMsg("Fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={menuRef} className="relative no-print">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => {
          setOpen((v) => !v);
          if (open) reset();
        }}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-md transition-transform hover:scale-105"
        title="Neu anlegen"
      >
        {open ? "✕" : "＋"}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 rounded-xl border border-border bg-card p-2 shadow-xl">
          {!active ? (
            <div className="space-y-0.5">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Neu anlegen
              </p>
              {OPTIONS.map((o) => (
                <button
                  key={o.kind}
                  onClick={() => {
                    setActive(o.kind);
                    if (o.kind === "rechnung" || o.kind === "mietvertrag") {
                      setTimeout(startUpload, 50);
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          ) : active === "rechnung" || active === "mietvertrag" ? (
            <div className="p-2 text-sm text-muted-foreground">{msg || "Datei auswählen…"}</div>
          ) : (
            <div className="space-y-3 p-2">
              <p className="text-sm font-semibold">
                {option?.icon} {option?.label}
              </p>
              {option?.needsParent && (
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">— übergeordnetes Objekt wählen —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name / Bezeichnung"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={reset} className="rounded-md px-2 py-1 text-xs hover:bg-muted">
                  Zurück
                </button>
                <button
                  onClick={submit}
                  disabled={busy || (option?.needsParent && !parentId) || !name.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Anlegen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
