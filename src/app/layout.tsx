import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetriebsKostenBot – Automatische Betriebskostenabrechnungen",
  description:
    "KI-gestützte Web-App für automatisierte Betriebskostenabrechnungen (Wohnen & Gewerbe)",
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
