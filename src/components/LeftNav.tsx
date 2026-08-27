"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Home,
  Pin,
  PinOff,
  Search,
  Brain,
  Inbox,
  ScanSearch,
  User,
  Briefcase,
  Landmark,
  FileText,
  Building2,
  Building,
  Users,
  Mail,
  BarChart3,
  Receipt,
  CreditCard,
  Wallet,
  FileSignature,
  FileInput,
  Handshake,
  Wrench,
  ClipboardList,
  Ticket,
  PieChart,
  TrendingUp,
  CalendarClock,
  Calculator,
  LayoutDashboard,
  ChevronDown,
  X,
  Activity,
  Shield,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Übersicht",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/dashboard/mission-control",
        label: "Mission Control",
        icon: Activity,
      },
    ],
  },
  {
    title: "Struktur",
    items: [
      { href: "/smart-upload", label: "Intelligenter Upload", icon: Brain },
      { href: "/ablage", label: "Ablage", icon: Inbox },
      { href: "/pruefung", label: "Plausibilitätsprüfung", icon: ScanSearch },
      { href: "/eigentuemer", label: "Eigentümer", icon: User },
      { href: "/investoren", label: "Investoren", icon: Briefcase },
      { href: "/finanzierung", label: "Finanzierung", icon: Landmark },
      { href: "/pm-vertrag", label: "PM-Vertrag", icon: FileText },
    ],
  },
  {
    title: "Objekte",
    items: [
      { href: "/liegenschaften", label: "Liegenschaften", icon: Home },
      { href: "/flurstuecke", label: "Flurstücke", icon: MapPin },
      { href: "/gebaeude", label: "Gebäude", icon: Building2 },
      { href: "/wohnungen", label: "Wohnungen", icon: Building },
      { href: "/mieter", label: "Mieter", icon: Users },
      { href: "/schriftverkehr", label: "Schriftverkehr", icon: Mail },
      { href: "/auswertung", label: "Auswertung", icon: BarChart3 },
    ],
  },
  {
    title: "Kaufmännisch",
    items: [
      { href: "/buchhaltung", label: "Buchhaltung", icon: Calculator },
      { href: "/", label: "Abrechnungen", icon: Receipt },
      { href: "/kontoauszuege", label: "Kontoauszüge", icon: CreditCard },
      { href: "/vorauszahlungen", label: "Vorauszahlungen", icon: Wallet },
      { href: "/mietvertraege", label: "Mietverträge", icon: FileSignature },
      { href: "/vertraege", label: "Verträge", icon: FileSignature },
      { href: "/rechnungen", label: "Rechnungen", icon: FileInput },
      { href: "/dienstleistungsvertraege", label: "Dienstleistungsverträge", icon: Handshake },
    ],
  },
  {
    title: "Betrieb",
    items: [
      { href: "/instandhaltung", label: "Instandhaltung", icon: Wrench },
      { href: "/auftraege", label: "Aufträge", icon: ClipboardList },
      { href: "/ticketsystem", label: "Ticketsystem", icon: Ticket },
      { href: "/assetmanagement", label: "Assetmanagement", icon: PieChart },
      { href: "/budgetierung", label: "Budgetierung", icon: TrendingUp },
    ],
  },
  {
    title: "Verwaltung",
    items: [{ href: "/kalender", label: "Kalender", icon: CalendarClock }],
  },
  {
    title: "Systemadministration",
    items: [{ href: "/systemadministration/nutzer", label: "Nutzerverwaltung", icon: Shield }],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

const RAIL_WIDTH = 64;
const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const EXPAND_DELAY_MS = 90;
const COLLAPSE_DELAY_MS = 420;

interface LiegenschaftLite {
  id: string;
  name: string;
  ort?: string;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function LeftNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mobileNavOpen, closeMobileNav } = useStore();
  const isDesktop = useIsDesktop();

  const [pinned, setPinned] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [resizing, setResizing] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState("");
  const [liegenschaften, setLiegenschaften] = useState<LiegenschaftLite[] | null>(null);

  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const expanded = pinned || hoverExpanded;

  // -------- Persistierte Präferenzen laden (Client-only, kein SSR-Mismatch) --------
  useEffect(() => {
    try {
      const storedPinned = localStorage.getItem("bk_nav_pinned");
      const storedWidth = localStorage.getItem("bk_nav_width");
      const storedGroups = localStorage.getItem("bk_nav_groups");
      if (storedPinned) setPinned(storedPinned === "1");
      if (storedWidth) {
        const w = parseInt(storedWidth, 10);
        if (Number.isFinite(w)) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
      }
      if (storedGroups) setOpenGroups(JSON.parse(storedGroups));
      else setOpenGroups(Object.fromEntries(GROUPS.map((g) => [g.title, true])));
    } catch {
      setOpenGroups(Object.fromEntries(GROUPS.map((g) => [g.title, true])));
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("bk_nav_pinned", pinned ? "1" : "0");
    } catch {}
  }, [pinned]);

  useEffect(() => {
    try {
      localStorage.setItem("bk_nav_width", String(width));
    } catch {}
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem("bk_nav_groups", JSON.stringify(openGroups));
    } catch {}
  }, [openGroups]);

  // -------- Reservierte Content-Breite als CSS-Variable spiegeln --------
  // Rail-Breite bleibt immer reserviert (Desktop); die Flyout-Erweiterung bei
  // reinem Hover überlagert den Content statt ihn zu verschieben – nur beim
  // Anpinnen wird der volle Platz im Layout reserviert.
  useEffect(() => {
    if (!isDesktop) {
      document.documentElement.style.setProperty("--nav-width", "0px");
      return;
    }
    document.documentElement.style.setProperty(
      "--nav-width",
      `${pinned ? width : RAIL_WIDTH}px`
    );
  }, [isDesktop, pinned, width]);

  // Auto-close mobile drawer on route change.
  useEffect(() => {
    closeMobileNav();
    setHoverExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Liegenschaften für den Schnellwechsel nachladen, sobald der Nav-Bereich
  // sichtbar wird (nicht schon beim ersten Render, um unnötige Requests zu
  // vermeiden, solange der Rail-Zustand nie erweitert wird).
  useEffect(() => {
    if (!expanded || liegenschaften !== null) return;
    fetch("/api/liegenschaften")
      .then((r) => (r.ok ? r.json() : { liegenschaften: [] }))
      .then((d) => setLiegenschaften(d.liegenschaften || []))
      .catch(() => setLiegenschaften([]));
  }, [expanded, liegenschaften]);

  const clearTimers = useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (pinned || !isDesktop) return;
    clearTimers();
    expandTimer.current = setTimeout(() => setHoverExpanded(true), EXPAND_DELAY_MS);
  }, [pinned, isDesktop, clearTimers]);

  const handleMouseLeave = useCallback(() => {
    if (pinned || !isDesktop) return;
    clearTimers();
    collapseTimer.current = setTimeout(() => setHoverExpanded(false), COLLAPSE_DELAY_MS);
  }, [pinned, isDesktop, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // -------- Resize per Drag (Maus & Touch) --------
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setResizing(true);
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: PointerEvent) => {
        const next = startWidth + (ev.clientX - startX);
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [width]
  );

  const goHome = useCallback(() => {
    router.push("/");
    setPinned(false);
    setHoverExpanded(false);
  }, [router]);

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const filteredLiegenschaften = useMemo(() => {
    if (!liegenschaften) return [];
    const q = switcherQuery.trim().toLowerCase();
    if (!q) return liegenschaften.slice(0, 8);
    return liegenschaften
      .filter((l) => `${l.name} ${l.ort || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [liegenschaften, switcherQuery]);

  if (pathname?.startsWith("/marketing") || pathname?.startsWith("/login")) return null;

  const effectiveWidth = expanded ? width : RAIL_WIDTH;

  return (
    <>
      {/* Backdrop, mobile only, closes the drawer on tap */}
      {mobileNavOpen && (
        <div
          onClick={closeMobileNav}
          className="fixed inset-0 z-[230] bg-black/50 backdrop-blur-sm lg:hidden animate-[fadein_150ms_ease-out]"
          aria-hidden="true"
        />
      )}

      <nav
        ref={navRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={isDesktop ? { width: effectiveWidth } : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-[240] flex h-full max-w-[85vw] shrink-0 flex-col overflow-hidden",
          "border-r border-border bg-card no-print",
          "w-72",
          !resizing && "transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isDesktop && !pinned && hoverExpanded && "shadow-2xl shadow-black/30 glass-panel",
          isDesktop && pinned && "glass-panel"
        )}
      >
        {/* -------- Kopfbereich: Home + Pin -------- */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-4">
          <button
            onClick={goHome}
            title="Startseite – cleane Arbeitsoberfläche"
            className="interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-white shadow-sm glow-ring-primary"
          >
            <Home className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
          <div
            className={cn(
              "min-w-0 flex-1 leading-tight transition-opacity duration-200",
              !expanded && "lg:pointer-events-none lg:opacity-0"
            )}
          >
            <p className="truncate text-sm font-bold gradient-text">BetriebsKosten-KI</p>
            <p className="truncate text-[10px] text-muted-foreground">Hausverwaltung</p>
          </div>
          <button
            onClick={() => setPinned((p) => !p)}
            title={pinned ? "Navigation lösen (auto-fade)" : "Navigation anheften"}
            className={cn(
              "interactive hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:flex",
              !expanded && "lg:opacity-0 lg:pointer-events-none"
            )}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={closeMobileNav}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            title="Menü schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* -------- Liegenschafts-Schnellwechsel -------- */}
        {(expanded || !isDesktop) && (
          <div className="border-b border-border px-3 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={switcherQuery}
                onChange={(e) => setSwitcherQuery(e.target.value)}
                placeholder="Liegenschaft schnell wechseln …"
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs transition-colors focus:border-primary focus:outline-none"
              />
            </div>
            {switcherQuery.trim() && (
              <div className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto">
                {filteredLiegenschaften.length === 0 && (
                  <p className="px-1 py-1 text-[11px] text-muted-foreground">Keine Treffer.</p>
                )}
                {filteredLiegenschaften.map((l) => (
                  <Link
                    key={l.id}
                    href={`/liegenschaften?select=liegenschaft:${l.id}`}
                    className="interactive flex flex-col rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="truncate font-medium">{l.name}</span>
                    {l.ort && <span className="truncate text-[10px] text-muted-foreground">{l.ort}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -------- Navigationsgruppen -------- */}
        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {!expanded && isDesktop
            ? // Rail-Modus: flache Icon-Liste, Tooltip via title-Attribut.
              ALL_ITEMS.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      "interactive mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </Link>
                );
              })
            : GROUPS.map((group) => {
                const isOpen = openGroups[group.title] !== false;
                return (
                  <div key={group.title}>
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>
                    <div className="collapsible" data-collapsed={!isOpen}>
                      <div className="space-y-0.5 overflow-hidden pb-1">
                        {group.items.map((item) => {
                          const active =
                            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={cn(
                                "interactive flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                                active
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>

        {/* -------- Resize-Griff (Maus & Touch) -------- */}
        {isDesktop && expanded && (
          <div
            onPointerDown={startResize}
            title="Breite anpassen"
            className={cn(
              "group absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none",
              resizing && "bg-primary/40"
            )}
          >
            <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/50" />
          </div>
        )}
      </nav>
    </>
  );
}
