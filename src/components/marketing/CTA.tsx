"use client";

import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import Button from "./ui/Button";
import GlassCard from "./ui/GlassCard";
import Aurora from "./ui/Aurora";
import FadeUp from "./ui/FadeUp";

export default function CTA() {
  return (
    <Section className="pb-32">
      <Container>
        <FadeUp>
          <GlassCard className="relative overflow-hidden px-8 py-16 text-center lg:px-16" hover={false}>
            <Aurora className="opacity-70" />
            <div className="relative">
              <Heading size="xl" className="mx-auto max-w-2xl">
                Bereit, Ihre Betriebskostenabrechnung zu automatisieren?
              </Heading>
              <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
                Starten Sie kostenlos — ohne Kreditkarte, ohne Verpflichtung. In wenigen Minuten
                ist Ihre erste Liegenschaft eingerichtet.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button href="/" variant="primary" size="lg" arrow>
                  Jetzt kostenlos testen
                </Button>
                <Button href="#pricing" variant="glass" size="lg">
                  Preise ansehen
                </Button>
              </div>
            </div>
          </GlassCard>
        </FadeUp>
      </Container>
    </Section>
  );
}
