"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cn, fetchJson, formatDate } from "@/lib/utils";
import { KNOWN_FREE_TIER_LIMITS } from "@/lib/llm-observability";
import type {
  LedEntry,
  ModelCatalogEntry,
  ObservabilityOverview,
  RateLimitEvent,
} from "@/lib/types";

/**
 * LLM Mission Control (Super Spielekind-Agent)
 * ----------------------------------------------
 * Zentrales Observability-Dashboard mit:
 *  - LED-Wall (System- & Hausverwaltungs-Status)
 *  - Live-Systemlogs (SSE, Fly.io-ähnlich)
 *  - LLM-Observatory (alle 13+ Fallback-Modelle mit Health, Popups, Links)
 *  - Cost & Rate-Limit-Observatory
 *  - Agent-Audit (protokollierte Aktionen + Plausibilitäts-Check)
 */
export default function MissionControlPage() {
  const [overview, setOverview] = useState<ObservabilityOverview | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [funMode, setFunMode] = useState(false);
  const [logs, setLogs] = useState<{ id: string; zeitpunkt: string; text: string; typ: string }[]>([]);
  const [flyLogs, setFlyLogs] = useState<
    { id: string; zeitpunkt: string; text: string; typ: string; machine?: string; region?: string }[]
  >([]);
  const [flyLogStatus, setFlyLogStatus] = useState<{ active: boolean; error: string | null }>({
    active: false,
    error: null,
  });
  const [funComments, setFunComments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [aktiverTab, setAktiverTab] = useState<
    "observatory" | "logs" | "cost" | "audit" | "leds"
  >("observatory");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState<ModelCatalogEntry | null>(null);

  // Basis-Daten laden
  useEffect(() => {
    fetchJson<{ overview: ObservabilityOverview | null }>("/api/dashboard/observability")
      .then((d) => {
        if (d.overview) {
          setOverview(d.overview);
          setFunMode(d.overview.summary.funMode);
        }
        setLoading(false);
      })
      .catch((err) => {
        setFehler(err?.message || "Konnte nicht geladen werden.");
        setLoading(false);
      });
  }, []);

  // Live-Logs per SSE
  useEffect(() => {
    const es = new EventSource("/api/dashboard/log-stream");
// Nimm das "log"-Feld robust aus dem SSE-Payload, um doppelte
    // Verschachtelung (array-in-object) defensiv zu behandeln.
const extractLog = (data: Record<string, unknown>): { id: string; zeitpunkt: string; text: string; typ: string }[] => {
      const raw = data.log;
      if (Array.isArray(raw)) return raw as { id: string; zeitpunkt: string; text: string; typ: string }[];
      // Falls verschachtelt: { log: { log: [...] } }
      if (raw && typeof raw === "object" && Array.isArray((raw as { log?: unknown }).log)) {
        return (raw as { log: { id: string; zeitpunkt: string; text: string; typ: string }[] }).log;
      }
      return [];
    };
    // Nimm das "flyLog"-Feld (Fly.io-NATS-Logs) robust aus dem SSE-Payload.
    const extractFlyLog = (
      data: Record<string, unknown>
    ): { id: string; zeitpunkt: string; text: string; typ: string; machine?: string; region?: string }[] => {
      const raw = data.flyLog;
      if (Array.isArray(raw)) {
        return raw as { id: string; zeitpunkt: string; text: string; typ: string; machine?: string; region?: string }[];
      }
      return [];
    };
    // Setzt Verbindungsstatus (active/error) der Fly-NATS-Verbindung.
    const applyFlyStatus = (data: Record<string, unknown>) => {
      const st = data.flyLogStatus;
      if (st && typeof st === "object") {
        setFlyLogStatus({
          active: Boolean((st as { active?: boolean }).active),
          error: (st as { error?: string | null }).error ?? null,
        });
      }
    };
    const applyStream = (data: Record<string, unknown>) => {
      const extracted = extractLog(data);
      if (extracted.length > 0) setLogs(extracted);
      const extractedFly = extractFlyLog(data);
      if (extractedFly.length > 0) setFlyLogs(extractedFly);
      applyFlyStatus(data);
      if (data.overview) setOverview(data.overview as ObservabilityOverview);
    };
    es.onmessage = (ev) => {
      try {
        applyStream(JSON.parse(ev.data));
      } catch {
        /* ignorieren */
      }
    };
    es.addEventListener("init", (ev) => {
      try {
        applyStream(JSON.parse((ev as MessageEvent).data));
      } catch {
        /* ignorieren */
      }
    });
    es.addEventListener("log", (ev) => {
      try {
        applyStream(JSON.parse((ev as MessageEvent).data));
      } catch {
        /* ignorieren */
      }
    });
    es.addEventListener("fun", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data.text) setFunComments((prev) => [data.text, ...prev].slice(0, 6));
      } catch {
        /* ignorieren */
      }
    });
    return () => es.close();
  }, [overview]);

  // Auto-Scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const aktion = useCallback(
    async (action: "ping" | "monthly_update" | "set_fun_mode", modelId?: string, enabled?: boolean) => {
      try {
        const res = await fetch("/api/dashboard/observability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, modelId, enabled }),
        });
        const json = await res.json();
        // Neu laden
        const fresh = await fetchJson<{ overview: ObservabilityOverview }>(
          "/api/dashboard/observability"
        );
        if (fresh.overview) {
          setOverview(fresh.overview);
          setFunMode(fresh.overview.summary.funMode);
        }
        return json;
      } catch (err) {
        return { fehler: err instanceof Error ? err.message : String(err) };
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">Lade LLM Mission Control …</p>
      </div>
    );
  }

  const modellKatalog = overview?.modelCatalog || [];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
          <span aria-hidden>🛰️</span> LLM Mission Control
          <span className="mc-live-dot" title="Live-Betrieb" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Super Spielekind-Agent · Observability- & Operations-Zentrale für System, LLMs,
          Rate-Limits und Hausverwaltung.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => aktion("monthly_update")}
            className="rounded-md border border-border px-2 py-1 hover:bg-muted"
          >
            🔄 Jetzt alles aktualisieren
          </button>
          <button
            onClick={() => aktion("set_fun_mode", undefined, !funMode)}
            className={cn(
              "rounded-md border px-2 py-1",
              funMode
                ? "border-[var(--success)] text-[var(--success)]"
                : "border-border hover:bg-muted"
            )}
          >
            {funMode ? "🎉 Spaßmodus: an" : "😐 Spaßmodus: aus"}
          </button>
        </div>
        {fehler && (
          <p className="mt-2 text-xs text-[var(--destructive)]">⚠️ {fehler}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["observatory", "🔭 LLM Observatory"],
            ["logs", "🪵 Live-Systemlogs"],
            ["cost", "💰 Cost & Rate-Limits"],
            ["audit", "📋 Agent-Audit"],
            ["leds", "💡 LED-Wall"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setAktiverTab(key)}
            className={cn(
              "rounded-t-md border-b-2 px-3 py-1.5 text-xs transition-colors duration-200",
              aktiverTab === key
                ? "border-primary font-medium text-primary shadow-[0_1px_0_0_var(--glow-primary)]"
                : "border-transparent text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aktiverTab === "observatory" && (
        <ModelObservatory
          models={modellKatalog}
          onPing={(id) => aktion("ping", id)}
          onSelect={(m) => setSelectedModel(m)}
        />
      )}

{aktiverTab === "logs" && (
        <LiveLogs
          logs={logs}
          flyLogs={flyLogs}
          flyLogStatus={flyLogStatus}
          funComments={funComments}
          logEndRef={logEndRef}
        />
      )}

      {aktiverTab === "cost" && (
        <CostObservatory models={modellKatalog} rateLimits={overview?.recentRateLimits || []} />
      )}

      {aktiverTab === "audit" && (
        <AgentAudit audit={overview?.recentAudit || []} onMonthlyUpdate={() => aktion("monthly_update")} />
      )}

      {aktiverTab === "leds" && <LedWall leds={overview?.ledWall || []} />}

      {/* Modell-Popup */}
      {selectedModel && (
        <ModelPopup model={selectedModel} onClose={() => setSelectedModel(null)} />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ModelCatalogEntry["health"]["status"] }) {
  const color =
    status === "green" ? "var(--success)" : status === "gray" ? "#6b7280" : "#f59e0b";
  return (
    <span
      className={cn("mc-led inline-block h-2.5 w-2.5", status === "gray" && "mc-led--off")}
      style={{ "--led-color": color } as React.CSSProperties}
      title={status}
    />
  );
}

function ModelObservatory({
  models,
  onPing,
  onSelect,
}: {
  models: ModelCatalogEntry[];
  onPing: (id: string) => void;
  onSelect: (m: ModelCatalogEntry) => void;
}) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">🔭 LLM Observatory</h2>
        <p className="text-xs text-muted-foreground">
          {models.length} Modelle in der Registry · Klicke auf ein Modell für Details.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <div
            key={m.id}
            onClick={() => onSelect(m)}
            className="group cursor-pointer rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusDot status={m.health.status} />
                <span className="truncate text-sm font-semibold">{m.label}</span>
              </div>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Stufe {m.fallbackPriority}
              </span>
            </div>
            <div className="mb-1 truncate text-xs text-muted-foreground">{m.apiModel}</div>
            <div className="mb-2 text-[10px] text-muted-foreground">{m.company}</div>
            <div className="flex flex-wrap gap-1">
              {m.capabilities.vision && <CapBadge label="👁 Vision" />}
              {m.capabilities.functionCalling && <CapBadge label="🔧 Tools" />}
              {m.capabilities.reasoning && <CapBadge label="🧠 Reasoning" />}
              {m.capabilities.jsonMode && <CapBadge label="🟨 JSON" />}
              {m.capabilities.structuredOutput && <CapBadge label="📐 Structured" />}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Context: {formatTokens(m.contextLength)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPing(m.id);
                }}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] hover:bg-muted/70"
              >
                Ping
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

type LiveLogZeile = {
  id: string;
  zeitpunkt: string;
  text: string;
  typ: string;
  quelle: "system" | "fly";
  machine?: string;
  region?: string;
};

function LiveLogs({
  logs,
  flyLogs,
  flyLogStatus,
  funComments,
  logEndRef,
}: {
  logs: { id: string; zeitpunkt: string; text: string; typ: string }[];
  flyLogs: {
    id: string;
    zeitpunkt: string;
    text: string;
    typ: string;
    machine?: string;
    region?: string;
  }[];
  flyLogStatus: { active: boolean; error: string | null };
  funComments: string[];
  logEndRef: RefObject<HTMLDivElement | null>;
}) {
  // App-Logs + Fly-Logs zu einer chronologisch sortierten, gemischten Liste
  // zusammenführen. Quelle ("system" vs "fly") wird pro Zeile als Badge angezeigt.
  const gemischt: LiveLogZeile[] = useMemo(() => {
    const sys: LiveLogZeile[] = logs.map((l) => ({ ...l, quelle: "system" as const }));
    const fly: LiveLogZeile[] = flyLogs.map((f) => ({
      ...f,
      quelle: "fly" as const,
    }));
    return [...sys, ...fly].sort(
      (a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime()
    );
  }, [logs, flyLogs]);

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">🪵 Live-Systemlogs</h2>
        <p className="text-xs text-muted-foreground">
          Fly.io-artiger Live-Stream (SSE) · aktualisiert alle 3 Sekunden ·{" "}
          {flyLogStatus.active ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="mc-live-dot" />
              🌐 Fly.io-NATS verbunden
            </span>
          ) : (
            <span className="text-white/50">🌐 Fly.io-Logs inaktiv (lokal/kein Token)</span>
          )}
        </p>
      </div>
      <div className="glow-ring-accent rounded-lg border border-border bg-black p-3 font-mono text-[11px] leading-relaxed">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/40">
          <span>
            $ fly logs -a bkabr ← LLM Mission Control Live-Stream
            {flyLogStatus.active && <span className="mc-cursor ml-1" />}
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">📦 SYS</span>
            <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-300">✈️ FLY</span>
          </span>
        </div>
        {flyLogStatus.error && !flyLogStatus.active && (
          <div className="mb-2 text-[10px] text-amber-400/80">
            ⚠️ Fly-NATS: {flyLogStatus.error}
          </div>
        )}
        {funComments.length > 0 && (
          <div className="mb-2 space-y-1">
            {funComments.map((c, i) => (
              <div key={i} className="text-amber-400">
                {c}
              </div>
            ))}
          </div>
        )}
        {gemischt.length === 0 ? (
          <p className="text-white/40">Waiting for logs…</p>
        ) : (
          <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {gemischt.map((l) => (
              <div key={l.id} className="flex gap-2">
                <span className="shrink-0 text-white/40">
                  {new Date(l.zeitpunkt).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                {l.quelle === "fly" ? (
                  <span className="shrink-0 rounded bg-cyan-500/20 px-1 py-0.5 text-[9px] leading-none text-cyan-300">
                    FLY
                    {l.region ? ` ${l.region}` : ""}
                    {l.machine ? ` ${l.machine.slice(0, 4)}` : ""}
                  </span>
                ) : (
                  <span className="shrink-0 text-emerald-400/80">[SYS]</span>
                )}
                <span className="shrink-0 text-white/50">[{l.typ}]</span>
                <span className="break-words text-white/90">{l.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}


function CostObservatory({
  models,
  rateLimits,
}: {
  models: ModelCatalogEntry[];
  rateLimits: RateLimitEvent[];
}) {
  const totalCalls = models.reduce((s, m) => s + m.health.totalCalls, 0);
  const totalRateLimits = rateLimits.length;
  const freeTierExceeded = models.reduce((s, m) => s + m.health.freeTierExceededCount, 0);
  const totalPromptTokens = models.reduce((s, m) => s + (m.health.promptTokens || 0), 0);
  const totalCompletionTokens = models.reduce((s, m) => s + (m.health.completionTokens || 0), 0);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Zählt jeden echten Modell-Aufruf (Erfolg oder Fehlschlag) seit dem letzten Server-Neustart.
        „Rate-Limits" = 429/413-Antworten des Providers (TPM/TPD-Deckel erreicht), „Free-Tier-Exceed" =
        402-Antworten (Guthaben/Kontingent aufgebraucht). TPM/TPD-Werte je Modell sind die zuletzt in
        echten Fehlermeldungen beobachteten Provider-Limits – „unbekannt", wenn dazu noch keine
        Fehlermeldung vorlag.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Gesamtaufrufe" value={String(totalCalls)} />
        <SummaryTile label="Rate-Limits" value={String(totalRateLimits)} />
        <SummaryTile label="Free-Tier-Überschreitungen" value={String(freeTierExceeded)} />
        <SummaryTile label="Prompt-Tokens" value={totalPromptTokens.toLocaleString("de-DE")} />
        <SummaryTile label="Completion-Tokens" value={totalCompletionTokens.toLocaleString("de-DE")} />
      </div>
      <h2 className="mb-2 text-sm font-semibold">💰 Cost & Model Observatory</h2>
      <div className="rounded-lg border border-border bg-card">
        <div className="mc-stagger divide-y divide-border">
          {models.map((m) => {
            const h = m.health;
            const rateLimitProzent = h.totalCalls > 0 ? h.rateLimitCount / h.totalCalls : 0;
            const barColor = rateLimitProzent > 0.5 ? "var(--destructive)" : "#f59e0b";
            const limits = KNOWN_FREE_TIER_LIMITS[m.id];
            const gesamtTokens = (h.promptTokens || 0) + (h.completionTokens || 0);
            return (
              <div
                key={m.id}
                className="interactive flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.provider} · Stufe {m.fallbackPriority}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Limit: {limits?.tpm ? `${limits.tpm.toLocaleString("de-DE")} TPM` : ""}
                    {limits?.tpm && limits?.tpd ? " · " : ""}
                    {limits?.tpd ? `${limits.tpd.toLocaleString("de-DE")} TPD` : ""}
                    {!limits?.tpm && !limits?.tpd ? "unbekannt" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Tokens (in/out)</div>
                    <div className="tabular-nums">
                      {gesamtTokens > 0
                        ? `${(h.promptTokens || 0).toLocaleString("de-DE")} / ${(h.completionTokens || 0).toLocaleString("de-DE")}`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Calls</div>
                    <div className="tabular-nums">
                      <AnimatedNumber value={String(h.totalCalls)} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Rate-Limits</div>
                    <div
                      className={cn(
                        "tabular-nums",
                        h.rateLimitCount > 0 ? "text-amber-400" : "text-muted-foreground"
                      )}
                    >
                      {h.rateLimitCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Free-Tier-Exceed</div>
                    <div
                      className={cn(
                        "tabular-nums",
                        h.freeTierExceededCount > 0 ? "text-red-400" : "text-muted-foreground"
                      )}
                    >
                      {h.freeTierExceededCount}
                    </div>
                  </div>
                  <div className="hidden w-24 sm:block">
                    <div className="mb-1 text-[10px] text-muted-foreground">Fehlerquote</div>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                      <div
                        key={`${m.id}-${rateLimitProzent}`}
                        className="mc-bar-fill h-full rounded"
                        style={{
                          width: `${Math.min(100, rateLimitProzent * 100)}%`,
                          backgroundColor: barColor,
                          boxShadow: rateLimitProzent > 0 ? `0 0 6px 0 color-mix(in srgb, ${barColor} 70%, transparent)` : "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rateLimits.length > 0 && (
        <>
          <h2 className="mb-2 mt-4 text-sm font-semibold">⚠️ Letzte Rate-Limits</h2>
          <div className="rounded-lg border border-border bg-card">
            <div className="divide-y divide-border">
              {rateLimits.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate">
                      [{r.provider}] {r.model} → {r.kategorie}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDate(r.zeitpunkt)} · Limit {r.limit} · Used {r.used} · Requested{" "}
                      {r.requested}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-[var(--destructive)]/10 px-1.5 py-0.5 text-[10px] text-[var(--destructive)]">
                    {r.warteSekunden > 0 ? `${r.warteSekunden}s` : "kein Retry"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="mc-led-panel rounded-lg border border-border p-3 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">
        <AnimatedNumber value={value} />
      </div>
    </div>
  );
}

/**
 * Zählt eine Zahl beim ersten Erscheinen (Mount) sanft von 0 hoch statt sie
 * statisch anzuzeigen – passend zum "Live-Messwert"-Charakter von Mission
 * Control. Nicht-numerische Werte (z.B. "8 / 3 / 12") werden unverändert
 * dargestellt, nur mit dem dezenten Erscheinungs-Fade (.mc-number).
 * Respektiert prefers-reduced-motion über die CSS-Regel auf .mc-number.
 */
function AnimatedNumber({ value }: { value: string }) {
  const numeric = Number(value.replace(/\./g, "").replace(/,/g, "."));
  const isPlainNumber = value.trim() !== "" && Number.isFinite(numeric) && String(Math.trunc(numeric)).length === value.replace(/[^0-9]/g, "").length;
  const [display, setDisplay] = useState(isPlainNumber ? 0 : numeric);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlainNumber) return;
    startRef.current = null;
    const durationMs = 600;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setDisplay(Math.round(numeric * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span key={value} className="mc-number">
      {isPlainNumber ? display.toLocaleString("de-DE") : value}
    </span>
  );
}

function AgentAudit({
  audit,
  onMonthlyUpdate,
}: {
  audit: ObservabilityOverview["recentAudit"];
  onMonthlyUpdate: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">📋 Agent-Audit-Log</h2>
          <p className="text-xs text-muted-foreground">
            Alle protokollierten Aktionen & Plausibilitäts-Checks des Agents.
          </p>
        </div>
        <button
          onClick={onMonthlyUpdate}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          🔄 Update
        </button>
      </div>
      {audit.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          Noch keine Agent-Aktionen protokolliert. Starte ein Update, um das Audit-Log zu füllen.
        </p>
      ) : (
        <div className="space-y-1.5">
          {audit.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">[{a.aktion}] {a.detail}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                    a.ergebnis === "ok"
                      ? "bg-[var(--success-bg)] text-[var(--success)]"
                      : a.ergebnis === "fehler"
                      ? "bg-[var(--destructive)]/10 text-[var(--destructive)]"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {a.ergebnis}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {formatDate(a.zeitpunkt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LedWall({ leds }: { leds: LedEntry[] }) {
  const colorMap: Record<LedEntry["status"], string> = {
    green: "var(--success)",
    yellow: "#f59e0b",
    red: "var(--destructive)",
    gray: "#6b7280",
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div>
          <h2 className="text-sm font-semibold">💡 LED-Wall</h2>
          <p className="text-xs text-muted-foreground">
            System- & Hausverwaltungs-Status auf einen Blick (Mission Control).
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mc-stagger sm:grid-cols-3 lg:grid-cols-4">
        {leds.map((led) => (
          <div
            key={led.id}
            title={led.tooltip}
            className={cn(
              "mc-led-panel interactive flex items-center gap-2.5 rounded-lg border border-border p-2.5 text-xs",
              led.href && "cursor-pointer hover:border-primary/50"
            )}
          >
            <span
              className={cn(
                "mc-led h-3 w-3 shrink-0",
                led.status === "gray" ? "mc-led--off" : led.blinker && "mc-led--blink"
              )}
              style={{ "--led-color": colorMap[led.status] } as React.CSSProperties}
            />
            <span className="min-w-0 truncate">{led.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelPopup({ model, onClose }: { model: ModelCatalogEntry; onClose: () => void }) {
  const cap = model.capabilities;
  const links = [
    { label: "API", href: model.links.api },
    { label: "Docs", href: model.links.docs },
    { label: "Playground", href: model.links.playground },
    { label: "GitHub", href: model.links.github },
    { label: "Changelog", href: model.links.changelog },
    { label: "Pricing", href: model.links.pricing },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="flex items-center gap-2">
              <StatusDot status={model.health.status} />
              <h3 className="text-base font-bold">{model.label}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{model.apiModel}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <InfoTile label="Anbieter" value={model.company} />
            <InfoTile label="Fallback-Stufe" value={String(model.fallbackPriority)} />
            <InfoTile label="Context" value={formatTokens(model.contextLength)} />
            <InfoTile
              label="Max Output"
              value={model.maxOutput ? formatTokens(model.maxOutput) : "—"}
            />
            {model.released && <InfoTile label="Release" value={model.released} />}
            {model.lastAgentUpdate && (
              <InfoTile label="Letztes Agent-Update" value={formatDate(model.lastAgentUpdate)} />
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Capabilities
            </div>
            <div className="flex flex-wrap gap-1">{[["👁 Vision", cap.vision], ["🧠 Reasoning", cap.reasoning], ["🔧 Function Calling", cap.functionCalling], ["🟨 JSON Mode", cap.jsonMode], ["📐 Structured Output", cap.structuredOutput], ["📡 Streaming", cap.streaming], ["🌍 Multilingual", cap.multilingual], ["🧰 Tool Use", cap.toolUse], ["🧩 Embedding", cap.embedding]].map(([label, on]) =>
              on ? <span key={String(label)} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{String(label)}</span> : null
            )}</div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mini-Links
            </div>
            <div className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-primary hover:bg-muted"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Health & Free-Tier
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <InfoTile label="Status" value={model.health.status} />
              <InfoTile
                label="Free-Tier-Überschritten"
                value={String(model.health.freeTierExceededCount)}
              />
              <InfoTile label="Rate-Limits" value={String(model.health.rateLimitCount)} />
              <InfoTile
                label="Erfolgsquote"
                value={
                  model.health.totalCalls > 0
                    ? `${((model.health.successCalls / model.health.totalCalls) * 100).toFixed(0)}%`
                    : "—"
                }
              />
              {model.pricing && (
                <InfoTile
                  label="Preis"
                  value={`$${model.pricing.inputPerMillion}/1M in · $${model.pricing.outputPerMillion}/1M out`}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mc-number truncate font-medium">{value}</div>
    </div>
  );
}

