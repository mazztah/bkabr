"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Plus,
  Play,
  Pause,
  Trash2,
  Pencil,
  Clock,
  Repeat,
  CheckCircle2,
  XCircle,
  Loader2,
  Home,
} from "lucide-react";
import Modal from "@/components/Modal";
import { cn } from "@/lib/utils";
import { AgentSchedule, AgentScheduleRecurrence } from "@/lib/types";
import { describeRecurrence } from "@/lib/schedule";
import MeinKalenderTab from "@/components/kalender/MeinKalenderTab";
import TeamTab from "@/components/kalender/TeamTab";

type HauptTab = "mein-kalender" | "routinen" | "team";

export default function KalenderPage() {
  const [tab, setTab] = useState<HauptTab>("mein-kalender");

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex gap-2 border-b border-border text-sm">
        {(
          [
            { key: "mein-kalender", label: "Mein Kalender" },
            { key: "routinen", label: "Agent-Routinen" },
            { key: "team", label: "Team" },
          ] as { key: HauptTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 font-medium",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mein-kalender" && <MeinKalenderTab />}
      {tab === "routinen" && <RoutinenTab />}
      {tab === "team" && <TeamTab />}
    </div>
  );
}

interface LiegenschaftLite {
  id: string;
  name: string;
}

const PRESETS: { label: string; recurrence: AgentScheduleRecurrence; prompt: string }[] = [
  {
    label: "Alle 2 Std. Mahnlauf",
    recurrence: { art: "intervall", minuten: 120 },
    prompt: "Führe den Mahnlauf für alle Mieter mit offenen, überfälligen Forderungen durch.",
  },
  {
    label: "Täglich 23:40 E-Mail-Batch",
    recurrence: { art: "taeglich", uhrzeit: "23:40" },
    prompt: "Versende den heutigen E-Mail-Batch an alle vorbereiteten Empfänger.",
  },
  {
    label: "Montags 08:00 Team-Reminder",
    recurrence: { art: "woechentlich", wochentag: 1, uhrzeit: "08:00" },
    prompt: "Erinnere das Team an den wöchentlichen Teambuilding-Termin und offene Aufgaben.",
  },
];

function emptyRecurrence(art: AgentScheduleRecurrence["art"]): AgentScheduleRecurrence {
  if (art === "intervall") return { art: "intervall", minuten: 120 };
  if (art === "taeglich") return { art: "taeglich", uhrzeit: "20:00" };
  return { art: "woechentlich", wochentag: 1, uhrzeit: "09:00" };
}

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60000);
  if (min < 1) return diffMs >= 0 ? "gleich" : "gerade eben";
  if (min < 60) return diffMs >= 0 ? `in ${min} Min.` : `vor ${min} Min.`;
  const std = Math.round(min / 60);
  if (std < 24) return diffMs >= 0 ? `in ${std} Std.` : `vor ${std} Std.`;
  const tage = Math.round(std / 24);
  return diffMs >= 0 ? `in ${tage} Tg.` : `vor ${tage} Tg.`;
}

const WOCHENTAGE = [
  { v: 0, l: "So" },
  { v: 1, l: "Mo" },
  { v: 2, l: "Di" },
  { v: 3, l: "Mi" },
  { v: 4, l: "Do" },
  { v: 5, l: "Fr" },
  { v: 6, l: "Sa" },
];

function RoutinenTab() {
  const [schedules, setSchedules] = useState<AgentSchedule[] | null>(null);
  const [liegenschaften, setLiegenschaften] = useState<LiegenschaftLite[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgentSchedule | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/kalender");
    const json = await res.json();
    setSchedules(json.schedules || []);
  };

  useEffect(() => {
    load();
    fetch("/api/liegenschaften")
      .then((r) => r.json())
      .then((d) => setLiegenschaften(d.liegenschaften || []))
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (s: AgentSchedule) => {
    setEditing(s);
    setError(null);
    setModalOpen(true);
  };

  const runNow = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/kalender/${id}/run`, { method: "POST" });
      const json = await res.json();
      if (json.schedule) {
        setSchedules((prev) => (prev || []).map((s) => (s.id === id ? json.schedule : s)));
      }
    } finally {
      setRunningId(null);
    }
  };

  const toggleAktiv = async (s: AgentSchedule) => {
    const res = await fetch(`/api/kalender/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aktiv: !s.aktiv }),
    });
    const json = await res.json();
    if (json.schedule) {
      setSchedules((prev) => (prev || []).map((x) => (x.id === s.id ? json.schedule : x)));
    }
  };

  const remove = async (s: AgentSchedule) => {
    if (!confirm(`„${s.name}" wirklich löschen?`)) return;
    await fetch(`/api/kalender/${s.id}`, { method: "DELETE" });
    setSchedules((prev) => (prev || []).filter((x) => x.id !== s.id));
  };

  const sorted = useMemo(
    () =>
      [...(schedules || [])].sort(
        (a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime()
      ),
    [schedules]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="glow-ring-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-white">
            <CalendarClock className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="gradient-text text-xl font-bold leading-tight">Agent-Routinen (Daily Loop)</h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Wiederkehrende Aufträge für den Agenten planen – z. B. „alle 2 Stunden Mahnlauf&rdquo; oder
              „täglich 23:40 Uhr E-Mail-Batch versenden&rdquo;. Der Agent führt fällige Aufgaben
              selbstständig im Hintergrund aus.
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="interactive glow-ring-primary flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          <Plus className="h-4 w-4" /> Neue Aufgabe
        </button>
      </div>

      {schedules === null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade Aufgaben …
        </div>
      )}

      {schedules !== null && sorted.length === 0 && (
        <div className="glass-panel rounded-2xl border border-dashed border-border p-10 text-center">
          <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="font-medium">Noch keine wiederkehrenden Aufgaben</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lege deine erste Aufgabe an – z. B. einen automatischen Mahnlauf oder einen
            regelmäßigen Team-Reminder.
          </p>
          <button
            onClick={openCreate}
            className="interactive mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Erste Aufgabe anlegen
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((s) => {
          const letzterLauf = s.historie?.[0];
          return (
            <div
              key={s.id}
              className={cn(
                "glass-panel interactive relative flex flex-col rounded-2xl p-4",
                !s.aktiv && "opacity-60"
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  {s.liegenschaftName && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Home className="h-3 w-3" /> {s.liegenschaftName}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    s.aktiv
                      ? "bg-[var(--success-bg)] text-[var(--success)]"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s.aktiv ? "aktiv" : "pausiert"}
                </span>
              </div>

              <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{s.prompt}</p>

              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> {describeRecurrence(s.recurrence)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> nächster Lauf {formatRelative(s.nextRunAt)}
                </span>
              </div>

              {letzterLauf && (
                <div
                  className={cn(
                    "mb-3 flex items-start gap-1.5 rounded-lg border p-2 text-[11px]",
                    letzterLauf.status === "erfolg"
                      ? "border-[var(--success-bg)] bg-[var(--success-bg)]/40 text-[var(--success)]"
                      : "border-[var(--danger-bg)] bg-[var(--danger-bg)]/40 text-[var(--destructive)]"
                  )}
                >
                  {letzterLauf.status === "erfolg" ? (
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  )}
                  <span className="line-clamp-2">{letzterLauf.ergebnis}</span>
                </div>
              )}

              <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-3">
                <button
                  onClick={() => runNow(s.id)}
                  disabled={runningId === s.id}
                  title="Jetzt ausführen"
                  className="interactive flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {runningId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => toggleAktiv(s)}
                  title={s.aktiv ? "Pausieren" : "Aktivieren"}
                  className="interactive flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.aktiv ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => openEdit(s)}
                  title="Bearbeiten"
                  className="interactive flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(s)}
                  title="Löschen"
                  className="interactive ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--danger-bg)] hover:text-[var(--destructive)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <ScheduleModal
          editing={editing}
          liegenschaften={liegenschaften}
          onClose={() => setModalOpen(false)}
          onSaved={(s) => {
            setSchedules((prev) => {
              const list = prev || [];
              const exists = list.some((x) => x.id === s.id);
              return exists ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list];
            });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ScheduleModal({
  editing,
  liegenschaften,
  onClose,
  onSaved,
}: {
  editing: AgentSchedule | null;
  liegenschaften: LiegenschaftLite[];
  onClose: () => void;
  onSaved: (s: AgentSchedule) => void;
}) {
  const [name, setName] = useState(editing?.name || "");
  const [prompt, setPrompt] = useState(editing?.prompt || "");
  const [art, setArt] = useState<AgentScheduleRecurrence["art"]>(editing?.recurrence.art || "intervall");
  const [recurrence, setRecurrence] = useState<AgentScheduleRecurrence>(
    editing?.recurrence || emptyRecurrence("intervall")
  );
  const [liegenschaftId, setLiegenschaftId] = useState(editing?.liegenschaftId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setArtAndReset = (a: AgentScheduleRecurrence["art"]) => {
    setArt(a);
    setRecurrence(emptyRecurrence(a));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setName(preset.label);
    setPrompt(preset.prompt);
    setArt(preset.recurrence.art);
    setRecurrence(preset.recurrence);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Bitte einen Namen vergeben.");
    if (!prompt.trim()) return setError("Bitte beschreiben, was der Agent tun soll.");

    setSaving(true);
    try {
      const liegenschaft = liegenschaften.find((l) => l.id === liegenschaftId);
      const body = {
        name: name.trim(),
        prompt: prompt.trim(),
        recurrence,
        liegenschaftId: liegenschaftId || undefined,
        liegenschaftName: liegenschaft?.name,
      };
      const res = await fetch(editing ? `/api/kalender/${editing.id}` : "/api/kalender", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Speichern fehlgeschlagen.");
        return;
      }
      onSaved(json.schedule);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Aufgabe bearbeiten" : "Neue wiederkehrende Aufgabe"} onClose={onClose}>
      <div className="space-y-4">
        {!editing && (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="interactive rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Mahnlauf alle 2 Stunden"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Auftrag für den Agenten
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder='z. B. "Führe den Mahnlauf für alle Mieter mit überfälligen Forderungen durch."'
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Wiederholung</label>
          <div className="mb-2 flex gap-1.5">
            {(
              [
                ["intervall", "Intervall"],
                ["taeglich", "Täglich"],
                ["woechentlich", "Wöchentlich"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setArtAndReset(value)}
                className={cn(
                  "interactive flex-1 rounded-md border px-2 py-1.5 text-xs font-medium",
                  art === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {recurrence.art === "intervall" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">alle</span>
              <input
                type="number"
                min={1}
                value={recurrence.minuten}
                onChange={(e) =>
                  setRecurrence({ art: "intervall", minuten: parseInt(e.target.value, 10) || 1 })
                }
                className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <span className="text-sm text-muted-foreground">Minuten</span>
            </div>
          )}

          {recurrence.art === "taeglich" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">um</span>
              <input
                type="time"
                value={recurrence.uhrzeit}
                onChange={(e) => setRecurrence({ art: "taeglich", uhrzeit: e.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <span className="text-sm text-muted-foreground">Uhr</span>
            </div>
          )}

          {recurrence.art === "woechentlich" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {WOCHENTAGE.map((w) => (
                  <button
                    key={w.v}
                    onClick={() =>
                      setRecurrence({
                        art: "woechentlich",
                        wochentag: w.v,
                        uhrzeit: recurrence.art === "woechentlich" ? recurrence.uhrzeit : "09:00",
                      })
                    }
                    className={cn(
                      "interactive h-8 w-8 rounded-md border text-xs font-medium",
                      recurrence.art === "woechentlich" && recurrence.wochentag === w.v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {w.l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">um</span>
                <input
                  type="time"
                  value={recurrence.art === "woechentlich" ? recurrence.uhrzeit : "09:00"}
                  onChange={(e) =>
                    setRecurrence({
                      art: "woechentlich",
                      wochentag: recurrence.art === "woechentlich" ? recurrence.wochentag : 1,
                      uhrzeit: e.target.value,
                    })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">Uhr</span>
              </div>
            </div>
          )}
        </div>

        {liegenschaften.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Liegenschaft (optional)
            </label>
            <select
              value={liegenschaftId}
              onChange={(e) => setLiegenschaftId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">— keine —</option>
              {liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="interactive flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
