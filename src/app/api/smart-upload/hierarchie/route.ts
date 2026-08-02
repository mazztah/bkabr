import { NextRequest, NextResponse } from "next/server";
import { gebaeudeDb, liegenschaftenDb, mieterDb, pmVertraegeDb, wohnungenDb } from "@/lib/db";
import { Anhang, AnhangTyp, EinheitTyp, Gebaeude, Liegenschaft, Mieter, Wohnung } from "@/lib/types";
import { uid } from "@/lib/utils";

interface LiegenschaftInput {
  modus: "vorhanden" | "neu";
  liegenschaftId?: string;
  neu?: { name: string; strasse: string; hausnummer: string; plz: string; ort: string };
}

interface GebaeudeInput {
  key: string;
  uebernehmen: boolean;
  aktion: "neu" | "vorhanden";
  gebaeudeId?: string;
  name: string;
}

interface WohnungInput {
  key: string;
  gebaeudeKey: string;
  uebernehmen: boolean;
  aktion: "neu" | "aktualisieren" | "unveraendert";
  wohnungId?: string;
  bezeichnung: string;
  typ: EinheitTyp;
  flaeche?: number;
  zimmer?: number;
  miteigentumsanteil?: number;
}

interface MieterInput {
  key: string;
  wohnungKey: string;
  uebernehmen: boolean;
  aktion: "neu" | "aktualisieren";
  mieterId?: string;
  name: string;
  kaltmiete?: number;
  nebenkostenVorauszahlung?: number;
  mietbeginn?: string;
  mietende?: string;
}

interface DokumentInput {
  anhangTyp: AnhangTyp;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  extraktText?: string;
  pmVertragId?: string; // falls gesetzt: Dokument zusätzlich als Anhang am PM-Vertrag ablegen
}

/**
 * Übernimmt eine im Sammel-Upload erkannte und vom User bestätigte
 * Gebäude-/Wohnungs-/Mieter-Übersicht in die Stammdaten. Legt fehlende
 * Liegenschaft/Gebäude/Wohnungen/Mieter an und aktualisiert bei bestehenden
 * Wohnungen/Mietern nur die vom User bestätigten Felder. Reihenfolge ist
 * zwingend: Liegenschaft -> Gebäude -> Wohnungen -> Mieter, da jede Stufe
 * die ID der vorigen benötigt.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const liegenschaftInput: LiegenschaftInput = body.liegenschaft;
  const gebaeudeInput: GebaeudeInput[] = body.gebaeude || [];
  const wohnungInput: WohnungInput[] = body.wohnungen || [];
  const mieterInput: MieterInput[] = body.mieter || [];
  const dokument: DokumentInput | undefined = body.dokument;

  if (!liegenschaftInput) {
    return NextResponse.json({ error: "Keine Liegenschaft angegeben" }, { status: 400 });
  }

  const now = () => new Date().toISOString();

  // 1) Liegenschaft auflösen (bestehend oder neu anlegen)
  let liegenschaftId = liegenschaftInput.liegenschaftId;
  if (liegenschaftInput.modus === "neu") {
    const n = liegenschaftInput.neu;
    if (!n?.name?.trim()) {
      return NextResponse.json({ error: "Name der neuen Liegenschaft fehlt" }, { status: 400 });
    }
    const liegenschaft: Liegenschaft = {
      id: uid(),
      name: n.name,
      strasse: n.strasse || "",
      hausnummer: n.hausnummer || "",
      plz: n.plz || "",
      ort: n.ort || "",
      createdAt: now(),
      updatedAt: now(),
    };
    const saved = await liegenschaftenDb.create(liegenschaft);
    liegenschaftId = saved.id;
  }
  if (!liegenschaftId) {
    return NextResponse.json({ error: "Liegenschaft konnte nicht ermittelt werden" }, { status: 400 });
  }

  // 2) Gebäude anlegen (nur die vom User zur Übernahme markierten)
  const gebaeudeIdByKey = new Map<string, string>();
  let angelegtGebaeude = 0;
  for (const g of gebaeudeInput) {
    if (g.aktion === "vorhanden" && g.gebaeudeId) {
      gebaeudeIdByKey.set(g.key, g.gebaeudeId);
      continue;
    }
    if (!g.uebernehmen) continue;
    const gebaeude: Gebaeude = {
      id: uid(),
      liegenschaftId,
      name: g.name || "Gebäude",
      createdAt: now(),
      updatedAt: now(),
    };
    const saved = await gebaeudeDb.create(gebaeude);
    gebaeudeIdByKey.set(g.key, saved.id);
    angelegtGebaeude++;
  }

  // 3) Wohnungen anlegen bzw. aktualisieren
  const wohnungIdByKey = new Map<string, string>();
  let angelegtWohnungen = 0;
  let aktualisiertWohnungen = 0;
  for (const w of wohnungInput) {
    if (!w.uebernehmen) {
      if (w.wohnungId) wohnungIdByKey.set(w.key, w.wohnungId);
      continue;
    }
    if (w.aktion === "neu") {
      const gebaeudeId = gebaeudeIdByKey.get(w.gebaeudeKey);
      if (!gebaeudeId) continue; // zugehöriges Gebäude wurde nicht übernommen
      const wohnung: Wohnung = {
        id: uid(),
        gebaeudeId,
        bezeichnung: w.bezeichnung || "Neue Einheit",
        typ: w.typ || "Wohnung",
        flaeche: w.flaeche,
        zimmer: w.zimmer,
        miteigentumsanteil: w.miteigentumsanteil,
        createdAt: now(),
        updatedAt: now(),
      };
      const saved = await wohnungenDb.create(wohnung);
      wohnungIdByKey.set(w.key, saved.id);
      angelegtWohnungen++;
    } else if (w.wohnungId) {
      const patch: Partial<Wohnung> = {};
      if (w.flaeche !== undefined) patch.flaeche = w.flaeche;
      if (w.zimmer !== undefined) patch.zimmer = w.zimmer;
      if (w.miteigentumsanteil !== undefined) patch.miteigentumsanteil = w.miteigentumsanteil;
      await wohnungenDb.update(w.wohnungId, patch);
      wohnungIdByKey.set(w.key, w.wohnungId);
      aktualisiertWohnungen++;
    }
  }

  // 4) Mieter anlegen bzw. aktualisieren
  let angelegtMieter = 0;
  let aktualisiertMieter = 0;
  for (const m of mieterInput) {
    if (!m.uebernehmen) continue;
    const wohnungId = wohnungIdByKey.get(m.wohnungKey);
    if (m.aktion === "neu") {
      if (!wohnungId) continue; // zugehörige Wohnung wurde nicht übernommen
      const mieter: Mieter = {
        id: uid(),
        wohnungId,
        name: m.name || "Neuer Mieter",
        mietbeginn: m.mietbeginn,
        mietende: m.mietende,
        kaltmiete: m.kaltmiete,
        nebenkostenVorauszahlung: m.nebenkostenVorauszahlung,
        createdAt: now(),
        updatedAt: now(),
      };
      await mieterDb.create(mieter);
      angelegtMieter++;
    } else if (m.mieterId) {
      const patch: Partial<Mieter> = {};
      if (m.kaltmiete !== undefined) patch.kaltmiete = m.kaltmiete;
      if (m.nebenkostenVorauszahlung !== undefined) patch.nebenkostenVorauszahlung = m.nebenkostenVorauszahlung;
      if (m.mietbeginn !== undefined) patch.mietbeginn = m.mietbeginn;
      if (m.mietende !== undefined) patch.mietende = m.mietende;
      await mieterDb.update(m.mieterId, patch);
      aktualisiertMieter++;
    }
  }

  // 5) Quelldokument optional als Anhang am PM-Vertrag ablegen
  if (dokument?.pmVertragId) {
    const bestehend = await pmVertraegeDb.get(dokument.pmVertragId);
    if (bestehend) {
      const anhang: Anhang = {
        id: uid(),
        typ: dokument.anhangTyp,
        dateiName: dokument.dateiName,
        storedFileName: dokument.storedFileName,
        mimeType: dokument.mimeType,
        hochgeladenAm: now(),
        extraktText: dokument.extraktText,
      };
      await pmVertraegeDb.update(dokument.pmVertragId, {
        anhaenge: [...(bestehend.anhaenge || []), anhang],
      });
    }
  }

  return NextResponse.json({
    liegenschaftId,
    angelegtGebaeude,
    angelegtWohnungen,
    aktualisiertWohnungen,
    angelegtMieter,
    aktualisiertMieter,
  });
}
