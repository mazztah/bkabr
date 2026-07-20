"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";
import Container from "./ui/Container";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import GradientText from "./ui/GradientText";
import Aurora from "./ui/Aurora";
import AnimatedCounter from "./ui/AnimatedCounter";
import GlassCard from "./ui/GlassCard";

const TRUST_POINTS = ["§ 556 BGB / BetrKV-konform", "DSGVO-konform gehostet", "In Minuten startklar"];

export default function Hero() {
  return (
    <div id="top" className="relative overflow-hidden pt-16 lg:pt-20">
      <Aurora />
      <div className="mk-grid-bg absolute inset-0 opacity-60" aria-hidden />

      <Container className="relative py-20 lg:py-28">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge icon={<Sparkles size={13} className="text-[var(--brand-accent)]" />}>
                Neu: automatische Dokumentzuordnung per KI
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 text-5xl font-bold leading-[1.08] tracking-tight text-foreground lg:text-6xl"
            >
              Betriebskosten­abrechnungen,
              <br />
              <GradientText>die sich von selbst erledigen.</GradientText>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground"
            >
              BetriebsKostenBot liest Rechnungen, Mietverträge und Eigentümer­dokumente per KI aus,
              ordnet sie automatisch der richtigen Liegenschaft zu und erstellt rechtssichere
              Abrechnungen inklusive Anschreiben — als PDF, in Minuten statt Tagen.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
            >
              <Button href="/" variant="primary" size="lg" arrow>
                Jetzt kostenlos testen
              </Button>
              <Button href="#dashboard" variant="glass" size="lg">
                Live-Demo ansehen
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2"
            >
              {TRUST_POINTS.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 size={15} className="text-[var(--brand-accent)]" />
                  {t}
                </span>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-8"
            >
              <div>
                <div className="text-3xl font-bold text-foreground">
                  <AnimatedCounter value={90} suffix="%" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">weniger manueller Aufwand</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">
                  <AnimatedCounter value={12} suffix=" Min." />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">bis zur fertigen Abrechnung</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">
                  <AnimatedCounter value={100} suffix="%" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">§ 556 BGB-konform</div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="mk-float">
              <GlassCard className="p-6" hover={false}>
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                  </div>
                  <span className="text-xs text-muted-foreground">Musterstraße 3 · EG links</span>
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    { label: "Grundsteuer", value: "400,00 €", pct: 60 },
                    { label: "Wasserversorgung", value: "320,00 €", pct: 48 },
                    { label: "Heizkosten (verbrauchsabh.)", value: "850,00 €", pct: 90 },
                    { label: "Müllabfuhr", value: "160,00 €", pct: 30 },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{row.label}</span>
                        <span className="font-mono text-foreground">{row.value}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ duration: 1.2, delay: 0.6 }}
                          className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--brand-accent)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="text-sm text-muted-foreground">Nachzahlung</span>
                  <span className="text-xl font-bold text-foreground">610,00 €</span>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--brand-accent)]/10 p-3 text-xs text-[var(--brand-accent)]">
                  <Sparkles size={14} />
                  KI hat 11 Positionen automatisch erkannt &amp; zugeordnet
                </div>
              </GlassCard>
            </div>

            <div className="absolute -right-6 -top-6 -z-10 h-32 w-32 rounded-full bg-[var(--brand-accent)]/20 blur-3xl" />
            <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-[var(--primary)]/20 blur-3xl" />
          </motion.div>
        </div>
      </Container>
    </div>
  );
}
