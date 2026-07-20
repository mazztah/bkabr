"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import Badge from "./ui/Badge";
import FadeUp from "./ui/FadeUp";

const FAQS = [
  {
    q: "Ist die Abrechnung rechtssicher nach deutschem Mietrecht?",
    a: "Ja. Jede Abrechnung enthält die formal geforderten Pflichtangaben nach § 556 BGB / BetrKV: vollständige Kopfdaten, Abrechnungszeitraum, Umlageschlüssel, Vorauszahlungen, Saldo sowie Hinweise zu Einspruchsfrist und Belegeinsicht.",
  },
  {
    q: "Wie erkennt die KI, zu welcher Liegenschaft ein Dokument gehört?",
    a: "Beim Hochladen liest die KI die im Dokument enthaltene Adresse aus und gleicht sie mit Ihren bestehenden Liegenschaften ab. Gibt es keinen Treffer, schlägt sie eine neue Liegenschaft mit bereits vorausgefüllten Stammdaten vor.",
  },
  {
    q: "Welche Dokumente kann ich hochladen?",
    a: "Eingangsrechnungen, Mietverträge, Eigentümer-Dokumente (z. B. Vollmachten, Grundbuchauszüge) und Property-Management-Verträge – als PDF, Foto oder Scan.",
  },
  {
    q: "Kann ich mein eigenes Logo auf der Abrechnung verwenden?",
    a: "Ja, im Professional- und Enterprise-Tarif erscheint Ihr eigenes Logo im Briefkopf von Anschreiben, Vorschau und PDF-Export.",
  },
  {
    q: "Gibt es eine kostenlose Testphase?",
    a: "Der Starter-Tarif ist dauerhaft kostenlos für bis zu zwei Liegenschaften. Professional und Enterprise können Sie unverbindlich 14 Tage testen.",
  },
  {
    q: "Wo werden meine Daten gespeichert?",
    a: "Alle Daten werden DSGVO-konform auf Servern in der EU gehostet und ausschließlich für Ihre Abrechnungen verarbeitet.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Section id="faq">
      <Container className="max-w-3xl">
        <FadeUp className="text-center">
          <Badge>FAQ</Badge>
          <Heading size="xl" className="mt-5">
            Häufige Fragen
          </Heading>
        </FadeUp>

        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <FadeUp key={item.q} delay={i * 0.05}>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4.5 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{item.q}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-muted-foreground transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-[var(--brand-accent)]" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
