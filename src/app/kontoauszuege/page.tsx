"use client";

import { useRef, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Mieter, KontoauszugTransaktion } from "@/lib/types";

interface Vorschlag {
  transaktion: KontoauszugTransaktion;
  vorschlagMieterId?: string;
  vorschlagMieterName?: string;
  wohnungBezeichnung?: string;
  liegenschaftName?: string;
}

interface Zeile extends Vorschlag {
  key: string;
  gewaehlterMieterId: string;
  uebernehmen: boolean;
}

export default function KontoauszuegePage() {
  const [uploading, setUploading] = useState(false);
  const [buche, setBuche] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [mieter, setMieter] = useState<Mieter[]>([]);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setErfolg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/kontoauszug/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Analyse fehlgeschlagen");
        return;
      }
      setMieter(json.mieter || []);
      const neu: Zeile[] = (json.vorschlaege || []).map((v: Vorschlag, i: number) => ({
        ...v,
        key: `${i}-${v.transaktion.datum}-${v.transaktion.betrag}`,
        gewaehlterMieterId: v.vorschlagMieterId || "",
        uebernehmen: !!v.vorschlagMieterId,
      }));
      setZeilen(neu);
    } catch {
      setError("Analyse fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const updateZeile = (key: string, patch: Partial<Zeile>) => {
    setZeilen((zs) => zs.map((z) => (z.key === key ? { ...z, ...patch } : z)));
  };

  const gruppen = zeilen.reduce<Record<string, Zeile[]>>((acc, z) => {
    const gruppe = z.liegenschaftName || "Ohne Zuordnung";
    (acc[gruppe] ||= []).push(z);
    return acc;
  }, {});

  const uebernehmen = async () => {
    const auswahl = zeilen.filter((z) => z.uebernehmen && z.gewaehlterMieterId);
    if (auswahl.length === 0) return;
    setBuche(true);
    setError(null);
    try {
      // Buchungen pro Mieter gruppieren, damit bei mehreren Zahlungen desselben
      // Mieters nur eine PATCH-Anfrage pro Mieter nötig ist.
      const proMieter = new Map<string, Zeile[]>();
      auswahl.forEach((z) => {
        const list = proMieter.get(z.gewaehlterMieterId) || [];
        list.push(z);
        proMieter.set(z.gewaehlterMieterId, list);
      });

      for (const [mieterId, zs] of proMieter) {
        const m = mieter.find((x) => x.id === mieterId);
        if (!m) continue;
        const neueBuchungen = zs.map((z) => ({
          id: crypto.randomUUID(),
          datum: z.transaktion.datum || new Date().toISOString().slice(0, 10),
          typ: "Miete" as const,
          soll: 0,
          ist: z.transaktion.betrag || 0,
          text: `Zahlungseingang: ${z.transaktion.verwendungszweck || z.transaktion.absender || ""}`.trim(),
        }));
        const sorted = [...(m.mietkonto || []), ...neueBuchungen].sort((a, b) =>
          a.datum.localeCompare(b.datum)
        );
        await fetch(`/api/mieter/${mieterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mietkonto: sorted }),
        });
      }

      setErfolg(`${auswahl.length} Buchung(en) auf ${proMieter.size} Mieterkonto(en) übernommen.`);
      setZeilen((zs) => zs.filter((z) => !(z.uebernehmen && z.gewaehlterMieterId)));
    } catch {
      setError("Übernahme fehlgeschlagen");
    } finally {
      setBuche(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold">💳 Kontoauszüge</h1>
          <p className="text-sm text-muted-foreground">
            Kontoauszug hochladen (PDF/TXT/CSV) – Mieteingänge werden automatisch erkannt und
            passenden Mietern zugeordnet, bevor sie ins jeweilige Mietkonto gebucht werden.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {uploading ? "Analysiere…" : "＋ Kontoauszug hochladen"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--destructive)]">⚠️ {error}</p>}
      {erfolg && (
        <p className="mb-4 rounded-md bg-[var(--success-bg)] p-2.5 text-sm text-[var(--success)]">
          ✅ {erfolg}
        </p>
      )}

      {zeilen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch kein Kontoauszug analysiert. Lade eine Datei hoch, um Buchungsvorschläge zu
          erhalten.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {zeilen.filter((z) => z.uebernehmen && z.gewaehlterMieterId).length} von{" "}
              {zeilen.length} Buchung(en) ausgewählt
            </p>
            <button
              onClick={uebernehmen}
              disabled={buche || zeilen.filter((z) => z.uebernehmen && z.gewaehlterMieterId).length === 0}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {buche ? "Buche…" : "✓ Ausgewählte Buchungen übernehmen"}
            </button>
          </div>

          {Object.entries(gruppen).map(([gruppe, zs]) => (
            <div key={gruppe} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold">🏠 {gruppe}</h2>
              <div className="space-y-2">
                {zs.map((z) => (
                  <div
                    key={z.key}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={z.uebernehmen}
                      onChange={(e) => updateZeile(z.key, { uebernehmen: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {z.transaktion.datum ? formatDate(z.transaktion.datum) : "–"}
                    </span>
                    <span className="w-24 shrink-0 font-mono font-semibold text-[var(--success)]">
                      {formatCurrency(z.transaktion.betrag || 0)}
                    </span>
                    <span className="min-w-[10rem] flex-1 truncate text-muted-foreground">
                      {z.transaktion.verwendungszweck || z.transaktion.absender || "–"}
                    </span>
                    <select
                      value={z.gewaehlterMieterId}
                      onChange={(e) =>
                        updateZeile(z.key, {
                          gewaehlterMieterId: e.target.value,
                          uebernehmen: !!e.target.value,
                        })
                      }
                      className="rounded border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">— Mieter wählen —</option>
                      {mieter.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {z.vorschlagMieterName && (
                      <span className="text-xs text-muted-foreground">
                        (Vorschlag: {z.vorschlagMieterName}
                        {z.wohnungBezeichnung ? ` · ${z.wohnungBezeichnung}` : ""})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
