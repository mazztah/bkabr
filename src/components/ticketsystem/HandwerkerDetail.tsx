"use client";

import { useMemo, useRef, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  AnhangTyp,
  HANDWERKER_GEWERKE,
  Handwerker,
  HandwerkerGewerk,
  HandwerkerStatus,
  HandwerkerTrackrecordEintrag,
  Ticket,
} from "@/lib/types";
import { Anhaenge, hochladenUndAnhaengen } from "@/components/Anhaenge";

const TABS = ["Stammdaten", "Lebenslauf", "Dokumente", "Trackrecord"] as const;
type Tab = (typeof TABS)[number];

const HANDWERKER_DOK_TYPEN: AnhangTyp[] = [
  "Gewerbeschein",
  "Versicherungsnachweis",
  "Zertifikat",
  "Lebenslauf",
  "Sonstiges",
];

async function patchHandwerker(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/handwerker/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function InlineField({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value?: string | number;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  if (editing) {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="mt-1 flex gap-1">
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(draft);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
            className="rounded bg-primary px-2 text-xs text-primary-foreground"
          >
            ✓
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="block w-full text-left">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value || <span className="text-muted-foreground/60">—</span>}</div>
    </button>
  );
}

function LebenslaufUploadButton({
  handwerkerId,
  label,
  onDone,
}: {
  handwerkerId: string;
  label: string;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const anhang = await hochladenUndAnhaengen(file, "Lebenslauf");
      if (!anhang) return;
      await patchHandwerker(handwerkerId, { lebenslaufDokument: anhang });
      onDone();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {busy ? "Lade hoch…" : label}
      </button>
    </>
  );
}

function TrackrecordListe({ eintraege, onDelete }: { eintraege: HandwerkerTrackrecordEintrag[]; onDelete?: (id: string) => void }) {
  if (eintraege.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge.</p>;
  }
  const statusStyle: Record<HandwerkerTrackrecordEintrag["status"], string> = {
    offen: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    erledigt: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    abgelehnt: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <ul className="space-y-2">
      {eintraege
        .slice()
        .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
        .map((t) => (
          <li key={t.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {t.titel} {t.ticketNummer && <span className="text-xs text-muted-foreground">({t.ticketNummer})</span>}
                </div>
                {t.beschreibung && <p className="mt-0.5 text-xs text-muted-foreground">{t.beschreibung}</p>}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(t.datum)}</span>
                  <span>·</span>
                  <span>{t.quelle === "intern" ? "aus Ticketsystem" : "extern erfasst"}</span>
                  {t.bewertung && (
                    <>
                      <span>·</span>
                      <span>{"★".repeat(t.bewertung)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusStyle[t.status])}>
                  {t.status}
                </span>
                {t.quelle === "extern" && onDelete && (
                  <button
                    onClick={() => onDelete(t.id)}
                    className="text-xs text-muted-foreground hover:text-red-600"
                    title="Eintrag löschen"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
    </ul>
  );
}

export default function HandwerkerDetail({
  handwerker,
  tickets,
  onChanged,
  onSelectTicket,
}: {
  handwerker: Handwerker;
  tickets: Ticket[];
  onChanged: () => void;
  onSelectTicket?: (ticketId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Stammdaten");
  const [busy, setBusy] = useState(false);

  // Extern-Trackrecord-Formular
  const [showExtern, setShowExtern] = useState(false);
  const [externTitel, setExternTitel] = useState("");
  const [externBeschreibung, setExternBeschreibung] = useState("");
  const [externStatus, setExternStatus] = useState<HandwerkerTrackrecordEintrag["status"]>("erledigt");
  const [externBewertung, setExternBewertung] = useState<number | "">("");

  const zugewieseneTickets = useMemo(
    () => tickets.filter((t) => t.handwerkerId === handwerker.id),
    [tickets, handwerker.id]
  );
  const offeneAnzahl = zugewieseneTickets.filter(
    (t) => !["Erledigt", "Abgelehnt", "Storniert"].includes(t.status)
  ).length;
  const erledigtAnzahl = zugewieseneTickets.filter((t) => t.status === "Erledigt").length;

  const addExternTrackrecord = async () => {
    if (!externTitel.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/handwerker/${handwerker.id}/trackrecord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titel: externTitel,
          beschreibung: externBeschreibung,
          status: externStatus,
          bewertung: externBewertung || undefined,
        }),
      });
      setExternTitel("");
      setExternBeschreibung("");
      setExternBewertung("");
      setShowExtern(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const deleteExternTrackrecord = async (eintragId: string) => {
    await fetch(`/api/handwerker/${handwerker.id}/trackrecord?eintragId=${eintragId}`, {
      method: "DELETE",
    });
    onChanged();
  };

  const deleteHandwerker = async () => {
    if (!window.confirm(`Handwerker „${handwerker.name}" wirklich löschen?`)) return;
    await fetch(`/api/handwerker/${handwerker.id}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{handwerker.nummer}</div>
          <h1 className="text-xl font-bold">🧰 {handwerker.name}</h1>
          <p className="text-sm text-muted-foreground">
            {handwerker.gewerk}
            {handwerker.firma ? ` · ${handwerker.firma}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={handwerker.status}
            onChange={(e) => patchHandwerker(handwerker.id, { status: e.target.value as HandwerkerStatus }).then(onChanged)}
            className="rounded-full border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="aktiv">🟢 aktiv</option>
            <option value="inaktiv">⚪ inaktiv</option>
            <option value="gesperrt">🔴 gesperrt</option>
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-bold">{zugewieseneTickets.length}</div>
          <div className="text-xs text-muted-foreground">Aufträge gesamt</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-bold text-amber-600">{offeneAnzahl}</div>
          <div className="text-xs text-muted-foreground">offen</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-bold text-emerald-600">{erledigtAnzahl}</div>
          <div className="text-xs text-muted-foreground">erledigt</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-bold">
            {handwerker.stundensatz ? formatCurrency(handwerker.stundensatz) : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Stundensatz</div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Stammdaten" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InlineField label="Name" value={handwerker.name} onSave={(v) => patchHandwerker(handwerker.id, { name: v }).then(onChanged)} />
          <InlineField label="Firma" value={handwerker.firma} onSave={(v) => patchHandwerker(handwerker.id, { firma: v }).then(onChanged)} />
          <div>
            <label className="text-xs font-medium text-muted-foreground">Gewerk</label>
            <select
              value={handwerker.gewerk}
              onChange={(e) => patchHandwerker(handwerker.id, { gewerk: e.target.value as HandwerkerGewerk }).then(onChanged)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {HANDWERKER_GEWERKE.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <InlineField
            label="Stundensatz (€)"
            value={handwerker.stundensatz}
            type="number"
            onSave={(v) => patchHandwerker(handwerker.id, { stundensatz: Number(v) || undefined }).then(onChanged)}
          />
          <InlineField label="E-Mail" value={handwerker.email} onSave={(v) => patchHandwerker(handwerker.id, { email: v }).then(onChanged)} />
          <InlineField label="Telefon" value={handwerker.telefon} onSave={(v) => patchHandwerker(handwerker.id, { telefon: v }).then(onChanged)} />
          <div className="sm:col-span-2">
            <InlineField label="Adresse" value={handwerker.adresse} onSave={(v) => patchHandwerker(handwerker.id, { adresse: v }).then(onChanged)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notizen</label>
            <textarea
              defaultValue={handwerker.notizen}
              onBlur={(e) => patchHandwerker(handwerker.id, { notizen: e.target.value }).then(onChanged)}
              rows={3}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2 border-t border-border pt-3">
            <button onClick={deleteHandwerker} className="text-xs text-red-600 hover:underline">
              Handwerker löschen
            </button>
          </div>
        </div>
      )}

      {tab === "Lebenslauf" && (
        <div>
          <div className="mb-3 rounded-lg border border-border p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">CV-Datei (PDF/Bild)</div>
            {handwerker.lebenslaufDokument ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <a
                  href={`/api/files/${handwerker.lebenslaufDokument.storedFileName}?mime=${encodeURIComponent(
                    handwerker.lebenslaufDokument.mimeType
                  )}&name=${encodeURIComponent(handwerker.lebenslaufDokument.dateiName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  📄 {handwerker.lebenslaufDokument.dateiName}
                </a>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(handwerker.lebenslaufDokument.hochgeladenAm)}</span>
                  <LebenslaufUploadButton
                    label="Ersetzen"
                    handwerkerId={handwerker.id}
                    onDone={onChanged}
                  />
                  <button
                    onClick={() => patchHandwerker(handwerker.id, { lebenslaufDokument: undefined }).then(onChanged)}
                    className="hover:text-red-600"
                    title="CV-Datei entfernen"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Noch keine CV-Datei hinterlegt.</p>
                <LebenslaufUploadButton label="+ CV hochladen" handwerkerId={handwerker.id} onDone={onChanged} />
              </div>
            )}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Werdegang, Qualifikationen, Erfahrung, Referenzen – frei editierbar.
          </p>
          <textarea
            defaultValue={handwerker.lebenslauf}
            onBlur={(e) => patchHandwerker(handwerker.id, { lebenslauf: e.target.value }).then(onChanged)}
            rows={12}
            placeholder="z.B. Ausbildung, Meistertitel, Jahre Erfahrung, Spezialisierungen, Referenzobjekte …"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm leading-relaxed"
          />
        </div>
      )}

      {tab === "Dokumente" && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Gewerbeschein, Versicherungsnachweis, Zertifikate, Lebenslauf als Datei, sonstige Unterlagen.
          </p>
          <Anhaenge
            anhaenge={handwerker.dokumente}
            typen={HANDWERKER_DOK_TYPEN}
            onUpload={async (typ, file) => {
              const anhang = await hochladenUndAnhaengen(file, typ);
              if (!anhang) return;
              await patchHandwerker(handwerker.id, {
                dokumente: [...(handwerker.dokumente || []), anhang],
              });
              onChanged();
            }}
          />
        </div>
      )}

      {tab === "Trackrecord" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Protokoll aller offenen und erledigten Aufträge – intern automatisch aus Tickets, extern manuell erfasst.
            </p>
            <button
              onClick={() => setShowExtern((v) => !v)}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {showExtern ? "Abbrechen" : "+ Externen Eintrag erfassen"}
            </button>
          </div>

          {showExtern && (
            <div className="mb-3 space-y-2 rounded-lg border border-border p-3">
              <input
                value={externTitel}
                onChange={(e) => setExternTitel(e.target.value)}
                placeholder="Titel (z.B. „Wasserschaden Keller behoben“)"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <textarea
                value={externBeschreibung}
                onChange={(e) => setExternBeschreibung(e.target.value)}
                placeholder="Beschreibung (optional)"
                rows={2}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={externStatus}
                  onChange={(e) => setExternStatus(e.target.value as HandwerkerTrackrecordEintrag["status"])}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="offen">offen</option>
                  <option value="erledigt">erledigt</option>
                  <option value="abgelehnt">abgelehnt</option>
                </select>
                <select
                  value={externBewertung}
                  onChange={(e) => setExternBewertung(e.target.value ? Number(e.target.value) : "")}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Bewertung (optional)</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={addExternTrackrecord}
                disabled={busy || !externTitel.trim()}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Eintrag speichern
              </button>
            </div>
          )}

          <TrackrecordListe eintraege={handwerker.trackrecord || []} onDelete={deleteExternTrackrecord} />

          {zugewieseneTickets.length > 0 && onSelectTicket && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Verknüpfte Tickets im Ticketsystem</p>
              <ul className="space-y-1">
                {zugewieseneTickets.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => onSelectTicket(t.id)} className="text-sm text-primary hover:underline">
                      {t.nummer} · {t.titel}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
