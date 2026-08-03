"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Abrechnung,
  Eigentuemer,
  Gebaeude,
  Liegenschaft,
  Mieter,
  Mietvertrag,
  PmVertrag,
  Wohnung,
} from "@/lib/types";

export interface HierarchyData {
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
  abrechnungen: Abrechnung[];
  eigentuemer: Eigentuemer[];
  pmVertraege: PmVertrag[];
  mietvertraege: Mietvertrag[];
}

const EMPTY: HierarchyData = {
  liegenschaften: [],
  gebaeude: [],
  wohnungen: [],
  mieter: [],
  abrechnungen: [],
  eigentuemer: [],
  pmVertraege: [],
  mietvertraege: [],
};

export function useHierarchyData() {
  const [data, setData] = useState<HierarchyData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, g, w, m, a, e, p, mv] = await Promise.all([
        fetch("/api/liegenschaften").then((r) => r.json()),
        fetch("/api/gebaeude").then((r) => r.json()),
        fetch("/api/wohnungen").then((r) => r.json()),
        fetch("/api/mieter").then((r) => r.json()),
        fetch("/api/abrechnungen").then((r) => r.json()),
        fetch("/api/eigentuemer").then((r) => r.json()),
        fetch("/api/pm-vertrag").then((r) => r.json()),
        fetch("/api/mietvertraege").then((r) => r.json()),
      ]);
      setData({
        liegenschaften: l.liegenschaften || [],
        gebaeude: g.gebaeude || [],
        wohnungen: w.wohnungen || [],
        mieter: m.mieter || [],
        abrechnungen: a.abrechnungen || [],
        eigentuemer: e.eigentuemer || [],
        pmVertraege: p.pmVertraege || [],
        mietvertraege: mv.mietvertraege || [],
      });
      setError(null);
    } catch {
      setError("Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
