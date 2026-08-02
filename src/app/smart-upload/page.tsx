"use client";

import { useEffect, useRef, useState } from "react";
import {
  DOKUMENT_TYP_LABEL,
  Eigentuemer,
  ErkannterDokumentTyp,
  Gebaeude,
  Liegenschaft,
  Mietvertrag,
  Mieter,
  PmVertrag,
  SmartUploadErgebnis,
  Wohnung,
} from "@/lib/types";

type Item = SmartUploadErgebnis & {
  status: "offen" | "gespeichert" | "verworfen";
  meldung?: string;
};

const TYP_ICON: Record<ErkannterDokumentTyp, string> = {
  rechnung: "🧾",
  mietvertrag: "📄",
  mietvertrag_nachtrag: "📝",
  uebergabeprotokoll: "🔑",
  pm_vertrag: "📃",
  eigentuemer_dokument: "👤",
  grundbuchauszug: "📜",
  kaufvertrag: "🏷️",
  liegenschaftskarte: "🗺️",
  kontoauszug: "💳",
  unbekannt: "❓",
};

export default function SmartUploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [mieter, setMieter] = useState<Mieter[]>([]);
  const [mietvertraege, setMietvertraege] = useState<Mietvertrag[]>([]);
  const [pmVertraege, setPmVertraege] = useState<PmVertrag[]>([]);
  const [eigentuemerListe, setEigentuemerListe] = useState<Eigentuemer[]>([]);

  const ladeStammdaten = async () => {
    const [lg, gb, wh, mi, mv, pm, eg] = await Promise.all([
      fetch("/api/liegenschaften").then((r) => r.json()),
      fetch("/api/gebaeude").then((r) => r.json()),
      fetch("/api/wohnungen").then((r) => r.json()),
      fetch("/api/mieter").then((r) => r.json()),
      fetch("/api/mietvertraege").then((r) => r.json()),
      fetch("/api/pm-vertrag").then((r) => r.json()),
      fetch("/api/eigentuemer").then((r) => r.json()),
    ]);
    setLiegenschaften(lg.liegenschaften || []);
    setGebaeude(gb.gebaeude || []);
    setWohnungen(wh.wohnungen || []);
    setMieter(mi.mieter || []);
    setMietvertraege(mv.mietvertraege || []);
    setPmVertraege(pm.pmVertraege || []);
    setEigentuemerListe(eg.eigentuemer || []);
  };

  useEffect(() => {
    ladeStammdaten();
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/smart-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Sammel-Upload fehlgeschlagen");
        return;
      }
      const neu: Item[] = (json.ergebnisse || []).map((e: SmartUploadErgebnis) => ({
        ...e,
        status: e.erledigt ? "gespeichert" : "offen",
      }));
      setItems((prev) => [...neu, ...prev]);
      await ladeStammdaten();
    } catch {
      setError("Sammel-Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const setItem = (key: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const offen = items.filter((i) => i.status === "offen");
  const erledigt = items.filter((i) => i.status !== "offen");

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-bold">🧠 Intelligenter Upload</h1>
        <p className="text-sm text-muted-foreground">
          Beliebig viele unterschiedliche Dokumente auf einmal hochladen – Rechnungen,
          Mietverträge, Nachträge/Übergabeprotokolle, PM-Verträge, Grundbuchauszüge,
          Kaufverträge, Liegenschaftskarten, Kontoauszüge. Jede Datei wird automatisch erkannt
          und passend vorbereitet. Stammdaten werden erst nach Ihrer Bestätigung übernommen,
          Dokumente erst dann final abgelegt.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive ? "border-primary bg-secondary" : "border-border hover:border-primary"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <p className="animate-pulse text-sm text-muted-foreground">
            KI klassifiziert und analysiert die Dokumente …
          </p>
        ) : (
          <>
            <div className="mb-2 text-3xl">📥✨</div>
            <p className="text-lg font-medium">Dateien per Drag & Drop oder Klick hochladen</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Auch 20+ Dateien auf einmal – jede wird einzeln erkannt und zugeordnet
            </p>
          </>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-[var(--destructive)]">⚠️ {error}</p>}

      {items.length === 0 && !uploading && (
        <p className="text-sm text-muted-foreground">Noch keine Dateien hochgeladen.</p>
      )}

      {offen.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">
            🕓 Zu bestätigen ({offen.length})
          </h2>
          <div className="space-y-3">
            {offen.map((item) => (
              <QueueCard
                key={item.key}
                item={item}
                liegenschaften={liegenschaften}
                gebaeude={gebaeude}
                wohnungen={wohnungen}
                mieter={mieter}
                mietvertraege={mietvertraege}
                pmVertraege={pmVertraege}
                eigentuemerListe={eigentuemerListe}
                onErledigt={(patch) => setItem(item.key, patch)}
                onReload={ladeStammdaten}
              />
            ))}
          </div>
        </div>
      )}

      {erledigt.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">✅ Verarbeitet ({erledigt.length})</h2>
          <div className="space-y-2">
            {erledigt.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  item.status === "verworfen"
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-[var(--success)]/30 bg-[var(--success-bg)]"
                }`}
              >
                <span className="text-lg">{TYP_ICON[item.typ]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.dateiName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.status === "verworfen"
                      ? "Verworfen"
                      : item.meldung || item.hinweisText || DOKUMENT_TYP_LABEL[item.typ]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Einzelne Warteschlangen-Karte je nach erkanntem Dokumenttyp
// ---------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function CardShell({
  item,
  children,
  onVerwerfen,
}: {
  item: Item;
  children: React.ReactNode;
  onVerwerfen: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-xl">{TYP_ICON[item.typ]}</span>
          <div>
            <p className="text-sm font-semibold">{item.dateiName}</p>
            <p className="text-xs text-muted-foreground">
              Erkannt als: <span className="font-medium">{DOKUMENT_TYP_LABEL[item.typ]}</span>{" "}
              {item.konfidenz ? `(${Math.round(item.konfidenz * 100)}% sicher)` : ""}
            </p>
            {item.begruendung && (
              <p className="mt-0.5 text-xs text-muted-foreground/80">„{item.begruendung}“</p>
            )}
            {item.fehler && (
              <p className="mt-0.5 text-xs text-[var(--destructive)]">⚠️ {item.fehler}</p>
            )}
          </div>
        </div>
        <button
          onClick={onVerwerfen}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Verwerfen
        </button>
      </div>
      {children}
    </div>
  );
}

function QueueCard(props: {
  item: Item;
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
  mietvertraege: Mietvertrag[];
  pmVertraege: PmVertrag[];
  eigentuemerListe: Eigentuemer[];
  onErledigt: (patch: Partial<Item>) => void;
  onReload: () => void;
}) {
  const { item, onErledigt, onReload } = props;
  const [busy, setBusy] = useState(false);

  const verwerfen = () => onErledigt({ status: "verworfen" });

  if (item.typ === "mietvertrag" && item.mietvertrag) {
    return (
      <MietvertragCard {...props} onBusy={setBusy} busy={busy} verwerfen={verwerfen} onReload={onReload} />
    );
  }
  if ((item.typ === "mietvertrag_nachtrag" || item.typ === "uebergabeprotokoll") && item.nachtrag) {
    return (
      <NachtragCard {...props} onBusy={setBusy} busy={busy} verwerfen={verwerfen} onReload={onReload} />
    );
  }
  if (item.typ === "pm_vertrag" && item.pmVertrag) {
    return <PmVertragCard {...props} onBusy={setBusy} busy={busy} verwerfen={verwerfen} onReload={onReload} />;
  }
  if (
    (item.typ === "eigentuemer_dokument" || item.typ === "grundbuchauszug" || item.typ === "kaufvertrag") &&
    item.eigentuemerDokument
  ) {
    return (
      <EigentuemerDokCard {...props} onBusy={setBusy} busy={busy} verwerfen={verwerfen} onReload={onReload} />
    );
  }
  if (item.typ === "liegenschaftskarte" && item.liegenschaftskarte) {
    return (
      <LiegenschaftskarteCard {...props} onBusy={setBusy} busy={busy} verwerfen={verwerfen} onReload={onReload} />
    );
  }

  // Unbekannt / nicht automatisch verarbeitbar
  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      <p className="text-sm text-muted-foreground">
        Konnte nicht eindeutig zugeordnet werden. Bitte manuell im passenden Menüpunkt hochladen
        oder verwerfen.
      </p>
    </CardShell>
  );
}

function MietvertragCard(
  props: {
    item: Item;
    wohnungen: Wohnung[];
    gebaeude: Gebaeude[];
    liegenschaften: Liegenschaft[];
    busy: boolean;
    onBusy: (b: boolean) => void;
    verwerfen: () => void;
    onErledigt: (patch: Partial<Item>) => void;
    onReload: () => void;
  } & Record<string, any>
) {
  const { item, wohnungen, gebaeude, liegenschaften, busy, onBusy, verwerfen, onErledigt, onReload } = props;
  const e = item.mietvertrag!.extraktion;
  const v = item.mietvertrag!.vorschlag;

  const [wohnungId, setWohnungId] = useState(v.wohnungId || "");
  const [mieterModus, setMieterModus] = useState<"vorhanden" | "neu">(v.mieterId ? "vorhanden" : "neu");
  const [gewaehlterMieter, setGewaehlterMieter] = useState(v.mieterId || "");
  const [mieterName, setMieterName] = useState(e.mieterName || "");
  const [sollMiete, setSollMiete] = useState(String(e.sollMiete ?? ""));
  const [nk, setNk] = useState(String(e.nebenkostenVorauszahlung ?? ""));
  const [kaution, setKaution] = useState(String(e.kaution ?? ""));
  const [mietbeginn, setMietbeginn] = useState(e.mietbeginn || "");
  const [mietende, setMietende] = useState(e.mietende || "");

  const wohnungLabel = (w: Wohnung) => {
    const g = gebaeude.find((x) => x.id === w.gebaeudeId);
    const l = g ? liegenschaften.find((x) => x.id === g.liegenschaftId) : undefined;
    return `${l?.name ? l.name + " · " : ""}${g?.name ? g.name + " · " : ""}${w.bezeichnung}`;
  };

  const bestaetigen = async () => {
    if (!wohnungId) return;
    onBusy(true);
    try {
      let mieterId = gewaehlterMieter || undefined;
      if (mieterModus === "neu") {
        const res = await fetch("/api/mieter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wohnungId,
            name: mieterName || "Neuer Mieter",
            mietbeginn,
            mietende,
            kaltmiete: Number(sollMiete) || undefined,
            nebenkostenVorauszahlung: Number(nk) || undefined,
          }),
        });
        const json = await res.json();
        mieterId = json.mieter?.id;
      }
      await fetch("/api/mietvertraege", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wohnungId,
          mieterId,
          dateiName: item.dateiName,
          storedFileName: item.storedFileName,
          mimeType: item.mimeType,
          sollMiete: Number(sollMiete) || undefined,
          nebenkostenVorauszahlung: Number(nk) || undefined,
          kaution: Number(kaution) || undefined,
          mietbeginn,
          mietende,
          extraktText: item.extraktText,
          status: "Aktiv",
        }),
      });
      onErledigt({ status: "gespeichert", meldung: "Mietvertrag übernommen und abgelegt." });
      onReload();
    } finally {
      onBusy(false);
    }
  };

  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
          <span className="text-muted-foreground">Wohnung</span>
          <select
            value={wohnungId}
            onChange={(ev) => setWohnungId(ev.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— wählen —</option>
            {wohnungen.map((w: Wohnung) => (
              <option key={w.id} value={w.id}>
                {wohnungLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Mieter</span>
          <div className="flex gap-1">
            <select
              value={mieterModus}
              onChange={(ev) => setMieterModus(ev.target.value as any)}
              className="rounded border border-border bg-background px-1 py-1.5 text-xs"
            >
              <option value="vorhanden">Vorh.</option>
              <option value="neu">Neu</option>
            </select>
          </div>
        </label>
        {mieterModus === "neu" ? (
          <Field label="Name (neuer Mieter)" value={mieterName} onChange={setMieterName} />
        ) : (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Bestehender Mieter</span>
            <select
              value={gewaehlterMieter}
              onChange={(ev) => setGewaehlterMieter(ev.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— wählen —</option>
              {props.mieter.map((m: Mieter) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field label="Kaltmiete (€)" value={sollMiete} onChange={setSollMiete} type="number" />
        <Field label="NK-Vorauszahlung (€)" value={nk} onChange={setNk} type="number" />
        <Field label="Kaution (€)" value={kaution} onChange={setKaution} type="number" />
        <Field label="Mietbeginn" value={mietbeginn} onChange={setMietbeginn} />
        <Field label="Mietende" value={mietende} onChange={setMietende} />
      </div>
      <button
        onClick={bestaetigen}
        disabled={busy || !wohnungId || (mieterModus === "neu" && !mieterName.trim())}
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere…" : "✓ Übernehmen & ablegen"}
      </button>
    </CardShell>
  );
}

function NachtragCard(
  props: {
    item: Item;
    mietvertraege: Mietvertrag[];
    mieter: Mieter[];
    busy: boolean;
    onBusy: (b: boolean) => void;
    verwerfen: () => void;
    onErledigt: (patch: Partial<Item>) => void;
    onReload: () => void;
  } & Record<string, any>
) {
  const { item, mietvertraege, mieter, busy, onBusy, verwerfen, onErledigt, onReload } = props;
  const e = item.nachtrag!.extraktion;
  const v = item.nachtrag!.vorschlag;
  const [mietvertragId, setMietvertragId] = useState(v.mietvertragId || "");
  const [modus, setModus] = useState<"automatisch" | "manuell">("manuell");
  const [sollMiete, setSollMiete] = useState(e.sollMiete ? String(e.sollMiete) : "");
  const [nk, setNk] = useState(e.nebenkostenVorauszahlung ? String(e.nebenkostenVorauszahlung) : "");
  const [kaution, setKaution] = useState(e.kaution ? String(e.kaution) : "");
  const [mietbeginn, setMietbeginn] = useState(e.mietbeginn || "");
  const [mietende, setMietende] = useState(e.mietende || "");

  const mvLabel = (mv: Mietvertrag) => {
    const m = mieter.find((x: Mieter) => x.id === mv.mieterId);
    return `${m?.name || "Ohne Mieter"} (${mv.nummer || mv.id.slice(0, 6)})`;
  };

  const bestaetigen = async () => {
    onBusy(true);
    try {
      const anhang = {
        id: crypto.randomUUID(),
        typ: item.typ === "uebergabeprotokoll" ? "Uebergabeprotokoll" : "Nachtrag",
        dateiName: item.dateiName,
        storedFileName: item.storedFileName,
        mimeType: item.mimeType,
        hochgeladenAm: new Date().toISOString(),
        extraktText: item.extraktText,
        notizen: e.hinweis,
      };

      if (mietvertragId) {
        const bestehend = mietvertraege.find((mv: Mietvertrag) => mv.id === mietvertragId);
        const patch: any = { anhaenge: [...(bestehend?.anhaenge || []), anhang] };
        if (modus === "automatisch") {
          if (mietbeginn) patch.mietbeginn = mietbeginn;
          if (mietende) patch.mietende = mietende;
          if (sollMiete) patch.sollMiete = Number(sollMiete);
          if (nk) patch.nebenkostenVorauszahlung = Number(nk);
          if (kaution) patch.kaution = Number(kaution);
        }
        await fetch(`/api/mietvertraege/${mietvertragId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      }

      onErledigt({
        status: "gespeichert",
        meldung: mietvertragId
          ? modus === "automatisch"
            ? "Nachtrag abgelegt, Stammdaten automatisch aktualisiert."
            : "Nachtrag abgelegt. Stammdaten bitte manuell im Mietvertrag prüfen."
          : "Nachtrag ohne Zuordnung zu einem bestehenden Mietvertrag gespeichert.",
      });
      onReload();
    } finally {
      onBusy(false);
    }
  };

  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      {e.hinweis && (
        <p className="mb-3 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          ℹ️ {e.hinweis}
        </p>
      )}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
          <span className="text-muted-foreground">Betroffener Mietvertrag</span>
          <select
            value={mietvertragId}
            onChange={(ev) => setMietvertragId(ev.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— manuell zuordnen (nur ablegen) —</option>
            {mietvertraege.map((mv: Mietvertrag) => (
              <option key={mv.id} value={mv.id}>
                {mvLabel(mv)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Modus</span>
          <select
            value={modus}
            onChange={(ev) => setModus(ev.target.value as any)}
            disabled={!mietvertragId}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="manuell">Nur ablegen, Stammdaten manuell prüfen</option>
            <option value="automatisch">Stammdaten automatisch übernehmen</option>
          </select>
        </label>
      </div>
      {modus === "automatisch" && mietvertragId && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Kaltmiete (€)" value={sollMiete} onChange={setSollMiete} type="number" />
          <Field label="NK-Vorauszahlung (€)" value={nk} onChange={setNk} type="number" />
          <Field label="Kaution (€)" value={kaution} onChange={setKaution} type="number" />
          <Field label="Mietbeginn" value={mietbeginn} onChange={setMietbeginn} />
          <Field label="Mietende" value={mietende} onChange={setMietende} />
        </div>
      )}
      <button
        onClick={bestaetigen}
        disabled={busy}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere…" : "✓ Ablegen"}
      </button>
    </CardShell>
  );
}

function PmVertragCard(
  props: {
    item: Item;
    liegenschaften: Liegenschaft[];
    busy: boolean;
    onBusy: (b: boolean) => void;
    verwerfen: () => void;
    onErledigt: (patch: Partial<Item>) => void;
    onReload: () => void;
  } & Record<string, any>
) {
  const { item, liegenschaften, busy, onBusy, verwerfen, onErledigt, onReload } = props;
  const e = item.pmVertrag!.extraktion;
  const v = item.pmVertrag!.vorschlag;
  const [modus, setModus] = useState<"vorhanden" | "neu">(v.liegenschaftId ? "vorhanden" : "neu");
  const [liegenschaftId, setLiegenschaftId] = useState(v.liegenschaftId || "");
  const [neu, setNeu] = useState({
    name: v.neuanlage?.name || "",
    strasse: v.neuanlage?.strasse || "",
    hausnummer: v.neuanlage?.hausnummer || "",
    plz: v.neuanlage?.plz || "",
    ort: v.neuanlage?.ort || "",
  });

  const bestaetigen = async () => {
    onBusy(true);
    try {
      let lgId = liegenschaftId;
      if (modus === "neu") {
        const res = await fetch("/api/liegenschaften", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(neu),
        });
        const json = await res.json();
        lgId = json.liegenschaft?.id;
      }
      if (!lgId) return;

      await fetch("/api/pm-vertrag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liegenschaftId: lgId,
          dateiName: item.dateiName,
          storedFileName: item.storedFileName,
          mimeType: item.mimeType,
          verwalterName: e.verwalterName,
          auftraggeberName: e.auftraggeberName,
          honorarModell: e.honorarModell,
          honorarSatz: e.honorarSatz,
          leistungsumfang: e.leistungsumfang,
          laufzeitBeginn: e.laufzeitBeginn,
          laufzeitEnde: e.laufzeitEnde,
          kuendigungsfrist: e.kuendigungsfrist,
          extraktText: item.extraktText,
          status: "Aktiv",
        }),
      });
      onErledigt({ status: "gespeichert", meldung: "PM-Vertrag übernommen und abgelegt." });
      onReload();
    } finally {
      onBusy(false);
    }
  };

  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      {v.pmVertragId && (
        <p className="mb-3 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          ℹ️ Für diese Liegenschaft existiert bereits ein PM-Vertrag. Beim Übernehmen wird
          zusätzlich ein weiterer Vertrag angelegt – bitte im Menü „PM-Vertrag“ ggf. bereinigen.
        </p>
      )}
      <LiegenschaftAuswahl
        modus={modus}
        setModus={setModus}
        liegenschaftId={liegenschaftId}
        setLiegenschaftId={setLiegenschaftId}
        liegenschaften={liegenschaften}
        neu={neu}
        setNeu={setNeu}
      />
      <button
        onClick={bestaetigen}
        disabled={busy || (modus === "vorhanden" ? !liegenschaftId : !neu.name.trim())}
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere…" : "✓ Übernehmen & ablegen"}
      </button>
    </CardShell>
  );
}

function EigentuemerDokCard(
  props: {
    item: Item;
    liegenschaften: Liegenschaft[];
    eigentuemerListe: Eigentuemer[];
    busy: boolean;
    onBusy: (b: boolean) => void;
    verwerfen: () => void;
    onErledigt: (patch: Partial<Item>) => void;
    onReload: () => void;
  } & Record<string, any>
) {
  const { item, liegenschaften, eigentuemerListe, busy, onBusy, verwerfen, onErledigt, onReload } = props;
  const e = item.eigentuemerDokument!.extraktion;
  const v = item.eigentuemerDokument!.vorschlag;
  const [aktion, setAktion] = useState<"anhang" | "neu">(v.eigentuemerId ? "anhang" : "neu");
  const [eigentuemerId, setEigentuemerId] = useState(v.eigentuemerId || "");
  const [modus, setModus] = useState<"vorhanden" | "neu">(v.liegenschaftId ? "vorhanden" : "neu");
  const [liegenschaftId, setLiegenschaftId] = useState(v.liegenschaftId || "");
  const [neu, setNeu] = useState({
    name: v.neuanlage?.name || "",
    strasse: v.neuanlage?.strasse || "",
    hausnummer: v.neuanlage?.hausnummer || "",
    plz: v.neuanlage?.plz || "",
    ort: v.neuanlage?.ort || "",
  });

  const anhang = {
    id: crypto.randomUUID(),
    typ: item.eigentuemerDokument!.anhangTyp,
    dateiName: item.dateiName,
    storedFileName: item.storedFileName,
    mimeType: item.mimeType,
    hochgeladenAm: new Date().toISOString(),
    extraktText: item.extraktText,
  };

  const bestaetigen = async () => {
    onBusy(true);
    try {
      if (aktion === "anhang" && eigentuemerId) {
        const bestehend = eigentuemerListe.find((eg: Eigentuemer) => eg.id === eigentuemerId);
        await fetch(`/api/eigentuemer/${eigentuemerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anhaenge: [...(bestehend?.anhaenge || []), anhang] }),
        });
        onErledigt({
          status: "gespeichert",
          meldung: `Als ${item.eigentuemerDokument!.anhangTyp} beim bestehenden Eigentümer abgelegt.`,
        });
        onReload();
        return;
      }

      let lgId = liegenschaftId;
      if (modus === "neu") {
        const res = await fetch("/api/liegenschaften", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(neu),
        });
        const json = await res.json();
        lgId = json.liegenschaft?.id;
      }
      if (!lgId) return;

      const res2 = await fetch("/api/eigentuemer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liegenschaftId: lgId,
          name: e.eigentuemerName || "Neuer Eigentümer",
          anschrift: e.anschrift,
          email: e.email,
          telefon: e.telefon,
          miteigentumsanteil: e.miteigentumsanteil,
          vollmachtVon: e.vollmachtBeginn,
          vollmachtBis: e.vollmachtEnde,
          extraktText: item.extraktText,
        }),
      });
      const json2 = await res2.json();
      const neuerId = json2.eigentuemer?.id;
      if (neuerId) {
        await fetch(`/api/eigentuemer/${neuerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anhaenge: [anhang] }),
        });
      }
      onErledigt({ status: "gespeichert", meldung: "Neuer Eigentümer angelegt, Dokument abgelegt." });
      onReload();
    } finally {
      onBusy(false);
    }
  };

  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      {v.eigentuemerId && (
        <label className="mb-3 flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Aktion</span>
          <select
            value={aktion}
            onChange={(ev) => setAktion(ev.target.value as any)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="anhang">
              Als „{item.eigentuemerDokument!.anhangTyp}“ bei bestehendem Eigentümer „
              {v.eigentuemerName}“ ablegen
            </option>
            <option value="neu">Stattdessen neuen Eigentümer anlegen</option>
          </select>
        </label>
      )}
      {aktion === "neu" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Name" value={neu.name} onChange={(val) => setNeu({ ...neu, name: val })} />
          </div>
          <LiegenschaftAuswahl
            modus={modus}
            setModus={setModus}
            liegenschaftId={liegenschaftId}
            setLiegenschaftId={setLiegenschaftId}
            liegenschaften={liegenschaften}
            neu={neu}
            setNeu={setNeu}
          />
        </>
      )}
      <button
        onClick={bestaetigen}
        disabled={
          busy ||
          (aktion === "anhang"
            ? !eigentuemerId
            : modus === "vorhanden"
            ? !liegenschaftId
            : !neu.name.trim())
        }
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere…" : "✓ Übernehmen & ablegen"}
      </button>
    </CardShell>
  );
}

function LiegenschaftskarteCard(
  props: {
    item: Item;
    pmVertraege: PmVertrag[];
    liegenschaften: Liegenschaft[];
    busy: boolean;
    onBusy: (b: boolean) => void;
    verwerfen: () => void;
    onErledigt: (patch: Partial<Item>) => void;
    onReload: () => void;
  } & Record<string, any>
) {
  const { item, pmVertraege, liegenschaften, busy, onBusy, verwerfen, onErledigt, onReload } = props;
  const v = item.liegenschaftskarte!.vorschlag;
  const [pmVertragId, setPmVertragId] = useState(v.pmVertragId || "");

  const pmLabel = (pm: PmVertrag) => {
    const l = liegenschaften.find((x: Liegenschaft) => x.id === pm.liegenschaftId);
    return `${l?.name || "Ohne Liegenschaft"} (${pm.nummer || pm.id.slice(0, 6)})`;
  };

  const bestaetigen = async () => {
    if (!pmVertragId) return;
    onBusy(true);
    try {
      const res = await fetch(`/api/pm-vertrag/${pmVertragId}`);
      const json = await res.json();
      const bestehend: PmVertrag | undefined = json.pmVertrag;
      const anhang = {
        id: crypto.randomUUID(),
        typ: item.liegenschaftskarte!.anhangTyp,
        dateiName: item.dateiName,
        storedFileName: item.storedFileName,
        mimeType: item.mimeType,
        hochgeladenAm: new Date().toISOString(),
        extraktText: item.extraktText,
      };
      await fetch(`/api/pm-vertrag/${pmVertragId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anhaenge: [...(bestehend?.anhaenge || []), anhang] }),
      });
      onErledigt({
        status: "gespeichert",
        meldung: `Als „${item.liegenschaftskarte!.anhangTyp}“ beim PM-Vertrag abgelegt.`,
      });
      onReload();
    } finally {
      onBusy(false);
    }
  };

  return (
    <CardShell item={item} onVerwerfen={verwerfen}>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">PM-Vertrag, dem das Dokument zugeordnet wird</span>
        <select
          value={pmVertragId}
          onChange={(ev) => setPmVertragId(ev.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">— wählen —</option>
          {pmVertraege.map((pm: PmVertrag) => (
            <option key={pm.id} value={pm.id}>
              {pmLabel(pm)}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={bestaetigen}
        disabled={busy || !pmVertragId}
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Speichere…" : "✓ Als Anhang ablegen"}
      </button>
    </CardShell>
  );
}

function LiegenschaftAuswahl({
  modus,
  setModus,
  liegenschaftId,
  setLiegenschaftId,
  liegenschaften,
  neu,
  setNeu,
}: {
  modus: "vorhanden" | "neu";
  setModus: (m: "vorhanden" | "neu") => void;
  liegenschaftId: string;
  setLiegenschaftId: (id: string) => void;
  liegenschaften: Liegenschaft[];
  neu: { name: string; strasse: string; hausnummer: string; plz: string; ort: string };
  setNeu: (n: any) => void;
}) {
  return (
    <div>
      <label className="mb-2 flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Liegenschaft</span>
        <select
          value={modus}
          onChange={(ev) => setModus(ev.target.value as any)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="vorhanden">Bestehende Liegenschaft wählen</option>
          <option value="neu">Neue Liegenschaft anlegen</option>
        </select>
      </label>
      {modus === "vorhanden" ? (
        <select
          value={liegenschaftId}
          onChange={(ev) => setLiegenschaftId(ev.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">— wählen —</option>
          {liegenschaften.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.strasse} {l.hausnummer}, {l.plz} {l.ort})
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="Name" value={neu.name} onChange={(v) => setNeu({ ...neu, name: v })} />
          <Field label="Straße" value={neu.strasse} onChange={(v) => setNeu({ ...neu, strasse: v })} />
          <Field label="Nr." value={neu.hausnummer} onChange={(v) => setNeu({ ...neu, hausnummer: v })} />
          <Field label="PLZ" value={neu.plz} onChange={(v) => setNeu({ ...neu, plz: v })} />
          <Field label="Ort" value={neu.ort} onChange={(v) => setNeu({ ...neu, ort: v })} />
        </div>
      )}
    </div>
  );
}
