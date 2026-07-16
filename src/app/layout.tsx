import type { Metadata } from "next";
import "./globals.css";
import LeftNav from "@/components/LeftNav";
import GlobalTopBar from "@/components/GlobalTopBar";
import SandboxLayer from "@/components/SandboxLayer";
import { SandboxProvider } from "@/lib/sandbox-context";

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
      <body className="min-h-screen antialiased">
        <SandboxProvider>
          <div className="flex h-screen overflow-hidden">
            <LeftNav />
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </div>
          <GlobalTopBar />
          <SandboxLayer />
        </SandboxProvider>
      </body>
    </html>
  );
}
