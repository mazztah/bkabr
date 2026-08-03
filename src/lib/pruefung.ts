import {
  ablageDb,
  eigentuemerDb,
  gebaeudeDb,
  kontoauszuegeDb,
  liegenschaftenDb,
  logEvent,
  mieterDb,
  mietvertraegeDb,
  pmVertraegeDb,
  pruefLaufDb,
  wohnungenDb,
} from "./db";
import { listAbrechnungen, updateAbrechnung } from "./db";
import { matchLiegenschaft } from "./matching";
import { pruefeDokumentZuordnung } from "./ai";
import {
  PRUEF_MODUL_REIHENFOLGE,
  PruefBefund,
  PruefLauf,
  PruefModul,
  PruefStatus,
} from "./types";
import { uid } from "./utils";

// Wie viele bereits zugeordnete Ablage-Dokumente pro Lauf per LLM stichprobenartig
// gegengeprüft werden (Kosten-/Zeitbegrenzung).
const LLM_STICHPROBE_LIMIT = 15;

function neuerBefund(
  modul: PruefModul,
  schweregrad: PruefBefund["schweregrad"],
  titel: string,
  beschreibung: string,
  betroffene: PruefBefund["betroffene"],
  vorschlag?: PruefBefund["vorschlag"],
  linkHref?: string
): PruefBefund {
  return {
    id: uid(),
    modul,
    schweregrad,
    titel,
    beschreibung,
    betroffene,
    vorschlag,
    linkHref,
    status: "offen",
  };
}

/**
 * Führt einen vollständigen Prüflauf über alle Stammdaten-Module + Ablage aus.
 * Kombiniert schnelle, deterministische Konsistenzchecks (Referenzen, fehlende
 * Pflichtfelder, Duplikate) mit einer LLM-gestützten Stichprobenprüfung, ob
 * bereits zugeordnete Dokumente inhaltlich zu ihrem Zielobjekt passen.
 */
export async function runPlausibilitaetspruefung(): Promise<PruefLauf> {
  const gestartetAm = new Date().toISOString();
  const befunde: PruefBefund[] = [];

  const [liegenschaften, gebaeude, wohnungen, mieter, mietvertraege, pmVertraege, eigentuemer, abrechnungen, kontoauszuege, ablage] =
    await Promise.all([
      liegenschaftenDb.list(),
      gebaeudeDb.list(),
      wohnungenDb.list(),
      mieterDb.list(),
      mietvertraegeDb.list(),
      pmVertraegeDb.list(),
      eigentuemerDb.list(),
      listAbrechnungen(),
      kontoauszuegeDb.list(),
      ablageDb.list(),
    ]);

  const liegenschaftById = new Map(liegenschaften.map((l) => [l.id, l]));
  const gebaeudeById = new Map(gebaeude.map((g) => [g.id, g]));
  const wohnungById = new Map(wohnungen.map((w) => [w.id, w]));

  // ---- Gebäude: verwaiste Referenzen auf nicht (mehr) existierende Liegenschaft ----
  for (const g of gebaeude) {
    if (!liegenschaftById.has(g.liegenschaftId)) {
      befunde.push(
        neuerBefund(
          "gebaeude",
          "fehler",
          "Gebäude ohne gültige Liegenschaft",
          `Das Gebäude „${g.name}" verweist auf eine nicht (mehr) existierende Liegenschaft.`,
          [{ art: "Gebäude", id: g.id, label: g.name }]
        )
      );
    }
  }
  if (liegenschaften.length > 0 && gebaeude.every((g) => !liegenschaftById.has(g.liegenschaftId))) {
    // kein Sonderfall nötig, oben bereits pro Gebäude erfasst
  }
  for (const l of liegenschaften) {
    const hatGebaeude = gebaeude.some((g) => g.liegenschaftId === l.id);
    if (!hatGebaeude) {
      befunde.push(
        neuerBefund(
          "gebaeude",
          "hinweis",
          "Liegenschaft ohne Gebäude",
          `Für „${l.name}" wurde noch kein Gebäude angelegt.`,
          [{ art: "Liegenschaft", id: l.id, label: l.name }]
        )
      );
    }
    const hatPmVertrag = pmVertraege.some((p) => p.liegenschaftId === l.id);
    if (!hatPmVertrag) {
      befunde.push(
        neuerBefund(
          "pmVertraege",
          "hinweis",
          "Liegenschaft ohne PM-Vertrag",
          `Für „${l.name}" ist noch kein PM-Vertrag hinterlegt.`,
          [{ art: "Liegenschaft", id: l.id, label: l.name }]
        )
      );
    }
  }

  // ---- Wohnungen: verwaiste Referenzen, fehlende Pflichtangaben, Duplikate ----
  const wohnungenProGebaeude = new Map<string, typeof wohnungen>();
  for (const w of wohnungen) {
    if (!gebaeudeById.has(w.gebaeudeId)) {
      befunde.push(
        neuerBefund(
          "wohnungen",
          "fehler",
          "Wohnung ohne gültiges Gebäude",
          `Die Einheit „${w.bezeichnung}" verweist auf ein nicht (mehr) existierendes Gebäude.`,
          [{ art: "Wohnung", id: w.id, label: w.bezeichnung }]
        )
      );
      continue;
    }
    if (!w.flaeche || w.flaeche <= 0) {
      befunde.push(
        neuerBefund(
          "wohnungen",
          "hinweis",
          "Wohnung ohne Flächenangabe",
          `Für „${w.bezeichnung}" (${gebaeudeById.get(w.gebaeudeId)?.name}) fehlt die Wohnfläche.`,
          [{ art: "Wohnung", id: w.id, label: w.bezeichnung }]
        )
      );
    }
    const liste = wohnungenProGebaeude.get(w.gebaeudeId) || [];
    liste.push(w);
    wohnungenProGebaeude.set(w.gebaeudeId, liste);
  }
  for (const [gebId, liste] of wohnungenProGebaeude) {
    const gesehen = new Map<string, string>();
    for (const w of liste) {
      const key = w.bezeichnung.trim().toLowerCase();
      if (gesehen.has(key)) {
        befunde.push(
          neuerBefund(
            "wohnungen",
            "warnung",
            "Doppelte Wohnungsbezeichnung",
            `„${w.bezeichnung}" existiert im Gebäude „${gebaeudeById.get(gebId)?.name}" mehrfach.`,
            [
              { art: "Wohnung", id: gesehen.get(key)!, label: w.bezeichnung },
              { art: "Wohnung", id: w.id, label: w.bezeichnung },
            ]
          )
        );
      } else {
        gesehen.set(key, w.id);
      }
    }
  }

  // ---- Mieter: verwaiste Referenzen + fehlende Stammdaten ----
  for (const m of mieter) {
    if (!wohnungById.has(m.wohnungId)) {
      befunde.push(
        neuerBefund(
          "mieter",
          "fehler",
          "Mieter ohne gültige Wohnung",
          `„${m.name}" ist keiner (mehr) existierenden Wohnung zugeordnet.`,
          [{ art: "Mieter", id: m.id, label: m.name }],
          undefined,
          "/mieter"
        )
      );
      continue;
    }
    const fehlend: string[] = [];
    if (!m.kaltmiete || m.kaltmiete <= 0) fehlend.push("Kaltmiete");
    if (m.nebenkostenVorauszahlung == null) fehlend.push("NK-Vorauszahlung");
    if (!m.mietbeginn) fehlend.push("Mietbeginn");
    if (fehlend.length > 0) {
      befunde.push(
        neuerBefund(
          "mieter",
          "warnung",
          "Mieter mit unvollständigen Stammdaten",
          `Bei „${m.name}" fehlen: ${fehlend.join(", ")}.`,
          [{ art: "Mieter", id: m.id, label: m.name }],
          undefined,
          "/mieter"
        )
      );
    }
    const hatVertrag = mietvertraege.some((mv) => mv.mieterId === m.id);
    if (!hatVertrag) {
      befunde.push(
        neuerBefund(
          "mietvertraege",
          "hinweis",
          "Mieter ohne hinterlegten Mietvertrag",
          `Für „${m.name}" liegt kein Mietvertrags-Dokument vor – hochladen und zuordnen.`,
          [{ art: "Mieter", id: m.id, label: m.name }],
          undefined,
          "/mietvertraege"
        )
      );
    }
  }

  // ---- Mietverträge: fehlende Zuordnung / Stammdaten ----
  for (const mv of mietvertraege) {
    if (!mv.wohnungId || !wohnungById.has(mv.wohnungId)) {
      befunde.push(
        neuerBefund(
          "mietvertraege",
          "fehler",
          "Mietvertrag ohne gültige Wohnung",
          `„${mv.dateiName}" ist keiner Wohnung zugeordnet.`,
          [{ art: "Mietvertrag", id: mv.id, label: mv.dateiName }],
          undefined,
          "/mietvertraege"
        )
      );
    }
    if (!mv.mieterId) {
      befunde.push(
        neuerBefund(
          "mietvertraege",
          "warnung",
          "Mietvertrag ohne Mieter-Zuordnung",
          `„${mv.dateiName}" hat keine Mieter-ID – bitte neu zuordnen.`,
          [{ art: "Mietvertrag", id: mv.id, label: mv.dateiName }],
          undefined,
          "/mietvertraege"
        )
      );
    } else if (!mieter.some((m) => m.id === mv.mieterId)) {
      befunde.push(
        neuerBefund(
          "mietvertraege",
          "fehler",
          "Mietvertrag verweist auf fehlenden Mieter",
          `„${mv.dateiName}" zeigt auf eine nicht existierende Mieter-ID.`,
          [{ art: "Mietvertrag", id: mv.id, label: mv.dateiName }],
          undefined,
          "/mietvertraege"
        )
      );
    }
    const fehlMv: string[] = [];
    if (!mv.sollMiete || mv.sollMiete <= 0) fehlMv.push("Kaltmiete");
    if (!mv.mietbeginn) fehlMv.push("Mietbeginn");
    if (fehlMv.length > 0) {
      befunde.push(
        neuerBefund(
          "mietvertraege",
          "hinweis",
          "Mietvertrag mit unvollständigen Stammdaten",
          `Bei „${mv.dateiName}" fehlen: ${fehlMv.join(", ")}.`,
          [{ art: "Mietvertrag", id: mv.id, label: mv.dateiName }],
          undefined,
          "/mietvertraege"
        )
      );
    }
  }

  // ---- Eigentümer: ohne (gültige) Liegenschaft ----
  for (const e of eigentuemer) {
    if (!e.liegenschaftId || !liegenschaftById.has(e.liegenschaftId)) {
      befunde.push(
        neuerBefund(
          "eigentuemer",
          "hinweis",
          "Eigentümer ohne gültige Liegenschaft",
          `„${e.name}" ist keiner (mehr) existierenden Liegenschaft zugeordnet.`,
          [{ art: "Eigentümer", id: e.id, label: e.name }]
        )
      );
    }
  }

  // ---- Abrechnungen: Nachzahlung/Summe 0 trotz abgeschlossenem Status ----
  for (const a of abrechnungen) {
    if (a.status !== "Rohdaten" && (!a.gesamtSumme || a.gesamtSumme === 0)) {
      befunde.push(
        neuerBefund(
          "abrechnungen",
          "warnung",
          "Abrechnung ohne Summe",
          `„${a.name}" (${a.adresse || "keine Adresse"}) hat Status „${a.status}", aber eine Gesamtsumme von 0 €.`,
          [{ art: "Abrechnung", id: a.id, label: a.name }]
        )
      );
    }
  }

  // ---- Ablage: unbearbeitete Dokumente (sofort sichtbar + Deep-Link) ----
  const jetzt = Date.now();
  const SIEBEN_TAGE_MS = 7 * 24 * 60 * 60 * 1000;
  const offeneAblage = ablage.filter((a) => a.status === "neu" || a.status === "in_pruefung");
  if (offeneAblage.length > 0) {
    befunde.push(
      neuerBefund(
        "ablage",
        offeneAblage.length >= 5 ? "warnung" : "hinweis",
        `${offeneAblage.length} unbearbeitete Ablage-Dokument(e)`,
        offeneAblage
          .slice(0, 12)
          .map((a) => `• ${a.dateiName} (${a.status}${a.erkannterTyp ? `, ${a.erkannterTyp}` : ""})`)
          .join("\n") +
          (offeneAblage.length > 12 ? `\n… und ${offeneAblage.length - 12} weitere` : "") +
          "\n→ Zur Bearbeitung: /ablage oder /smart-upload. Agent: „ordne die offenen Ablage-Dokumente zu“.",
        offeneAblage.slice(0, 8).map((a) => ({ art: "Ablage", id: a.id, label: a.dateiName })),
        undefined,
        "/ablage"
      )
    );
  }
  for (const a of offeneAblage) {
    const alterMs = jetzt - new Date(a.hochgeladenAm).getTime();
    if (alterMs > SIEBEN_TAGE_MS) {
      befunde.push(
        neuerBefund(
          "ablage",
          "warnung",
          "Dokument seit über 7 Tagen nicht zugeordnet",
          `„${a.dateiName}" liegt seit ${Math.floor(alterMs / (24 * 60 * 60 * 1000))} Tagen unzugeordnet in der Ablage.`,
          [{ art: "Ablage", id: a.id, label: a.dateiName }],
          undefined,
          "/ablage"
        )
      );
    }
  }

  // ---- System / Funktionsprüfung der Module ----
  {
    const checks: { ok: boolean; name: string; detail: string }[] = [
      { ok: Array.isArray(liegenschaften), name: "Liegenschaften-DB", detail: `${liegenschaften.length} Einträge` },
      { ok: Array.isArray(gebaeude), name: "Gebäude-DB", detail: `${gebaeude.length} Einträge` },
      { ok: Array.isArray(wohnungen), name: "Wohnungen-DB", detail: `${wohnungen.length} Einträge` },
      { ok: Array.isArray(mieter), name: "Mieter-DB", detail: `${mieter.length} Einträge` },
      { ok: Array.isArray(mietvertraege), name: "Mietverträge-DB", detail: `${mietvertraege.length} Einträge` },
      { ok: Array.isArray(pmVertraege), name: "PM-Verträge-DB", detail: `${pmVertraege.length} Einträge` },
      { ok: Array.isArray(eigentuemer), name: "Eigentümer-DB", detail: `${eigentuemer.length} Einträge` },
      { ok: Array.isArray(abrechnungen), name: "Abrechnungen-DB", detail: `${abrechnungen.length} Einträge` },
      { ok: Array.isArray(kontoauszuege), name: "Kontoauszüge-DB", detail: `${kontoauszuege.length} Einträge` },
      { ok: Array.isArray(ablage), name: "Ablage-DB", detail: `${ablage.length} Einträge` },
      {
        ok: Boolean(process.env.GROQ_API_KEY),
        name: "GROQ_API_KEY",
        detail: process.env.GROQ_API_KEY ? "gesetzt" : "FEHLT – KI-Funktionen deaktiviert",
      },
      {
        ok: true,
        name: "CEREBRAS_API_KEY",
        detail: process.env.CEREBRAS_API_KEY ? "gesetzt (Fallback aktiv)" : "nicht gesetzt (nur Groq)",
      },
    ];
    const kaputt = checks.filter((c) => !c.ok);
    if (kaputt.length > 0) {
      for (const c of kaputt) {
        befunde.push(
          neuerBefund(
            "system",
            "fehler",
            `Modul/Config defekt: ${c.name}`,
            c.detail,
            [{ art: "System", id: c.name, label: c.name }]
          )
        );
      }
    } else {
      // Nur Info-Snapshot, wenn alles erreichbar ist (kein Alarm)
      const summary = checks.map((c) => `${c.name}: ${c.detail}`).join("; ");
      // Kein Befund bei OK – modulStatus wird unten auf ok gesetzt
      void summary;
    }
    // Leere Hierarchie als Hinweis (neue Installation)
    if (liegenschaften.length === 0) {
      befunde.push(
        neuerBefund(
          "system",
          "hinweis",
          "Noch keine Liegenschaft angelegt",
          "Lege unter /liegenschaften eine Liegenschaft an oder nutze den Intelligenten Upload.",
          [],
          undefined,
          "/liegenschaften"
        )
      );
    }
  }

  // ---- LLM-Stichprobe: passt die Zuordnung bereits zugeordneter Dokumente inhaltlich? ----
  const zugeordneteMitText = ablage
    .filter((a) => a.status === "zugeordnet" && a.zugeordnetAn && a.extraktText && a.extraktText.trim().length > 40)
    .sort((a, b) => new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime())
    .slice(0, LLM_STICHPROBE_LIMIT);

  for (const doc of zugeordneteMitText) {
    try {
      const ergebnis = await pruefeDokumentZuordnung({
        dokumentText: doc.extraktText!,
        zielLabel: doc.zugeordnetAn!.label,
        zielTyp: doc.zugeordnetAn!.art,
      });
      if (!ergebnis.plausibel && ergebnis.konfidenz >= 0.5) {
        // Alternative Liegenschaft ermitteln (falls die Zuordnung eine Liegenschaft betrifft)
        let vorschlag: PruefBefund["vorschlag"] | undefined;
        if (doc.zugeordnetAn!.art === "Liegenschaft") {
          const alle = await liegenschaftenDb.list();
          const alternative = matchLiegenschaft(doc.extraktText || "", alle);
          if (alternative && alternative.id !== doc.zugeordnetAn!.id) {
            vorschlag = {
              art: "dokument_verschieben",
              beschreibung: `Nach Adresse im Dokument vermutlich korrekt bei „${alternative.name}" statt „${doc.zugeordnetAn!.label}".`,
              ablageId: doc.id,
              zielLiegenschaftId: alternative.id,
            };
          }
        }
        befunde.push(
          neuerBefund(
            "ablage",
            "warnung",
            "Zuordnung wirkt unplausibel",
            `„${doc.dateiName}" ist bei „${doc.zugeordnetAn!.label}" abgelegt – ${ergebnis.begruendung || "die KI hält das für nicht eindeutig plausibel."}`,
            [{ art: "Ablage", id: doc.id, label: doc.dateiName }],
            vorschlag
          )
        );
      }
    } catch (e) {
      console.error("Plausibilitätsprüfung (LLM) fehlgeschlagen für", doc.id, e);
    }
  }

  // ---- Modul-Status ableiten ----
  const modulStatus = {} as Record<PruefModul, PruefStatus>;
  for (const modul of PRUEF_MODUL_REIHENFOLGE) {
    const relevante = befunde.filter((b) => b.modul === modul);
    if (relevante.some((b) => b.schweregrad === "fehler")) modulStatus[modul] = "fehler";
    else if (relevante.some((b) => b.schweregrad === "warnung")) modulStatus[modul] = "hinweise";
    else if (relevante.length > 0) modulStatus[modul] = "hinweise";
    else modulStatus[modul] = "ok";
  }

  const now = new Date().toISOString();
  const lauf: PruefLauf = {
    id: uid(),
    gestartetAm,
    abgeschlossenAm: now,
    modulStatus,
    befunde,
    createdAt: now,
    updatedAt: now,
  };
  await pruefLaufDb.create(lauf);

  const fehlerCount = befunde.filter((b) => b.schweregrad === "fehler").length;
  const warnCount = befunde.filter((b) => b.schweregrad === "warnung").length;
  await logEvent(
    "pruefung",
    `Plausibilitätsprüfung durchgeführt: ${befunde.length} Befund(e) (${fehlerCount} Fehler, ${warnCount} Warnungen).`,
    { art: "PruefLauf", id: lauf.id }
  );

  return lauf;
}

/**
 * Wendet einen einzelnen, vom Nutzer freigegebenen Korrekturvorschlag an
 * (Dokument verschieben oder Stammdaten korrigieren) und protokolliert die
 * Aktion im System-Log.
 */
export async function wendeBefundAn(befund: PruefBefund): Promise<{ ok: boolean; meldung: string }> {
  const vorschlag = befund.vorschlag;
  if (!vorschlag) {
    return { ok: false, meldung: "Für diesen Befund gibt es keinen automatischen Korrekturvorschlag." };
  }

  if (vorschlag.art === "dokument_verschieben" && vorschlag.ablageId) {
    const doc = await ablageDb.get(vorschlag.ablageId);
    if (!doc) return { ok: false, meldung: "Ablage-Dokument nicht gefunden." };

    if (vorschlag.zielLiegenschaftId) {
      const ziel = await liegenschaftenDb.get(vorschlag.zielLiegenschaftId);
      if (!ziel) return { ok: false, meldung: "Ziel-Liegenschaft nicht gefunden." };
      await ablageDb.update(doc.id, {
        zugeordnetAn: { art: "Liegenschaft", id: ziel.id, label: ziel.name },
      });
      await logEvent(
        "aenderung",
        `Dokument „${doc.dateiName}" per Plausibilitätsprüfung von „${doc.zugeordnetAn?.label || "unbekannt"}" zu „${ziel.name}" verschoben.`,
        { art: "Ablage", id: doc.id }
      );
      return { ok: true, meldung: `Zuordnung auf „${ziel.name}" korrigiert.` };
    }
    return { ok: false, meldung: "Kein Zielobjekt für die Verschiebung angegeben." };
  }

  if (vorschlag.art === "stammdaten_korrigieren" && vorschlag.entitaet && vorschlag.patch) {
    const { art, id, label } = vorschlag.entitaet;
    const dbMap = { liegenschaft: liegenschaftenDb, gebaeude: gebaeudeDb, wohnung: wohnungenDb, mieter: mieterDb } as const;
    const zielDb = dbMap[art];
    if (!zielDb) return { ok: false, meldung: "Unbekannter Entitätstyp." };
    const aktualisiert = await zielDb.update(id, vorschlag.patch as any);
    if (!aktualisiert) return { ok: false, meldung: "Datensatz nicht gefunden." };
    await logEvent(
      "aenderung",
      `Stammdaten von „${label}" per Plausibilitätsprüfung korrigiert: ${Object.entries(vorschlag.patch)
        .map(([k, v]) => `${k} = ${v}`)
        .join(", ")}.`,
      { art, id }
    );
    return { ok: true, meldung: `Stammdaten von „${label}" korrigiert.` };
  }

  return { ok: false, meldung: "Korrekturvorschlag konnte nicht angewendet werden." };
}
