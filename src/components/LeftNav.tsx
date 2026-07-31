"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Struktur",
    items: [
      { href: "/eigentuemer", label: "Eigentümer", icon: "👤" },
      { href: "/investoren", label: "Investoren", icon: "💼" },
      { href: "/finanzierung", label: "Finanzierung", icon: "🏦" },
      { href: "/pm-vertrag", label: "PM-Vertrag", icon: "📃" },
    ],
  },
  {
    title: "Objekte",
    items: [
      { href: "/liegenschaften", label: "Liegenschaften", icon: "🏠" },
      { href: "/gebaeude", label: "Gebäude", icon: "🏢" },
      { href: "/mieter", label: "Mieter", icon: "🧑" },
      { href: "/auswertung", label: "Auswertung", icon: "📊" },
    ],
  },
  {
    title: "Kaufmännisch",
    items: [
      { href: "/", label: "Abrechnungen", icon: "🧾" },
      { href: "/vorauszahlungen", label: "Vorauszahlungen", icon: "💶" },
      { href: "/mietvertraege", label: "Mietverträge", icon: "📄" },
      { href: "/rechnungen", label: "Rechnungen", icon: "📥" },
      { href: "/dienstleistungsvertraege", label: "Dienstleistungsverträge", icon: "🤝" },
    ],
  },
  {
    title: "Betrieb",
    items: [
      { href: "/instandhaltung", label: "Instandhaltung", icon: "🔧" },
      { href: "/auftraege", label: "Aufträge", icon: "📋" },
      { href: "/assetmanagement", label: "Assetmanagement", icon: "📊" },
      { href: "/budgetierung", label: "Budgetierung", icon: "📈" },
    ],
  },
];

export default function LeftNav() {
  const pathname = usePathname();
  const { mobileNavOpen, closeMobileNav } = useStore();

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => {
    closeMobileNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (pathname?.startsWith("/marketing")) return null;

  return (
    <>
      {/* Backdrop, mobile only, closes the drawer on tap */}
      {mobileNavOpen && (
        <div
          onClick={closeMobileNav}
          className="fixed inset-0 z-[230] bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-[240] flex h-full w-72 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r border-border bg-card no-print transition-transform duration-200 ease-out",
          "lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-sm font-bold text-white shadow-sm">
              BK
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold">BetriebsKosten-KI</p>
              <p className="text-[10px] text-muted-foreground">Hausverwaltung</p>
            </div>
          </div>
          <button
            onClick={closeMobileNav}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            title="Menü schließen"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 px-2 py-3">
          {GROUPS.map((group) => (
            <div key={group.title}>
              {group.title && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="text-sm">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
