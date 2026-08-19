"use client";

import { useCallback, useEffect, useState } from "react";
import { Handwerker, Ticket } from "@/lib/types";

export interface TicketSystemData {
  tickets: Ticket[];
  handwerker: Handwerker[];
}

const EMPTY: TicketSystemData = { tickets: [], handwerker: [] };

export function useTicketData() {
  const [data, setData] = useState<TicketSystemData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, h] = await Promise.all([
        fetch("/api/tickets").then((r) => r.json()),
        fetch("/api/handwerker").then((r) => r.json()),
      ]);
      setData({ tickets: t.tickets || [], handwerker: h.handwerker || [] });
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
