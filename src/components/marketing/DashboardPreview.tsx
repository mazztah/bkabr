"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, FileText, PieChart, CheckCircle2 } from "lucide-react";
import Container from "./ui/Container";
import Section from "./ui/Section";
import Heading from "./ui/Heading";
import Badge from "./ui/Badge";
import GlassCard from "./ui/GlassCard";
import FadeUp from "./ui/FadeUp";

const TABS = [
  { id: "liegenschaften", label: "Liegenschaften", icon: Building2 },
  { id: "dokumente", label: "Dokumente", icon: FileText },
  { id: "auswertung", label: "Auswertung", icon: PieChart },
];

const LIEGENSCHAFTEN = [
  { name: "Musterstraße 3", ort: "12345 Musterstadt", einheiten: 8, status: "Fertig" },
  { name: "Am Stadtpark 12", ort: "80331 München", einheiten: 14, status: "Rohdaten" },
  { name: "Industrieweg 7", ort: "70173 Stuttgart", einheiten: 3, status: "Validierung" },
];

const DOKUMENTE = [
  { name: "Grundsteuerbescheid_2025.pdf", typ: "Rechnung", erkannt: "Musterstraße 3" },
  { name: "Mietvertrag_Beispiel_A.pdf", typ: "Mietvertrag", erkannt: "Am Stadtpark 12" },
  { name: "Vollmacht_Eigentuemer.pdf", typ: "Eigentümer-Dokument", erkannt: "Industrieweg 7" },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Fertig: "bg-emerald-400/15 text-emerald-300",
    Rohdaten: "bg-white/10 text-muted-foreground",
    Validierung: "bg-amber-400/15 text-amber-300",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${map[status]}`}>{status}</span>;
}

export default function DashboardPreview() {
  const [tab, setTab] = useState("liegenschaften");

  return (
    <Section id="dashboard">
      <Container>
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Badge>Produkt</Badge>
          <Heading size="xl" className="mt-5">
            Ein Dashboard, das den Überblick behält
          </Heading>
          <p className="mt-4 text-lg text-muted-foreground">
            Liegenschaften, Dokumente und Auswertungen an einem Ort — aufgeräumt, schnell, ohne
            Excel-Chaos.
          </p>
        </FadeUp>

        <FadeUp delay={0.15} className="mt-14">
          <GlassCard className="mx-auto max-w-4xl overflow-hidden p-0" hover={false}>
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
              </div>
              <div className="flex gap-1 rounded-xl bg-white/5 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === t.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <t.icon size={13} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-16" />
            </div>

            <div className="min-h-[320px] p-6">
              <AnimatePresence mode="wait">
                {tab === "liegenschaften" && (
                  <motion.div
                    key="liegenschaften"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-2.5"
                  >
                    {LIEGENSCHAFTEN.map((l) => (
                      <div
                        key={l.name}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{l.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {l.ort} · {l.einheiten} Einheiten
                          </div>
                        </div>
                        <StatusPill status={l.status} />
                      </div>
                    ))}
                  </motion.div>
                )}

                {tab === "dokumente" && (
                  <motion.div
                    key="dokumente"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-2.5"
                  >
                    {DOKUMENTE.map((d) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-[var(--brand-accent)]" />
                          <div>
                            <div className="text-sm font-medium text-foreground">{d.name}</div>
                            <div className="text-xs text-muted-foreground">{d.typ}</div>
                          </div>
                        </div>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                          <CheckCircle2 size={13} />
                          {d.erkannt}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}

                {tab === "auswertung" && (
                  <motion.div
                    key="auswertung"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="grid grid-cols-2 gap-4"
                  >
                    {[
                      { label: "Grundsteuer", pct: 26 },
                      { label: "Heizkosten", pct: 34 },
                      { label: "Wasser/Abwasser", pct: 19 },
                      { label: "Sonstige", pct: 21 },
                    ].map((row) => (
                      <div key={row.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{row.label}</span>
                          <span className="text-foreground">{row.pct}%</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${row.pct}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1 }}
                            className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--brand-accent)]"
                          />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>
        </FadeUp>
      </Container>
    </Section>
  );
}
