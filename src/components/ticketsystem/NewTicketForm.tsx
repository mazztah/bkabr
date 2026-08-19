"use client";

import { useState } from "react";
import { TICKET_PRIORITAETEN, TICKET_QUELLEN, TicketPrioritaet, TicketQuelle } from "@/lib/types";

export default function NewTicketForm({
  onCreated,
  onClose,
}: {
  onCreated: (ticketId: string) => void;
  onClose: () => void;
}) {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [prioritaet, setPrioritaet] = useState<TicketPrioritaet>("mittel");
  const [quelle, setQuelle] = useState<TicketQuelle>("Manuell weitergeleitet");
  const [erstelltVon, setErstelltVon] = useState("");
  const [freigabeErforderlich, setFreigabeErforderlich] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!titel.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titel,
          beschreibung,
          prioritaet,
          quelle,
          erstelltVon,
          freigabeErforderlich,
        }),
      });
      const { ticket } = await res.json();
      if (ticket) onCreated(ticket.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-border p-4">
      <input
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        placeholder="Titel (z.B. „Heizung fällt aus – Whg. 3.OG links“)"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <textarea
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
        placeholder="Beschreibung / Meldung"
        rows={3}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={prioritaet}
          onChange={(e) => setPrioritaet(e.target.value as TicketPrioritaet)}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          {TICKET_PRIORITAETEN.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={quelle}
          onChange={(e) => setQuelle(e.target.value as TicketQuelle)}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          {TICKET_QUELLEN.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>
      <input
        value={erstelltVon}
        onChange={(e) => setErstelltVon(e.target.value)}
        placeholder="Gemeldet von (Mieter/Kollege, optional)"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={freigabeErforderlich}
          onChange={(e) => setFreigabeErforderlich(e.target.checked)}
        />
        Freigabe vor Beauftragung erforderlich
      </label>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy || !titel.trim()}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Anlegen…" : "Ticket anlegen"}
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
