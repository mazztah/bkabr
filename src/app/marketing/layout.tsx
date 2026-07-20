import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "BetriebsKostenBot AI – Die KI für perfekte Betriebskostenabrechnungen",
  description:
    "BetriebsKostenBot liest Rechnungen, Mietverträge und Eigentümerdokumente per KI aus, ordnet sie automatisch zu und erstellt rechtssichere Betriebskostenabrechnungen inkl. Anschreiben als PDF.",
  openGraph: {
    title: "BetriebsKostenBot AI – Die KI für perfekte Betriebskostenabrechnungen",
    description:
      "KI-gestützte Dokumentenerkennung, automatische Zuordnung & rechtssichere Abrechnungen – in Minuten statt Tagen.",
    images: [{ url: "/brand/social/og-image.png", width: 1200, height: 630 }],
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BetriebsKostenBot AI",
    description: "Die KI für perfekte Betriebskostenabrechnungen.",
    images: ["/brand/social/og-image.png"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="mk-scroll-root" className="mk h-full overflow-y-auto">
      {children}
    </div>
  );
}
