import { NextRequest, NextResponse } from "next/server";
import {
  StammdatenVorschlag,
  Liegenschaft,
  Gebaeude,
  Wohnung,
  Mieter,
  Mietvertrag,
  PmVertrag,
  Eigentuemer,
  AnhangDokument,
  Abrechnung,
  Dokument,
} from "@/lib/types";
import {
  liegenschaftenDb,
  gebaeudeDb,
  wohnungenDb,
  mieterDb,
  mietvertraegeDb,
  pmVertraegeDb,
  eigentuemerDb,
  createAbrechnung,
  nextNummer,
} from "@/lib/db";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Bestätigt die Batch-Vorschläge: legt Stammdaten an/aktualisiert und ordnet
 * Dokumente den richtigen Ablageorten zu.
 *
 * Body: { vorschlaege: StammdatenVorschlag[], akzeptiertIds?: string[] }
 * Wenn akzeptiertIds fehlt, werden alle übernommen.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vorschlaege = (body.vorschlaege || []) as StammdatenVorschlag[];
    const akzeptiertIds: string[] | undefined = body.akzeptiertIds;

    const toProcess = akzeptiertIds
      ? vorschlaege.filter((v) => akzeptiertIds.includes(v.id))
      : vorschlaege;

    if (!toProcess.length) {
      return NextResponse.json({ error: "Keine Vorschläge zum Übernehmen" }, { status: 400 });
    }

    const results: {
      id: string;
      dateiName: string;
      dokumentArt: string;
      action: string;
      entityId?: string;
    }[] = [];

    // Cache für neu angelegte Entities in diesem Lauf
    const newLg = new Map<string, Liegenschaft>();
    const newGeb = new Map<string, Gebaeude>();
    const newWo = new Map<string, Wohnung>();

    for (const v of toProcess) {
      try {
        // 1) Liegenschaft sicherstellen
        let lgId = v.liegenschaft?.matchId;
        if (!lgId && v.liegenschaft?.strasse) {
          const key = `${v.liegenschaft.strasse}|${v.liegenschaft.plz}`;
          if (newLg.has(key)) {
            lgId = newLg.get(key)!.id;
          } else {
            const now = new Date().toISOString();
            const lg: Liegenschaft = {
              id: uid(),
              name: v.liegenschaft.name || `${v.liegenschaft.strasse} ${v.liegenschaft.hausnummer || ""}`.trim(),
              strasse: v.liegenschaft.strasse || "",
              hausnummer: v.liegenschaft.hausnummer || "",
              plz: v.liegenschaft.plz || "",
              ort: v.liegenschaft.ort || "",
              createdAt: now,
              updatedAt: now,
            };
            await liegenschaftenDb.create(lg);
            newLg.set(key, lg);
            lgId = lg.id;
          }
        }

        // 2) Gebäude (falls Wohnung-Bezeichnung Haus A/B enthält)
        let gebId: string | undefined;
        if (lgId && v.wohnung?.bezeichnung) {
          const hausMatch = v.wohnung.bezeichnung.match(/Haus\s*([A-Z])/i);
          if (hausMatch) {
            const gebName = `Haus ${hausMatch[1].toUpperCase()}`;
            const existing = (await gebaeudeDb.list()).find(
              (g) => g.liegenschaftId === lgId && g.name === gebName
            );
            if (existing) gebId = existing.id;
            else {
              const key = `${lgId}|${gebName}`;
              if (newGeb.has(key)) gebId = newGeb.get(key)!.id;
              else {
                const now = new Date().toISOString();
                const geb: Gebaeude = {
                  id: uid(),
                  liegenschaftId: lgId,
                  name: gebName,
                  createdAt: now,
                  updatedAt: now,
                };
                await gebaeudeDb.create(geb);
                newGeb.set(key, geb);
                gebId = geb.id;
              }
            }
          }
        }

        // 3) Wohnung
        let woId = v.wohnung?.matchId;
        if (!woId && lgId && v.wohnung?.bezeichnung && gebId) {
          const key = `${gebId}|${v.wohnung.bezeichnung}`;
          if (newWo.has(key)) woId = newWo.get(key)!.id;
          else {
            const now = new Date().toISOString();
            const wo: Wohnung = {
              id: uid(),
              gebaeudeId: gebId,
              bezeichnung: v.wohnung.bezeichnung,
              typ: "Wohnung",
              flaeche: v.wohnung.flaeche,
              createdAt: now,
              updatedAt: now,
            };
            await wohnungenDb.create(wo);
            newWo.set(key, wo);
            woId = wo.id;
          }
        }

        // 4) Je nach Ablageziel speichern
        switch (v.ablageZiel) {
          case "mietvertrag": {
            let mieterId = v.mieter?.matchId;
            if (!mieterId && woId && v.mieter?.name) {
              const now = new Date().toISOString();
              const m: Mieter = {
                id: uid(),
                wohnungId: woId,
                name: v.mieter.name,
                kaltmiete: v.mieter.kaltmiete ?? v.mietvertrag?.sollMiete,
                nebenkostenVorauszahlung:
                  v.mieter.nebenkostenVorauszahlung ?? v.mietvertrag?.nebenkostenVorauszahlung,
                mietbeginn: v.mieter.mietbeginn ?? v.mietvertrag?.mietbeginn,
                mietende: v.mieter.mietende ?? v.mietvertrag?.mietende,
                createdAt: now,
                updatedAt: now,
              };
              await mieterDb.create(m);
              mieterId = m.id;
            } else if (mieterId && (v.mietvertrag || v.mieter)) {
              // Stammdaten-Update (z.B. Nachmieter / Nachtrag)
              await mieterDb.update(mieterId, {
                kaltmiete: v.mieter?.kaltmiete ?? v.mietvertrag?.sollMiete,
                nebenkostenVorauszahlung:
                  v.mieter?.nebenkostenVorauszahlung ?? v.mietvertrag?.nebenkostenVorauszahlung,
                mietbeginn: v.mieter?.mietbeginn ?? v.mietvertrag?.mietbeginn,
                mietende: v.mieter?.mietende ?? v.mietvertrag?.mietende,
                name: v.mieter?.name,
              } as Partial<Mieter>);
            }

            if (woId) {
              const now = new Date().toISOString();
              const mv: Mietvertrag = {
                id: uid(),
                wohnungId: woId,
                mieterId,
                dateiName: v.dateiName,
                storedFileName: v.storedFileName,
                mimeType: v.mimeType || "application/pdf",
                hochgeladenAm: now,
                sollMiete: v.mietvertrag?.sollMiete,
                nebenkostenVorauszahlung: v.mietvertrag?.nebenkostenVorauszahlung,
                kaution: v.mietvertrag?.kaution,
                mietbeginn: v.mietvertrag?.mietbeginn,
                mietende: v.mietvertrag?.mietende,
                status: v.mietvertrag?.mietende ? "Beendet" : "Aktiv",
                extraktText: v.rawSummary,
                createdAt: now,
                updatedAt: now,
              };
              await mietvertraegeDb.create(mv);
              results.push({
                id: v.id,
                dateiName: v.dateiName,
                dokumentArt: v.dokumentArt,
                action: "mietvertrag_angelegt",
                entityId: mv.id,
              });
            }
            break;
          }

          case "mietvertrag_nachtrag": {
            // Anhang an bestehenden Mietvertrag + optionale Stammdaten-Aktualisierung
            if (v.mieter?.matchId) {
              await mieterDb.update(v.mieter.matchId, {
                mietende: v.mieter.mietende,
                name: v.mieter.name,
                kaltmiete: v.mieter.kaltmiete,
                nebenkostenVorauszahlung: v.mieter.nebenkostenVorauszahlung,
              } as Partial<Mieter>);
            }
            // Finde Mietvertrag der Wohnung und hänge an
            if (woId || v.wohnung?.matchId) {
              const targetWo = woId || v.wohnung!.matchId!;
              const mvs = (await mietvertraegeDb.list()).filter((m) => m.wohnungId === targetWo);
              const latest = mvs.sort((a, b) => b.hochgeladenAm.localeCompare(a.hochgeladenAm))[0];
              if (latest) {
                const anhang: AnhangDokument = {
                  id: v.id,
                  name: v.dateiName,
                  mimeType: v.mimeType || "application/pdf",
                  size: v.size || 0,
                  uploadedAt: new Date().toISOString(),
                  storedFileName: v.storedFileName,
                  dokumentArt: v.dokumentArt,
                  extraktText: v.rawSummary,
                };
                await mietvertraegeDb.update(latest.id, {
                  anhaenge: [...(latest.anhaenge || []), anhang],
                } as Partial<Mietvertrag>);
                results.push({
                  id: v.id,
                  dateiName: v.dateiName,
                  dokumentArt: v.dokumentArt,
                  action: "nachtrag_angehaengt",
                  entityId: latest.id,
                });
              }
            }
            break;
          }

          case "pm_vertrag": {
            if (lgId) {
              const now = new Date().toISOString();
              const pm: PmVertrag = {
                id: uid(),
                liegenschaftId: lgId,
                dateiName: v.dateiName,
                storedFileName: v.storedFileName,
                mimeType: v.mimeType || "application/pdf",
                hochgeladenAm: now,
                verwalterName: v.pmVertrag?.verwalterName,
                auftraggeberName: v.pmVertrag?.auftraggeberName,
                honorarModell: v.pmVertrag?.honorarModell,
                honorarSatz: v.pmVertrag?.honorarSatz,
                leistungsumfang: v.pmVertrag?.leistungsumfang,
                laufzeitBeginn: v.pmVertrag?.laufzeitBeginn,
                laufzeitEnde: v.pmVertrag?.laufzeitEnde,
                status: "Aktiv",
                extraktText: v.rawSummary,
                createdAt: now,
                updatedAt: now,
              };
              await pmVertraegeDb.create(pm);
              results.push({
                id: v.id,
                dateiName: v.dateiName,
                dokumentArt: v.dokumentArt,
                action: "pm_vertrag_angelegt",
                entityId: pm.id,
              });
            }
            break;
          }

          case "pm_vertrag_anhang":
          case "liegenschaft_anhang": {
            if (lgId) {
              const pms = (await pmVertraegeDb.list()).filter((p) => p.liegenschaftId === lgId);
              const latest = pms.sort((a, b) => b.hochgeladenAm.localeCompare(a.hochgeladenAm))[0];
              const anhang: AnhangDokument = {
                id: v.id,
                name: v.dateiName,
                mimeType: v.mimeType || "application/pdf",
                size: v.size || 0,
                uploadedAt: new Date().toISOString(),
                storedFileName: v.storedFileName,
                dokumentArt: v.dokumentArt,
                extraktText: v.rawSummary,
              };
              if (latest) {
                await pmVertraegeDb.update(latest.id, {
                  anhaenge: [...(latest.anhaenge || []), anhang],
                } as Partial<PmVertrag>);
                results.push({
                  id: v.id,
                  dateiName: v.dateiName,
                  dokumentArt: v.dokumentArt,
                  action: "pm_anhang_angehaengt",
                  entityId: latest.id,
                });
              } else {
                // Kein PM-Vertrag → als Eigentümer-Anhang oder Liegenschaft-Notiz speichern
                results.push({
                  id: v.id,
                  dateiName: v.dateiName,
                  dokumentArt: v.dokumentArt,
                  action: "anhang_ohne_pm_gespeichert",
                });
              }
            }
            break;
          }

          case "eigentuemer":
          case "eigentuemer_anhang": {
            if (lgId) {
              const name =
                v.eigentuemer?.eigentuemerName ||
                v.rechnung?.auftraggeber ||
                "Eigentümer";
              let eg = (await eigentuemerDb.list()).find(
                (e) => e.liegenschaftId === lgId && e.name === name
              );
              if (!eg) {
                const now = new Date().toISOString();
                eg = {
                  id: uid(),
                  liegenschaftId: lgId,
                  name,
                  anschrift: v.eigentuemer?.anschrift,
                  dateiName: v.ablageZiel === "eigentuemer" ? v.dateiName : undefined,
                  storedFileName: v.ablageZiel === "eigentuemer" ? v.storedFileName : undefined,
                  mimeType: v.mimeType,
                  extraktText: v.rawSummary,
                  createdAt: now,
                  updatedAt: now,
                };
                await eigentuemerDb.create(eg);
              }
              if (v.ablageZiel === "eigentuemer_anhang") {
                const anhang: AnhangDokument = {
                  id: v.id,
                  name: v.dateiName,
                  mimeType: v.mimeType || "application/pdf",
                  size: v.size || 0,
                  uploadedAt: new Date().toISOString(),
                  storedFileName: v.storedFileName,
                  dokumentArt: v.dokumentArt,
                  extraktText: v.rawSummary,
                };
                await eigentuemerDb.update(eg.id, {
                  anhaenge: [...(eg.anhaenge || []), anhang],
                } as Partial<Eigentuemer>);
              }
              results.push({
                id: v.id,
                dateiName: v.dateiName,
                dokumentArt: v.dokumentArt,
                action:
                  v.ablageZiel === "eigentuemer"
                    ? "eigentuemer_angelegt"
                    : "eigentuemer_anhang",
                entityId: eg.id,
              });
            }
            break;
          }

          case "rechnung": {
            // Als Abrechnung/Rechnung in Workspace ablegen
            const now = new Date().toISOString();
            const dok: Dokument = {
              id: v.id,
              name: v.dateiName,
              mimeType: v.mimeType || "application/pdf",
              size: v.size || 0,
              uploadedAt: now,
              storedFileName: v.storedFileName,
              extraktText: v.rawSummary,
              rechnungsnummer: v.rechnung?.rechnungsnummer,
              rechnungsdatum: v.rechnung?.rechnungsdatum,
              betrag: v.rechnung?.betrag,
              leistungsart: v.rechnung?.leistungsart,
              auftragnehmer: v.rechnung?.auftragnehmer,
              auftraggeber: v.rechnung?.auftraggeber,
            };
            const abr: Abrechnung = {
              id: uid(),
              name: v.rechnung?.leistungsart || v.dateiName,
              adresse: v.liegenschaft
                ? `${v.liegenschaft.strasse} ${v.liegenschaft.hausnummer}, ${v.liegenschaft.plz} ${v.liegenschaft.ort}`
                : "",
              objektTyp: "Haus",
              zeitraum: v.rechnung?.rechnungsdatum || "",
              gesamtSumme: v.rechnung?.betrag || 0,
              status: "Rohdaten",
              dokumente: [dok],
              workspace: { positionen: [], mieteinnahmen: 0, nebenkosten: 0 },
              chat: [],
              version: 1,
              history: [],
              createdAt: now,
              updatedAt: now,
              liegenschaftId: lgId,
              gebaeudeId: gebId,
              wohnungId: woId,
            };
            await createAbrechnung(abr);
            results.push({
              id: v.id,
              dateiName: v.dateiName,
              dokumentArt: v.dokumentArt,
              action: "rechnung_abgelegt",
              entityId: abr.id,
            });
            break;
          }

          case "kontoauszug": {
            results.push({
              id: v.id,
              dateiName: v.dateiName,
              dokumentArt: v.dokumentArt,
              action: "kontoauszug_erfasst",
            });
            break;
          }

          default:
            results.push({
              id: v.id,
              dateiName: v.dateiName,
              dokumentArt: v.dokumentArt,
              action: "sonstiges_gespeichert",
            });
        }
      } catch (e: any) {
        results.push({
          id: v.id,
          dateiName: v.dateiName,
          dokumentArt: v.dokumentArt,
          action: `fehler: ${e.message}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      message: `${results.filter((r) => !r.action.startsWith("fehler")).length} von ${toProcess.length} Dokumenten übernommen.`,
    });
  } catch (e: any) {
    console.error("Batch confirm error:", e);
    return NextResponse.json({ error: e.message || "Übernahme fehlgeschlagen" }, { status: 500 });
  }
}
