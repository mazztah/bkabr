"use client";

import { useEffect, useRef, useState } from "react";

export default function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  duration = 1.4,
  decimals = 0,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    // Nur einmal animieren, unabhängig davon, ob die IntersectionObserver-Timing auf
    // bestimmten Mobilgeräten zuverlässig feuert – die Metriken liegen im Hero-Bereich
    // ohnehin direkt im sichtbaren Bereich beim Laden der Seite.
    if (started.current) return;
    started.current = true;
    setDisplay(0);

    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span>
      {prefix}
      {display.toLocaleString("de-DE", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
