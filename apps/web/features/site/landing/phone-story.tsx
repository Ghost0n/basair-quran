"use client";

import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/icon";
import { APP_MODE } from "@/lib/app-mode/config";
import { useI18n } from "@/lib/i18n/provider";
import { publicOrigin } from "@/lib/site";

import { t } from "@/lib/i18n";

import { mediaPath, type GuideMedia } from "../guide/guide-content";
import { prefersReducedMotion } from "./use-reveal";

type Step = { id: string; icon: IconName; title: string; body: string; media: GuideMedia };

/** The guide's screens (public/guide-media/); the standalone app ships without them, so it reads them from the site. */
function screenSource(locale: string, media: GuideMedia, poster = false): string {
  const path = mediaPath(locale, "mobile", media, poster);
  return APP_MODE ? `${publicOrigin() ?? ""}${path}` : path;
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

/** One real screen of the app: a screenshot, or a clip that plays (muted, looping) only while `playing`. */
function Screen({ media, label, locale, playing }: { media: GuideMedia; label: string; locale: string; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing && !prefersReducedMotion()) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing]);
  return (
    <div className="ph-screen">
      <StatusBar />
      {media.kind === "video" ? (
        <video ref={videoRef} poster={screenSource(locale, media, true)} muted loop playsInline preload="none" aria-label={label}>
          <source src={screenSource(locale, media)} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the guide's screenshots, already sized and compressed
        <img src={screenSource(locale, media)} alt={label} width={540} height={1168} loading="lazy" decoding="async" />
      )}
    </div>
  );
}

/**
 * «بصائر في يدك»: six moments of the app, told as you scroll, on the real
 * screens the guide shows (public/guide-media/, captured from the running
 * app). On wide screens the phone stays in place beside the text and each
 * new screen turns over the last like a mushaf page, while a gold thread
 * fills down the steps; on phones every step carries its own phone.
 */
export function PhoneStory() {
  const { locale } = useI18n();
  const steps: Step[] = [
    { id: "read", icon: "page", title: t("اقرأ المصحف كما طُبع"), body: t("صفحات مصحف المدينة النبوية بخطّها، أو آيةً آية مع ترجمات المعاني، في وضعٍ مريح للعين."), media: { name: "reader-navigate", kind: "video" } },
    { id: "search", icon: "search", title: t("ابحث في الكلمة وجذرها"), body: t("اكتب كلمة فتجد مواضعها ومشتقّاتها في كل المصحف، مظلّلةً في سياقها."), media: { name: "search", kind: "video" } },
    { id: "word", icon: "tree", title: t("صرف الكلمة"), body: t("حدّد أي كلمة في المصحف لترى جذرها وأصلها وإعرابها."), media: { name: "morphology", kind: "image" } },
    { id: "recite", icon: "ear", title: t("استمع وتابع"), body: t("قرّاء متعدّدون، وتكرار الآية أو المقطع؛ التلاوة على شاشة القفل، والصفحة تتبعها."), media: { name: "recitation", kind: "image" } },
    { id: "study", icon: "sparkles", title: t("ادرس بالدليل"), body: t("لا يدخل الجوابَ إلا الآياتُ التي وجدها البحث، بنصّها ومراجعها."), media: { name: "study", kind: "image" } },
    { id: "notebook", icon: "notebook", title: t("الدفتر"), body: t("احفظ الآيات وأضف إليها ملاحظاتك، ونظّمها في محاور."), media: { name: "notebook", kind: "image" } },
  ];
  const [active, setActive] = useState(0);
  // Steps whose inline phone (narrow screens) is on screen: their clips play.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const [wide, setWide] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 900px)");
    if (!query) return;
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const middle = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    const onScreen = new IntersectionObserver(
      (entries) => {
        setSeen((now) => {
          const next = new Set(now);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { threshold: 0.5 },
    );
    stepRefs.current.forEach((element) => {
      if (!element) return;
      middle.observe(element);
      onScreen.observe(element);
    });
    return () => {
      middle.disconnect();
      onScreen.disconnect();
    };
  }, []);

  // How far the reader is through the steps (0–1): the thread beside them fills to match.
  useEffect(() => {
    const section = sectionRef.current;
    const list = listRef.current;
    if (!section || !list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = list.getBoundingClientRect();
      const progress = (window.innerHeight * 0.5 - box.top) / Math.max(1, box.height);
      section.style.setProperty("--story", String(Math.min(1, Math.max(0, progress))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={sectionRef} id="features" className="qb-story" aria-labelledby="story-title">
      <h2 id="story-title">{t("بصائر في يدك")}</h2>
      <div className="qb-story-grid">
        <div ref={listRef} className="steps">
          <span className="thread" aria-hidden="true">
            <i />
          </span>
          {steps.map((step, index) => (
            <article
              key={step.id}
              ref={(element) => {
                stepRefs.current[index] = element;
              }}
              data-index={index}
              className={`step${active === index ? " active" : ""}${active > index ? " past" : ""}`}
            >
              <span className="ico">
                <Icon name={step.icon} size={20} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <div className="qb-phone inline" aria-hidden="true">
                <div className="notch" />
                <Screen media={step.media} label={step.title} locale={locale} playing={!wide && seen.has(index)} />
              </div>
            </article>
          ))}
        </div>
        <div className="stage">
          {/* The screens lie stacked like pages: each step turns its own over the ones before it. */}
          <div className="qb-phone sticky" aria-hidden="true">
            <div className="notch" />
            {steps.map((step, index) => (
              <div key={step.id} className={`layer${index <= active ? " on" : ""}${index < active ? " under" : ""}`} style={{ zIndex: index + 1 }}>
                <Screen media={step.media} label={step.title} locale={locale} playing={wide && index === active} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
