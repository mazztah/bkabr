"use client";

import {
  ScanSearch,
  FolderKanban,
  FileSignature,
  Users,
  Calculator,
  ShieldCheck,
  MessageSquareText,
  FileOutput,
} from "lucide-react";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import GlassCard from "./ui/GlassCard";
import Badge from "./ui/Badge";
import FadeUp from "./ui/FadeUp";

const FEATURES = [
  {
    icon: ScanSearch,
    title: "KI-Dokumentenerkennung",
    desc: "Rechnungen, Mietverträge, Eigentümer­dokumente & PM-Verträge werden per OCR gelesen und automatisch dem richtigen Dokumenttyp zugeordnet.",
  },
  {
    icon: FolderKanban,
    title: "Automatische Zuordnung",
    desc: "Die passende Liegenschaft wird per Adressabgleich erkannt. Fehlt sie, schlägt die KI eine vorausgefüllte Neuanlage vor.",
  },
  {
    icon: FileSignature,
    title: "Mietverträge im Griff",
    desc: "Laufzeiten, Kaution, Sollmiete und Nebenkosten-Vorauszahlungen werden direkt aus dem Vertrag extrahiert.",
  },
  {
    icon: Users,
    title: "Eigentümer & PM-Verträge",
    desc: "Miteigentumsanteile, Vollmachten und Verwalterhonorare zentral je Liegenschaft verwaltet – inkl. Belegen.",
  },
  {
    icon: Calculator,
    title: "Soll/Ist-Vorauszahlungen",
    desc: "Automatischer Abgleich zwischen geleisteten Vorauszahlungen und tatsächlichen Kosten je Mieteinheit.",
  },
  {
    icon: ShieldCheck,
    title: "Rechtssicher nach § 556 BGB",
    desc: "Formale Pflichtangaben, Umlageschlüssel, Einspruchsfrist & Belegeinsicht sind fest in jeder Abrechnung verankert.",
  },
  {
    icon: MessageSquareText,
    title: "KI-Chat & Rechtscheck",
    desc: "Fragen zur Abrechnung direkt im Kontext beantworten lassen – inklusive automatischer Plausibilitätsprüfung.",
  },
  {
    icon: FileOutput,
    title: "PDF & Anschreiben in Sekunden",
    desc: "Formal korrektes Anschreiben und Abrechnung als druckfertiges PDF – mit Briefkopf und Ihrem Logo.",
  },
];

export default function Features() {
  return (
    <Section id="features">
      <Container>
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Badge>Funktionen</Badge>
          <Heading size="xl" className="mt-5">
            Alles, was eine moderne Hausverwaltung braucht
          </Heading>
          <p className="mt-4 text-lg text-muted-foreground">
            Vom Posteingang bis zur versandfertigen Abrechnung — ein durchgängiger, KI-gestützter
            Workflow für Wohn- und Gewerbeimmobilien.
          </p>
        </FadeUp>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <FadeUp key={f.title} delay={(i % 4) * 0.08}>
              <GlassCard className="h-full p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)]/20 to-[var(--brand-accent)]/20 text-[var(--brand-accent)]">
                  <f.icon size={20} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </GlassCard>
            </FadeUp>
          ))}
        </div>
      </Container>
    </Section>
  );
}
