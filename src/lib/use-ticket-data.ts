"use client";

import { useCallback, useEffect, useState } from "react";
import { Gebaeude, Handwerker, Liegenschaft, Mieter, Ticket, Wohnung } from "@/lib/types";

export interface TicketSystemData {
  tickets: Ticket[];
  handwerker: Handwerker[];
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
}

const EMPTY: TicketSystemData = {
  tickets: [],
  handwerker: [],
  liegenschaften: [],
  gebaeude: [],
  wohnungen: [],
  mieter: [],
};

export function useTicketData() {
  const [data, setData] = useState<TicketSystemData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, h, l, g, w, m] = await Promise.all([
        fetch("/api/tickets").then((r) => r.json()),
        fetch("/api/handwerker").then((r) => r.json()),
        fetch("/api/liegenschaften").then((r) => r.json()),
        fetch("/api/gebaeude").then((r) => r.json()),
        fetch("/api/wohnungen").then((r) => r.json()),
        fetch("/api/mieter").then((r) => r.json()),
      ]);
      setData({
        tickets: t.tickets || [],
        handwerker: h.handwerker || [],
        liegenschaften: l.liegenschaften || [],
        gebaeude: g.gebaeude || [],
        wohnungen: w.wohnungen || [],
        mieter: m.mieter || [],
      });
      setError(null);
    } catch {
      setError("Ticketsystem-Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

/** Baut einen sprechenden Objektpfad "Liegenschaft -> Gebaeude -> Wohnung (Mieter)" fuer die Anzeige im Ticket. */
export function objektPfad(
  data: TicketSystemData,
  t: Pick<Ticket, "liegenschaftId" | "gebaeudeId" | "wohnungId" | "mieterId">
): string {
  const teile: string[] = [];
  const l = data.liegenschaften.find((x) => x.id === t.liegenschaftId);
  const g = data.gebaeude.find((x) => x.id === t.gebaeudeId);
  const w = data.wohnungen.find((x) => x.id === t.wohnungId);
  const m = data.mieter.find((x) => x.id === t.mieterId);
  if (l) teile.push(l.name);
  if (g) teile.push(g.name);
  if (w) teile.push(w.bezeichnung);
  if (m) teile.push(`Mieter: ${m.name}`);
  return teile.join(" \u203a ");
}
