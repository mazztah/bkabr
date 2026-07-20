"use client";

import { Upload, ScanEye, Sparkles, FileCheck2 } from "lucide-react";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import Badge from "./ui/Badge";
import GlassCard from "./ui/GlassCard";
import FadeUp from "./ui/FadeUp";

const STEPS = [
  {
    icon: Upload,
    step: "01",
    title: "Dokument hochladen",
    desc: "Rechnung, Mietvertrag oder Eigentümer-Dokument per Drag & Drop oder über das globale „＋“-Menü hochladen.",
  },
  {
    icon: ScanEye,
    step: "02",
    title: "KI liest & erkennt",
    desc: "OCR + KI extrahieren Beträge, Fristen und Adressen und erkennen automatisch den Dokumenttyp.",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "Automatisch zuordnen",
    desc: "Die passende Liegenschaft wird gefunden — oder mit vorausgefüllten Stammdaten neu angelegt.",
  },
  {
    icon: FileCheck2,
    step: "04",
    title: "Abrechnung exportieren",
    desc: "Fertige, rechtssichere Abrechnung inkl. Anschreiben als PDF herunterladen oder direkt versenden.",
  },
];

export default function Workflow() {
  return (
    <Section id="workflow" className="relative">
      <div className="absolute inset-x-0 top-0 -z-10 h-full bg-gradient-to-b from-white/[0.02] to-transparent" />
      <Container>
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Badge>So funktioniert&apos;s</Badge>
          <Heading size="xl" className="mt-5">
            Vom Beleg zur Abrechnung in vier Schritten
          </Heading>
        </FadeUp>

        <div className="relative mt-16 grid gap-5 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent lg:block" />
          {STEPS.map((s, i) => (
            <FadeUp key={s.step} delay={i * 0.12}>
              <GlassCard className="h-full p-6" hover>
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-[var(--primary-foreground)]">
                    <s.icon size={20} />
                  </div>
                  <span className="text-3xl font-bold text-white/10">{s.step}</span>
                </div>
                <h3 className="mt-5 text-[15px] font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </GlassCard>
            </FadeUp>
          ))}
        </div>
      </Container>
    </Section>
  );
}
