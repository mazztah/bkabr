"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import Badge from "./ui/Badge";
import GlassCard from "./ui/GlassCard";
import Button from "./ui/Button";
import FadeUp from "./ui/FadeUp";

const PLANS = [
  {
    name: "Starter",
    price: "0",
    period: "kostenlos",
    desc: "Zum Ausprobieren für einzelne Objekte.",
    features: ["Bis zu 2 Liegenschaften", "KI-Dokumentenerkennung", "PDF-Export mit Wasserzeichen", "E-Mail-Support"],
    cta: "Kostenlos starten",
    highlight: false,
  },
  {
    name: "Professional",
    price: "49",
    period: "/ Monat",
    desc: "Für Hausverwaltungen mit wachsendem Bestand.",
    features: [
      "Unbegrenzte Liegenschaften",
      "Eigentümer- & PM-Vertragsverwaltung",
      "Soll/Ist-Vorauszahlungsabgleich",
      "KI-Chat & Rechtscheck",
      "Markenfreies PDF mit eigenem Logo",
      "Priorisierter Support",
    ],
    cta: "Jetzt upgraden",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Individuell",
    period: "",
    desc: "Für größere Bestände & individuelle Anforderungen.",
    features: [
      "Alles aus Professional",
      "SSO & Mandantenfähigkeit",
      "Individuelle Integrationen (API)",
      "Persönlicher Ansprechpartner",
      "SLA & On-Premise-Option",
    ],
    cta: "Vertrieb kontaktieren",
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <Section id="pricing">
      <Container>
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Badge>Preise</Badge>
          <Heading size="xl" className="mt-5">
            Faire Preise, die mit Ihnen wachsen
          </Heading>
          <p className="mt-4 text-lg text-muted-foreground">
            Keine versteckten Kosten. Jederzeit kündbar. Alle Preise zzgl. gesetzlicher USt.
          </p>
        </FadeUp>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.1}>
              <GlassCard
                hover={false}
                className={clsx("relative h-full p-8", p.highlight && "border-[var(--brand-accent)]/40")}
              >
                {p.highlight && (
                  <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--brand-accent)] px-3 py-1 text-[11px] font-semibold text-[var(--primary-foreground)]">
                    Beliebt
                  </span>
                )}
                <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold text-foreground">
                    {p.price === "Individuell" ? p.price : `${p.price} €`}
                  </span>
                  {p.period && <span className="text-sm text-muted-foreground">{p.period}</span>}
                </div>
                <div className="mt-7">
                  <Button href="/" variant={p.highlight ? "primary" : "glass"} className="w-full">
                    {p.cta}
                  </Button>
                </div>
                <ul className="mt-7 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check size={16} className="mt-0.5 shrink-0 text-[var(--brand-accent)]" />
                      {f}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </FadeUp>
          ))}
        </div>
      </Container>
    </Section>
  );
}
