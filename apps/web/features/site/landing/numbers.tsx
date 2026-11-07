"use client";

import { useEffect, useState } from "react";

import { useNumerals } from "@/lib/preferences-context";

import { LOCALES, t } from "@/lib/i18n";

import data from "../landing-data.json";
import { prefersReducedMotion, useInView } from "./use-reveal";


function CountUp({ value, run }: { value: number; run: boolean }) {
  const formatNumber = useNumerals();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 1400;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [run, value]);
  return <>{formatNumber(run ? shown : 0)}</>;
}

/** The Quran in numbers — every figure read from the database (landing-data.json). */
export function QuranNumbers() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const items = [
    { value: data.stats.surahs, label: t("السور") },
    { value: data.stats.ayahs, label: t("الآيات") },
    { value: data.stats.words, label: t("الكلمات") },
    { value: data.stats.roots, label: t("الجذور") },
    { value: data.stats.pages, label: t("صفحات المصحف") },
    { value: data.stats.reciters, label: t("القرّاء") },
    { value: LOCALES.length, label: t("لغات الواجهة") },
  ];
  return (
    <div ref={ref} className={`qb-numbers${inView ? " is-in" : ""}`}>
      {items.map((item) => (
        <div key={item.label} className="cell">
          <b>
            <CountUp value={item.value} run={inView} />
          </b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
