"use client";

import { useState } from "react";
import { HANDWERKER_GEWERKE, HandwerkerGewerk } from "@/lib/types";

export default function NewHandwerkerForm({
  onCreated,
  onClose,
}: {
  onCreated: (handwerkerId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [firma, setFirma] = useState("");
  const [gewerk, setGewerk] = useState<HandwerkerGewerk>("Allgemein");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/handwerker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, firma, gewerk, email, telefon }),
      });
      const { handwerker } = await res.json();
      if (handwerker) onCreated(handwerker.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-border p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name des Handwerkers"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <input
        value={firma}
        onChange={(e) => setFirma(e.target.value)}
        placeholder="Firma (optional)"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <select
        value={gewerk}
        onChange={(e) => setGewerk(e.target.value as HandwerkerGewerk)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      >
        {HANDWERKER_GEWERKE.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail (optional)"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <input
        value={telefon}
        onChange={(e) => setTelefon(e.target.value)}
        placeholder="Telefon (optional)"
        onKeyDown={(e) => e.key === "Enter" && create()}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Anlegen…" : "Anlegen"}
        </button>
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
