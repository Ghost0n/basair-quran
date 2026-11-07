"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { t, tn } from "@/lib/i18n";

import data from "../landing-data.json";

// i18n-ignore — a reciter's name, as the catalogue spells it, and an Arabic search word.
const RECITER = "مشاري راشد العفاسي";
// i18n-ignore
const SEARCHED = "بصائر";

type Step = { id: string; icon: IconName; title: string; body: string; screen: ReactNode };

/** The first `count` words of a verse (an exact prefix), for a snippet. */
function opening(text: string, count: number): string {
  const words = text.split(" ");
  return words.length > count ? `${words.slice(0, count).join(" ")} …` : text;
}

/** The verse with its words of the root ب ص ر picked out. */
function marked(text: string): ReactNode {
  return text.split(" ").map((word, index) => (
    <span key={index} className={word.includes("بَص") || word.includes("بۡص") ? "hit" : undefined}>
      {index ? " " : null}
      {word}
    </span>
  ));
}

function StatusBar() {
  return (
    <div className="ph-status" dir="ltr" aria-hidden="true">
      <span>9:41</span>
      <span className="dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function ReaderScreen() {
  const formatNumber = useNumerals();
  return (
    <div className="ph-screen reader">
      <StatusBar />
      <div className="ph-mushaf" lang="ar" dir="rtl">
        <div className="ph-surah">{data.surah_names[0]}</div>
        <p>
          {data.fatiha.map((verse, index) => (
            <span key={index} className={index === 2 ? "recite" : undefined}>
              {verse} <span className="num">{formatNumber(index + 1)}</span>{" "}
            </span>
          ))}
        </p>
      </div>
      <div className="ph-dock" aria-hidden="true">
        <span className="round">
          <BrandMark size={22} />
        </span>
        <span className="pill">
          <Icon name="menu" size={15} />
          <Icon name="book" size={15} />
          <Icon name="textSize" size={15} />
          <Icon name="play" size={15} />
        </span>
      </div>
    </div>
  );
}

function SearchScreen() {
  const formatNumber = useNumerals();
  return (
    <div className="ph-screen search">
      <StatusBar />
      <div className="ph-searchbar" lang="ar" dir="rtl">
        <Icon name="search" size={14} />
        <span>{SEARCHED}</span>
      </div>
      <div className="ph-count">{tn("{0} آية", data.basair.length, { 0: formatNumber(data.basair.length) })}</div>
      <div className="ph-results" lang="ar" dir="rtl">
        {data.basair.map((verse) => (
          <div key={`${verse.surah}:${verse.ayah}`} className="ph-result">
            <span className="ref">
              {verse.surah_name} · {formatNumber(verse.ayah)}
            </span>
            <span className="text">{marked(verse.text)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReciteScreen() {
  const formatNumber = useNumerals();
  return (
    <div className="ph-screen recite">
      <div className="ph-lock" dir="ltr" aria-hidden="true">
        <span className="clock">9:41</span>
      </div>
      <div className="ph-nowplaying">
        <div className="top">
          <span className="art">
            <BrandMark size={34} />
          </span>
          <span className="who">
            <b>{t("{0} · آية {1}", { 0: data.surah_names[0], 1: formatNumber(3) })}</b>
            <small lang="ar">{RECITER}</small>
          </span>
        </div>
        <div className="track">
          <span />
        </div>
        <div className="controls" dir="ltr" aria-hidden="true">
          <Icon name="chevLeft" size={18} />
          <span className="pause">
            <Icon name="pause" size={20} />
          </span>
          <Icon name="chevRight" size={18} />
        </div>
      </div>
      <div className="ph-island" aria-hidden="true">
        <span className="wave">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

function StudyScreen() {
  const formatNumber = useNumerals();
  return (
    <div className="ph-screen study">
      <StatusBar />
      <div className="ph-chat">
        <div className="ask">{t("ما الذي تقوله الآيات عن البصيرة؟")}</div>
        <div className="answer">
          <span className="badge">{t("القرآن وحدَه")}</span>
          <p>{t("تجعل الآيات البصيرة سبيلاً للدعوة، وشاهداً على النفس:")}</p>
          {data.study.map((verse) => (
            <div key={`${verse.surah}:${verse.ayah}`} className="cite" lang="ar" dir="rtl">
              <span className="text">{marked(opening(verse.text, 7))}</span>
              <span className="ref">
                {verse.surah_name} · {formatNumber(verse.ayah)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`qb-phone ${className}`.trim()} aria-hidden="true">
      <div className="notch" />
      {children}
    </div>
  );
}

/**
 * «بصائر في يدك»: four moments of the app, told as you scroll. On wide
 * screens the phone stays in place beside the text and changes screen as each
 * step comes into view; on phones every step carries its own phone. The
 * screens are drawn in the app's style with real verses (landing-data.json).
 */
export function PhoneStory() {
  const steps: Step[] = [
    { id: "read", icon: "page", title: t("اقرأ المصحف كما طُبع"), body: t("صفحات مصحف المدينة النبوية بخطّها، أو آيةً آية مع ترجمات المعاني، في وضعٍ مريح للعين."), screen: <ReaderScreen /> },
    { id: "search", icon: "search", title: t("ابحث في الكلمة وجذرها"), body: t("اكتب كلمة فتجد مواضعها ومشتقّاتها في كل المصحف، مظلّلةً في سياقها."), screen: <SearchScreen /> },
    { id: "recite", icon: "ear", title: t("استمع وتابع"), body: t("قرّاء متعدّدون، وتكرار الآية أو المقطع؛ التلاوة على شاشة القفل، والصفحة تتبعها."), screen: <ReciteScreen /> },
    { id: "study", icon: "sparkles", title: t("ادرس بالدليل"), body: t("اسأل فيجيبك الباحث الآلي من الآيات وحدها مع مراجعها؛ والقراءة التفسيرية تجريبية وموسومة."), screen: <StudyScreen /> },
  ];
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="qb-story" aria-labelledby="story-title">
      <h2 id="story-title">{t("بصائر في يدك")}</h2>
      <div className="qb-story-grid">
        <div className="steps">
          {steps.map((step, index) => (
            <article
              key={step.id}
              ref={(element) => {
                stepRefs.current[index] = element;
              }}
              data-index={index}
              className={`step${active === index ? " active" : ""}`}
            >
              <span className="ico">
                <Icon name={step.icon} size={20} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <Phone className="inline">{step.screen}</Phone>
            </article>
          ))}
        </div>
        <div className="stage">
          <Phone className="sticky">
            {steps.map((step, index) => (
              <div key={step.id} className={`layer${active === index ? " on" : ""}`}>
                {step.screen}
              </div>
            ))}
          </Phone>
        </div>
      </div>
    </section>
  );
}
