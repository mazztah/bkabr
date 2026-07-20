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
    emoji: "🟢",
    name: "Basic",
    price: "299",
    period: "einmalig",
    desc: "Ideal for small residential properties",
    features: [
      "Up to 10 units",
      "Complete digital documentation provided",
      "Operating cost statement or HOA (condominium) service charge statement",
      "Delivery within 5–7 business days",
      "1 revision included",
    ],
    cta: "Basic auswählen",
    highlight: false,
  },
  {
    emoji: "🔵",
    name: "Standard",
    price: "799",
    period: "einmalig",
    desc: "Perfect for multi-family residential buildings",
    features: [
      "Up to 30 units",
      "Multiple cost categories",
      "Plausibility and accuracy review",
      "Buyer support and clarification included",
      "Delivery within 7–10 business days",
      "2 revisions included",
    ],
    cta: "Standard auswählen",
    highlight: true,
  },
  {
    emoji: "🟣",
    name: "Premium",
    price: "1.299",
    period: "einmalig",
    desc: "For complex properties & condominium associations (HOAs / WEGs)",
    features: [
      "Up to 60 units",
      "Paper documents accepted",
      "Lease and contract review",
      "Master data preparation and organization",
      "Ownership changes handled",
      "Tenant changes handled",
      "Special assessments supported",
      "Delivery within 10–14 business days",
      "Priority processing",
      "Unlimited revisions until final approval",
    ],
    cta: "Premium auswählen",
    highlight: false,
  },
  {
    emoji: "⚫",
    name: "Enterprise",
    price: "Individuell",
    period: "",
    desc: "Für größere Bestände & individuelle Anforderungen.",
    features: [
      "Alles aus Premium",
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

        <div className="mt-16 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
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
                <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <span>{p.emoji}</span> {p.name}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-foreground">
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
