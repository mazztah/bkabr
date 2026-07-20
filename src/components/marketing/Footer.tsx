import Container from "./ui/Container";

const COLUMNS = [
  {
    title: "Produkt",
    links: [
      { label: "Funktionen", href: "#features" },
      { label: "So funktioniert's", href: "#workflow" },
      { label: "Dashboard", href: "#dashboard" },
      { label: "Preise", href: "#pricing" },
    ],
  },
  {
    title: "Unternehmen",
    links: [
      { label: "Über uns", href: "#" },
      { label: "Kontakt", href: "#" },
      { label: "Karriere", href: "#" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { label: "Impressum", href: "#" },
      { label: "Datenschutz", href: "#" },
      { label: "AGB", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-14">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/brand/logo-icon.png" alt="BetriebsKostenBot AI" className="h-7 w-7 object-contain" />
              <span className="text-sm font-bold text-foreground">
                BetriebsKosten<span className="text-[var(--brand-accent)]">Bot</span> AI
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Die KI für perfekte Betriebskostenabrechnungen — automatisiert, rechtssicher, in
              Minuten statt Tagen.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} BetriebsKostenBot AI. Alle Rechte vorbehalten.
          </p>
          <p className="text-xs text-muted-foreground">Made with ♥ für deutsche Hausverwaltungen</p>
        </div>
      </Container>
    </footer>
  );
}
