"use client";

import "../site.css";
import "./guide.css";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { GirihPattern } from "@/components/girih";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

import { prefersReducedMotion, useInView } from "../landing/use-reveal";
import { SiteBar, SiteFoot } from "../site-chrome";
import { matchesAll } from "../site-search";
import { guideChapters, mediaPath, type GuideChapter, type GuideMedia, type GuidePlatform, type GuideTopic } from "./guide-content";

const PLATFORM_KEY = "qb.guide.platform";

/**
 * Which guide to show: `?on=web|mobile` (a shared link), else the visitor's
 * last choice, else their device (a phone or a touch tablet → the phone's guide).
 */
function initialPlatform(): GuidePlatform {
  const asked = new URLSearchParams(window.location.search).get("on");
  if (asked === "web" || asked === "mobile") return asked;
  try {
    const saved = window.localStorage.getItem(PLATFORM_KEY);
    if (saved === "web" || saved === "mobile") return saved;
  } catch {}
  return window.matchMedia?.("(max-width: 860px), (pointer: coarse)").matches ? "mobile" : "web";
}

function usePlatform(): [GuidePlatform, (next: GuidePlatform) => void] {
  const [platform, setPlatform] = useState<GuidePlatform>("mobile");
  useEffect(() => setPlatform(initialPlatform()), []);
  const choose = (next: GuidePlatform) => {
    setPlatform(next);
    try {
      window.localStorage.setItem(PLATFORM_KEY, next);
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set("on", next);
    window.history.replaceState(window.history.state, "", url);
  };
  return [platform, choose];
}

/** Everything a topic says, for the filter. */
function topicText(chapter: GuideChapter, topic: GuideTopic): string {
  return [chapter.title, topic.title, topic.summary, ...topic.steps, topic.tip ?? ""].join(" ");
}

/**
 * /guide — the feature guide (docs/public-site.md → "The guide"): every
 * feature of the app by chapter, with its steps and a real screenshot or clip.
 * An index (chips on phones, a sticky column on wide screens) follows the
 * reading; a filter narrows it to the topics that mention what you typed;
 * every topic has its own link (/guide#topic).
 */
export function GuidePage() {
  const { locale } = useI18n();
  const [platform, setPlatform] = usePlatform();
  const chapters = useMemo(() => guideChapters(platform), [locale, platform]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () =>
      query.trim()
        ? chapters.map((chapter) => ({ ...chapter, topics: chapter.topics.filter((topic) => matchesAll(query, topicText(chapter, topic))) })).filter((chapter) => chapter.topics.length)
        : chapters,
    [chapters, query],
  );
  const active = useActiveChapter(shown.map((chapter) => chapter.id));

  return (
    <div className="qb-site qb-guide">
      <SiteBar current="/guide" />

      <header className="qb-guide-hero">
        <GirihPattern className="pattern" />
        <p className="eyebrow">{t("الدليل")}</p>
        <h1>{t("دليل «بصائر»")}</h1>
        <p className="lead">{t("كل ما في التطبيق، خطوةً خطوة: القراءة، والبحث، والتلاوة، والدراسة، والدفتر، والمجتمع.")}</p>
        <div className="qb-guide-platform" role="radiogroup" aria-label={t("نسخة الدليل")}>
          {(
            [
              ["mobile", "smartphone", t("على الهاتف")],
              ["web", "monitor", t("على الحاسوب")],
            ] as const
          ).map(([value, icon, label]) => (
            <button key={value} type="button" role="radio" aria-checked={platform === value} className={platform === value ? "is-on" : undefined} onClick={() => setPlatform(value)}>
              <Icon name={icon} size={17} />
              {label}
            </button>
          ))}
        </div>
        <div className="qb-guide-search" role="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("ابحث في الدليل: تلاوة، جذر، تنزيل…")}
            aria-label={t("ابحث في الدليل")}
            enterKeyHint="search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("مسح البحث")}>
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
      </header>

      <nav className="qb-guide-chips" aria-label={t("فهرس الدليل")}>
        {shown.map((chapter) => (
          <Chip key={chapter.id} chapter={chapter} active={active === chapter.id} />
        ))}
      </nav>

      <div className="qb-guide-body">
        <aside className="qb-guide-index" aria-label={t("فهرس الدليل")}>
          <ol>
            {shown.map((chapter) => (
              <li key={chapter.id} className={active === chapter.id ? "is-active" : undefined}>
                <a href={`#${chapter.id}`} aria-current={active === chapter.id ? "location" : undefined}>
                  <Icon name={chapter.icon} size={16} />
                  {chapter.title}
                </a>
                <div className="sub">
                  <ul>
                    {chapter.topics.map((topic) => (
                      <li key={topic.id}>
                        <a href={`#${topic.id}`}>{topic.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <main className="qb-guide-main">
          {shown.length ? (
            shown.map((chapter) => <Chapter key={chapter.id} chapter={chapter} locale={locale} platform={platform} />)
          ) : (
            <div className="qb-guide-empty">
              <p>{t("لا نتيجة لهذا البحث في الدليل.")}</p>
              <p>{t("راسل الفريق من الإعدادات ← الدعم والملاحظات.")}</p>
            </div>
          )}
        </main>
      </div>

      <SiteFoot />
    </div>
  );
}

/** The chapter the reader is in: the last one whose top has passed the upper third of the screen. */
function useActiveChapter(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(" ");
  useEffect(() => {
    const update = () => {
      let current = ids[0] ?? null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top < window.innerHeight * 0.35) current = id;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

function Chip({ chapter, active }: { chapter: GuideChapter; active: boolean }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  // Keep the current chapter's chip in sight as the page scrolls.
  useEffect(() => {
    const chip = ref.current;
    const bar = chip?.parentElement;
    if (!active || !chip || !bar || !bar.offsetParent) return;
    const box = chip.getBoundingClientRect();
    const frame = bar.getBoundingClientRect();
    if (box.left >= frame.left && box.right <= frame.right) return;
    // Only the bar scrolls (sideways), never the page.
    bar.scrollBy({ left: box.left - frame.left - (frame.width - box.width) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);
  return (
    <a ref={ref} href={`#${chapter.id}`} className={active ? "is-active" : undefined} aria-current={active ? "location" : undefined}>
      <Icon name={chapter.icon} size={15} />
      {chapter.title}
    </a>
  );
}

function Chapter({ chapter, locale, platform }: { chapter: GuideChapter; locale: string; platform: GuidePlatform }) {
  return (
    <section id={chapter.id} className="qb-guide-chapter" aria-labelledby={`${chapter.id}-title`}>
      <header>
        <span className="icon" aria-hidden="true">
          <Icon name={chapter.icon} size={22} />
        </span>
        <div>
          <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
          <p>{chapter.lead}</p>
        </div>
      </header>
      {chapter.topics.map((topic) => (
        <Topic key={topic.id} topic={topic} locale={locale} platform={platform} />
      ))}
    </section>
  );
}

function Topic({ topic, locale, platform }: { topic: GuideTopic; locale: string; platform: GuidePlatform }) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <article ref={ref} id={topic.id} className={`qb-guide-topic on-${platform}${topic.media ? " has-media" : ""}${inView ? " is-in" : ""}`}>
      <div className="text">
        <h3>
          <a href={`#${topic.id}`}>{topic.title}</a>
          {topic.appOnly ? <span className="badge">{t("في تطبيق الهاتف")}</span> : null}
        </h3>
        <p className="summary">{topic.summary}</p>
        <ol className="steps">
          {topic.steps.map((step, index) => (
            <li key={step} style={{ "--i": index } as CSSProperties}>
              {step}
            </li>
          ))}
        </ol>
        {topic.tip ? (
          <p className="tip">
            <Icon name="sparkles" size={16} />
            <span>{topic.tip}</span>
          </p>
        ) : null}
      </div>
      {topic.media ? <Shot key={`${platform}-${topic.media.name}`} media={topic.media} label={topic.title} locale={locale} platform={platform} /> : null}
    </article>
  );
}

/** A screenshot, or a short clip that plays (muted, looping) while it is on screen, in a phone or a browser window. */
function Shot({ media, label, locale, platform }: { media: GuideMedia; label: string; locale: string; platform: GuidePlatform }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (prefersReducedMotion()) {
      setStill(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => setStill(true));
        else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <figure className="qb-guide-shot">
      <div className={platform === "web" ? "qb-guide-window" : "qb-guide-phone"}>
        {platform === "web" ? (
          <span className="bar" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {media.kind === "video" ? (
          <video ref={videoRef} poster={mediaPath(locale, platform, media, true)} muted loop playsInline preload="none" controls={still} aria-label={label}>
            <source src={mediaPath(locale, platform, media)} type="video/mp4" />
          </video>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- static screenshots, already sized and compressed
          <img src={mediaPath(locale, platform, media)} alt={label} width={platform === "web" ? 1280 : 390} height={platform === "web" ? 800 : 844} loading="lazy" decoding="async" />
        )}
      </div>
    </figure>
  );
}
