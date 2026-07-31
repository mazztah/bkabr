import type { Metadata } from "next";
import "./globals.css";
import LeftNav from "@/components/LeftNav";
import GlobalTopBar from "@/components/GlobalTopBar";
import SandboxLayer from "@/components/SandboxLayer";
import ChatWindow from "@/components/ChatWindow";
import MobileNavToggle from "@/components/MobileNavToggle";
import AppContentFrame from "@/components/AppContentFrame";
import { SandboxProvider } from "@/lib/sandbox-context";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "BetriebsKostenBot – Automatische Betriebskostenabrechnungen",
  description:
    "KI-gestützte Web-App für automatisierte Betriebskostenabrechnungen (Wohnen & Gewerbe)",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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
            <AppContentFrame>{children}</AppContentFrame>
          </div>
          <GlobalTopBar />
          <SandboxLayer />
          <ChatWindow />
          <MobileNavToggle />
        </SandboxProvider>
      </body>
    </html>
  );
}
