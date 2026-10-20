"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import data from "../landing-data.json";
import { useInView } from "./use-reveal";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const HAFS = 2;

// i18n-ignore — Arabic search words offered as examples (searched as typed).
const EXAMPLES = ["رحم", "نور", "علم", "صبر", "قلب"];
// i18n-ignore — the name's root, in Arabic letters.
const NAME_ROOT_LABEL = "ب ص ر";

type Spread = { root: string; total: number; surahCount: number; counts: number[] };

const NAME_SPREAD: Spread = {
  root: data.root.root,
  total: data.root.total,
  surahCount: data.root.surah_count,
  counts: data.root.counts,
};

/**
 * «الجذر الذي منه الاسم»: where the root ب ص ر — the root of «بصائر» — lives
 * in the Quran, one bar per surah from Al-Fātiḥa (right) to An-Nās (left),
 * from the real data (landing-data.json). Any word or root typed below maps
 * the same ribbon live (GET /api/root-distribution, Ḥafṣ), and opens in the
 * app's search.
 */
export function RootRibbon({ onOpen }: { onOpen: (href: string) => void }) {
  const formatNumber = useNumerals();
  const [ref, inView] = useInView<HTMLElement>();
  const [spread, setSpread] = useState<Spread>(NAME_SPREAD);
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "missing" | "offline">("idle");
  const [hover, setHover] = useState<number | null>(null);
  const token = useRef(0);

  const peak = useMemo(() => Math.max(1, ...spread.counts), [spread]);
  const isName = spread === NAME_SPREAD;

  async function look(word: string) {
    const term = word.trim();
    if (!term) return;
    setQuery(term);
    setAsked(term);
    setState("loading");
    const mine = ++token.current;
    try {
      const answer = await api.getRootDistribution(term, HAFS);
      if (mine !== token.current) return;
      if (!answer.found || !answer.total) {
        setState("missing");
        return;
      }
      const counts = new Array<number>(data.surah_names.length).fill(0);
      for (const item of answer.surahs) counts[item.surah_id - 1] = item.count;
      setSpread({ root: answer.root, total: answer.total, surahCount: answer.surah_count, counts });
      setState("idle");
    } catch {
      if (mine === token.current) setState("offline");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void look(query);
  }

  const shown = hover != null ? { name: data.surah_names[hover], count: spread.counts[hover] } : null;
  const letters = [...spread.root.replace(/\s/g, "")];

  return (
    <section ref={ref} id="root" className={`qb-root${inView ? " is-in" : ""}`} aria-labelledby="root-title">
      <p className="kicker">{isName ? t("الجذر الذي منه الاسم") : t("أين تقع الكلمة في القرآن")}</p>
      <h2 id="root-title" className="letters" lang="ar" dir="rtl" aria-label={spread.root}>
        {letters.map((letter, index) => (
          <span key={`${spread.root}-${index}`} style={{ animationDelay: `${index * 120}ms` }}>
            {letter}
          </span>
        ))}
      </h2>
      <p className="lead">
        {isName
          ? t("من هذا الجذر جاء اسم «بصائر»: البصر والبصيرة والتبصّر. هذه مواضعه في سور القرآن، من الفاتحة إلى الناس.")
          : t("مواضع هذا الجذر في سور القرآن، من الفاتحة إلى الناس.")}
      </p>

      <div className="figures">
        <div>
          <b>{formatNumber(spread.total)}</b>
          <span>{t("المواضع")}</span>
        </div>
        <div>
          <b>{formatNumber(spread.surahCount)}</b>
          <span>{t("السور")}</span>
        </div>
      </div>

      <div className={`ribbon${state === "loading" ? " is-loading" : ""}`} dir="rtl" role="img" aria-label={t("انتشار الجذر في السور")}>
        {spread.counts.map((count, index) => (
          <span
            key={index}
            className={`bar${count ? " on" : ""}${hover === index ? " hover" : ""}`}
            style={{ ["--h" as string]: count ? 0.12 + 0.88 * Math.sqrt(count / peak) : 0.05, ["--i" as string]: index }}
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover((current) => (current === index ? null : current))}
            onClick={() => setHover(index)}
          />
        ))}
      </div>
      <div className="axis" dir="rtl">
        <span>{data.surah_names[0]}</span>
        <span className="readout" aria-live="polite">
          {shown ? (shown.count ? `${shown.name}: ${formatNumber(shown.count)}` : shown.name) : null}
        </span>
        <span>{data.surah_names[data.surah_names.length - 1]}</span>
      </div>

      <form className="try" onSubmit={submit} role="search">
        <label htmlFor="root-try" className="qb-sr-only">
          {t("جرّب كلمةً أو جذراً")}
        </label>
        <Icon name="search" size={18} />
        <input
          id="root-try"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("جرّب كلمةً أو جذراً")}
          dir="rtl"
          lang="ar"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="qb-site-cta sm" disabled={!query.trim()}>
          {t("اعرض")}
        </button>
      </form>
      <div className="examples">
        {EXAMPLES.map((word) => (
          <button key={word} type="button" lang="ar" onClick={() => void look(word)} className={asked === word ? "on" : undefined}>
            {word}
          </button>
        ))}
        {!isName ? (
          <button type="button" className="reset" onClick={() => { token.current += 1; setSpread(NAME_SPREAD); setState("idle"); setAsked(null); setQuery(""); }}>
            {NAME_ROOT_LABEL}
          </button>
        ) : null}
      </div>
      <p className="status" role="status">
        {state === "missing"
          ? t("لم نجد هذه الكلمة في القرآن؛ جرّب جذراً آخر.")
          : state === "offline"
            ? t("البحث المباشر غير متاح الآن.")
            : null}
      </p>
      {!isName && asked ? (
        <button type="button" className="qb-site-more" onClick={() => onOpen(`/?mode=search&q=${encodeURIComponent(asked)}`)}>
          {t("افتح المواضع في البحث")}
          <Icon name="chevLeft" size={16} />
        </button>
      ) : null}
    </section>
  );
}
