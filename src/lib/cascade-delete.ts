/**
 * Kaskadierendes Löschen und Beenden in der Objekt-Hierarchie:
 * Liegenschaft → Gebäude → Wohnung → Mieter → Mietverträge
 * sowie PM-Verträge / Eigentümer an der Liegenschaft.
 */
import {
  ablageDb,
  eigentuemerDb,
  gebaeudeDb,
  liegenschaftenDb,
  logEvent,
  mieterDb,
  mietvertraegeDb,
  pmVertraegeDb,
  wohnungenDb,
} from "./db";
import { deleteAbrechnung, listAbrechnungen } from "./db";

export type CascadeReport = {
  liegenschaften: number;
  gebaeude: number;
  wohnungen: number;
  mieter: number;
  mietvertraege: number;
  pmVertraege: number;
  eigentuemer: number;
  abrechnungen: number;
};

function emptyReport(): CascadeReport {
  return {
    liegenschaften: 0,
    gebaeude: 0,
    wohnungen: 0,
    mieter: 0,
    mietvertraege: 0,
    pmVertraege: 0,
    eigentuemer: 0,
    abrechnungen: 0,
  };
}

async function deleteMieterTree(mieterId: string, report: CascadeReport) {
  const vertraege = await mietvertraegeDb.list();
  for (const mv of vertraege.filter((v) => v.mieterId === mieterId)) {
    await mietvertraegeDb.remove(mv.id);
    report.mietvertraege++;
  }
  await mieterDb.remove(mieterId);
  report.mieter++;
}

async function deleteWohnungTree(wohnungId: string, report: CascadeReport) {
  const mieter = await mieterDb.list();
  for (const m of mieter.filter((x) => x.wohnungId === wohnungId)) {
    await deleteMieterTree(m.id, report);
  }
  const vertraege = await mietvertraegeDb.list();
  for (const mv of vertraege.filter((v) => v.wohnungId === wohnungId)) {
    await mietvertraegeDb.remove(mv.id);
    report.mietvertraege++;
  }
  await wohnungenDb.remove(wohnungId);
  report.wohnungen++;
}

async function deleteGebaeudeTree(gebaeudeId: string, report: CascadeReport) {
  const wohnungen = await wohnungenDb.list();
  for (const w of wohnungen.filter((x) => x.gebaeudeId === gebaeudeId)) {
    await deleteWohnungTree(w.id, report);
  }
  await gebaeudeDb.remove(gebaeudeId);
  report.gebaeude++;
}

/** Löscht eine Liegenschaft inkl. aller abhängigen Objekte. */
export async function cascadeDeleteLiegenschaft(liegenschaftId: string): Promise<{
  ok: boolean;
  error?: string;
  report: CascadeReport;
  name?: string;
}> {
  const lg = await liegenschaftenDb.get(liegenschaftId);
  if (!lg) return { ok: false, error: "Liegenschaft nicht gefunden", report: emptyReport() };
  const report = emptyReport();

  const gebaeude = await gebaeudeDb.list();
  for (const g of gebaeude.filter((x) => x.liegenschaftId === liegenschaftId)) {
    await deleteGebaeudeTree(g.id, report);
  }

  const pm = await pmVertraegeDb.list();
  for (const p of pm.filter((x) => x.liegenschaftId === liegenschaftId)) {
    await pmVertraegeDb.remove(p.id);
    report.pmVertraege++;
  }

  const eigentuemer = await eigentuemerDb.list();
  for (const e of eigentuemer.filter((x) => x.liegenschaftId === liegenschaftId)) {
    await eigentuemerDb.remove(e.id);
    report.eigentuemer++;
  }

  const abrechnungen = await listAbrechnungen();
  for (const a of abrechnungen.filter((x) => (x as any).liegenschaftId === liegenschaftId)) {
    await deleteAbrechnung(a.id);
    report.abrechnungen++;
  }

  // Ablage-Zuordnungen zu dieser Liegenschaft lösen (Dokument bleibt, Zuordnung weg)
  const ablage = await ablageDb.list();
  for (const d of ablage) {
    if (d.zugeordnetAn?.art === "Liegenschaft" && d.zugeordnetAn.id === liegenschaftId) {
      await ablageDb.update(d.id, {
        zugeordnetAn: undefined,
        status: "neu",
      } as any);
    }
  }

  await liegenschaftenDb.remove(liegenschaftId);
  report.liegenschaften = 1;

  await logEvent(
    "loeschung",
    `Liegenschaft „${lg.name}" kaskadiert gelöscht (Gebäude ${report.gebaeude}, Wohnungen ${report.wohnungen}, Mieter ${report.mieter}, MV ${report.mietvertraege}, PM ${report.pmVertraege}).`,
    { art: "Liegenschaft", id: liegenschaftId }
  );

  return { ok: true, report, name: lg.name };
}

export async function cascadeDeleteGebaeude(gebaeudeId: string) {
  const g = await gebaeudeDb.get(gebaeudeId);
  if (!g) return { ok: false as const, error: "Gebäude nicht gefunden", report: emptyReport() };
  const report = emptyReport();
  await deleteGebaeudeTree(gebaeudeId, report);
  await logEvent("loeschung", `Gebäude „${g.name}" kaskadiert gelöscht.`, {
    art: "Gebäude",
    id: gebaeudeId,
  });
  return { ok: true as const, report, name: g.name };
}

export async function cascadeDeleteWohnung(wohnungId: string) {
  const w = await wohnungenDb.get(wohnungId);
  if (!w) return { ok: false as const, error: "Wohnung nicht gefunden", report: emptyReport() };
  const report = emptyReport();
  await deleteWohnungTree(wohnungId, report);
  await logEvent("loeschung", `Wohnung „${w.bezeichnung}" kaskadiert gelöscht.`, {
    art: "Wohnung",
    id: wohnungId,
  });
  return { ok: true as const, report, name: w.bezeichnung };
}

export async function cascadeDeleteMieter(mieterId: string, withVertraege = true) {
  const m = await mieterDb.get(mieterId);
  if (!m) return { ok: false as const, error: "Mieter nicht gefunden", report: emptyReport() };
  const report = emptyReport();
  if (withVertraege) {
    await deleteMieterTree(mieterId, report);
  } else {
    await mieterDb.remove(mieterId);
    report.mieter = 1;
  }
  await logEvent("loeschung", `Mieter „${m.name}" gelöscht.`, { art: "Mieter", id: mieterId });
  return { ok: true as const, report, name: m.name };
}

/**
 * Beendet einen PM-Vertrag und setzt die zugehörige Liegenschaft auf status „inaktiv“,
 * damit sie aus Analyse-/Prüf-Funktionen herausfällt.
 */
export async function beendePmVertrag(pmVertragId: string): Promise<{
  ok: boolean;
  error?: string;
  pmVertrag?: { id: string; status: string };
  liegenschaft?: { id: string; name: string; status: string };
}> {
  const pm = await pmVertraegeDb.get(pmVertragId);
  if (!pm) return { ok: false, error: "PM-Vertrag nicht gefunden" };

  const updated = await pmVertraegeDb.update(pmVertragId, {
    status: "Beendet",
    laufzeitEnde: pm.laufzeitEnde || new Date().toISOString().slice(0, 10),
  } as any);

  let lgResult: { id: string; name: string; status: string } | undefined;
  if (pm.liegenschaftId) {
    const lg = await liegenschaftenDb.update(pm.liegenschaftId, { status: "inaktiv" } as any);
    if (lg) {
      lgResult = { id: lg.id, name: lg.name, status: (lg as any).status || "inaktiv" };
    }
  }

  await logEvent(
    "aenderung",
    `PM-Vertrag „${pm.dateiName || pm.verwalterName}" beendet – Liegenschaft „${lgResult?.name || pm.liegenschaftId}" auf inaktiv gesetzt.`,
    { art: "PM-Vertrag", id: pmVertragId }
  );

  return {
    ok: true,
    pmVertrag: { id: pmVertragId, status: updated?.status || "Beendet" },
    liegenschaft: lgResult,
  };
}

/** Reaktiviert Liegenschaft (z.B. nach neuem aktivem PM-Vertrag). */
export async function aktiviereLiegenschaft(liegenschaftId: string) {
  const lg = await liegenschaftenDb.update(liegenschaftId, { status: "aktiv" } as any);
  if (!lg) return { ok: false as const, error: "Liegenschaft nicht gefunden" };
  await logEvent("aenderung", `Liegenschaft „${lg.name}" wieder aktiv gesetzt.`, {
    art: "Liegenschaft",
    id: liegenschaftId,
  });
  return { ok: true as const, liegenschaft: lg };
}

export function isLiegenschaftAktiv(lg: { status?: string } | undefined | null): boolean {
  if (!lg) return true;
  const s = (lg.status || "aktiv").toLowerCase();
  return s !== "inaktiv" && s !== "beendet";
}
