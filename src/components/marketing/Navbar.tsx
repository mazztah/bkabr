"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Container from "./ui/Container";
import Button from "./ui/Button";

const LINKS = [
  { href: "#features", label: "Funktionen" },
  { href: "#workflow", label: "So funktioniert's" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "#pricing", label: "Preise" },
  { href: "#faq", label: "FAQ" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = document.getElementById("mk-scroll-root");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      setScrolled(y > 12);
    };
    target.addEventListener("scroll", onScroll);
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-white/10 bg-background/70 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <Container className="flex h-16 items-center justify-between lg:h-20">
        <a href="#top" className="flex items-center gap-2.5">
          <img src="/brand/logo-icon.png" alt="BetriebsKostenBot AI" className="h-8 w-8 object-contain" />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            BetriebsKosten<span className="text-[var(--brand-accent)]">Bot</span>
          </span>
          <span className="rounded-md bg-[var(--brand-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--brand-accent)]">
            AI
          </span>
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button href="/" variant="ghost" size="md">
            Anmelden
          </Button>
          <Button href="/" variant="primary" size="md" arrow>
            Kostenlos testen
          </Button>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-foreground lg:hidden"
          aria-label="Menü"
        >
          <span className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-4 bg-current transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`}
            />
            <span className={`absolute left-0 top-[6px] h-[1.5px] w-4 bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
            <span
              className={`absolute left-0 top-[12px] h-[1.5px] w-4 bg-current transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </Container>

      {open && (
        <div className="border-t border-white/10 bg-background/95 backdrop-blur-xl lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button href="/" variant="glass">
                Anmelden
              </Button>
              <Button href="/" variant="primary" arrow>
                Kostenlos testen
              </Button>
            </div>
          </Container>
        </div>
      )}
    </motion.header>
  );
}
