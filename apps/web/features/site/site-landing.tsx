"use client";

import "./site.css";
import "./landing/landing.css";

import { useRef, type PointerEvent, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { continueAsGuest } from "@/features/auth/identity-flow";
import { AUTH_ENABLED } from "@/lib/config";
import { PreferencesProvider, useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import data from "./landing-data.json";
import { LandingLocalePicker } from "./landing-locale-picker";
import { QuranNumbers } from "./landing/numbers";
import { GirihPattern } from "./landing/pattern";
import { PhoneStory } from "./landing/phone-story";
import { RootRibbon } from "./landing/root-ribbon";
import { useInView } from "./landing/use-reveal";
import { SiteFoot } from "./site-chrome";

/** Al-Jāthiya 45:20 — «هذا بصائر للناس» — in the mushaf's text (landing-data.json). */
const VERSE = data.basair.find((verse) => verse.surah === 45 && verse.ayah === 20)!;

type Item = { icon: IconName; title: string; body: string };

/**
 * The public face of «بصائر» (docs/public-site.md), built around its name:
 * a rosette that draws itself around the mark while the verse «هذا بصائر
 * للناس» appears word by word; the root ب ص ر mapped over the 114 surahs
 * (and any word the visitor types); the app told on a phone as you scroll;
 * the Quran in numbers; a privacy pledge; the community's principles.
 * Served at /about and shown at the app's door to web visitors (`onEnter`
 * then opens the app in place).
 */
export function SiteLanding({ onEnter }: { onEnter?: () => void }) {
  // The landing sits outside the app shell (ShellGate, /about): its own
  // preferences, so the digits it shows and the picker in its bar follow the
  // visitor's choice (docs/i18n.md).
  return (
    <PreferencesProvider>
      <LandingPage onEnter={onEnter} />
    </PreferencesProvider>
  );
}

function LandingPage({ onEnter }: { onEnter?: () => void }) {
  const formatNumber = useNumerals();
  const heroRef = useRef<HTMLElement | null>(null);

  const enter = () => {
    if (onEnter) {
      onEnter();
      return;
    }
    continueAsGuest();
    window.location.assign("/");
  };
  /** Open a screen of the app (the visitor becomes a guest on the way in). */
  const open = (href: string) => {
    continueAsGuest();
    window.location.assign(href);
  };

  // The light follows the pointer across the hero.
  const follow = (event: PointerEvent<HTMLElement>) => {
    const hero = heroRef.current;
    if (!hero || event.pointerType === "touch") return;
    const box = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", `${((event.clientX - box.left) / box.width) * 100}%`);
    hero.style.setProperty("--my", `${((event.clientY - box.top) / box.height) * 100}%`);
  };

  const pillars: Item[] = [
    { icon: "book", title: t("النصّ أولاً"), body: t("كل نتيجة تُبنى على آيات تُعرض بنصّها وموضعها في المصحف، ويبقى فهم الإنسان منفصلاً عن النص ومنسوباً إلى صاحبه.") },
    { icon: "shieldCheck", title: t("قابلٌ للتحقّق والتكرار"), body: t("البحث في الكلمات والجذور حتميّ: المدخل نفسه يعطي النتيجة نفسها لكل باحث، بعدد المواضع ومكانها، فيتحقّق منها من شاء.") },
    { icon: "globe", title: t("متاح للجميع"), body: t("مجاني، بأكثر من عشرين لغة للواجهة، ويعمل على الهاتف دون اتصال.") },
  ];
  // The method: how a question becomes a reviewable answer (docs/public-site.md).
  const method = [
    { title: t("الملاحظة"), body: t("اقرأ النصّ كما هو، برسمه وموضعه وسياقه.") },
    { title: t("الاستقراء"), body: t("اجمع كل مواضع الكلمة أو الجذر في المصحف كلّه، لا ما يوافق الفرضية وحده.") },
    { title: t("المقارنة"), body: t("قارن السياقات والصيغ، وانظر كيف يتوزّع الجذر على السور.") },
    { title: t("الاستنتاج المنضبط"), body: t("فرّق بين ما تنصّ عليه الآية وما تحتمله وما تراه أنت، وصرّح بحدود ما وصلت إليه.") },
    { title: t("المراجعة"), body: t("انشر بحثك بمراجعه وخطوات وصولك إليه، ليتحقّق منه غيرك أو يصحّحه.") },
  ];
  const technical: Item[] = [
    { icon: "smartphone", title: t("يعمل دون اتصال"), body: t("المصحف والبحث والتلاوات المنزَّلة تعمل على جهازك بلا إنترنت.") },
    { icon: "check", title: t("نصّ موثَّق"), body: t("يُبنى نص المصحف وصرفه وجذوره من مصادر موثَّقة، وتُطابَق كل آية مقتبسة مع المصحف.") },
    { icon: "link", title: t("ترجمات من مصادر موثوقة"), body: t("ترجمات المعاني من QuranEnc وTanzil، تُعرض كما هي منسوبةً إلى مترجميها.") },
    { icon: "scale", title: t("حدود واضحة للذكاء الاصطناعي"), body: t("الوضع الصارم لا يجيب إلا من الآيات المسترجعة، ولا يدخل جوابَه أيُّ نص آخر.") },
  ];
  const promises = [
    t("لا إعلانات ولا متتبّعات"),
    t("لا نبيع بياناتك ولا نشاركها للتسويق"),
    t("اقرأ وابحث دون حساب"),
    t("احذف حسابك وبياناتك متى شئت"),
  ];
  const principles = [
    { title: t("القرآن هو الدليل"), body: t("انقل الآيات بنصّها ومرجعها، وفرّق بين الآية وفهمك لها.") },
    { title: t("بحثٌ لا إفتاء"), body: t("صِف ما تقدّمه بدقّة: تأمّل شخصي، أو خلاصة بحث، أو نقل منسوب إلى مصدره.") },
    { title: t("الأدب والاحترام"), body: t("ناقش الفكرة لا الشخص، واحترم الناس على اختلاف آرائهم ومعتقداتهم.") },
    { title: t("الأمانة العلمية"), body: t("انسب كل قول إلى مصدره، وميّز الثابت من الرأي، ولا تقدّم الاحتمال على أنه يقين.") },
  ];

  return (
    <div className="qb-site qb-landing">
      <header className="qb-site-bar">
        <a className="brand" href="/about" aria-label={t("بصائر القرآن")}>
          <BrandMark size={34} />
          <span>{t("بصائر")}</span>
        </a>
        <nav aria-label={t("أقسام الصفحة")}>
          <a href="#method">{t("المنهج")}</a>
          <a href="#root">{t("الجذر")}</a>
          <a href="#features">{t("المزايا")}</a>
          <a href="#privacy">{t("الخصوصية")}</a>
          <a href="#guidelines">{t("الإرشادات")}</a>
          <a href="/guide">{t("الدليل")}</a>
        </nav>
        <LandingLocalePicker />
        <button type="button" className="qb-site-cta sm" onClick={enter}>
          {t("افتح التطبيق")}
        </button>
      </header>

      <main>
        <section ref={heroRef} className="qb-hero" onPointerMove={follow} aria-labelledby="hero-title">
          <div className="light" aria-hidden="true" />
          <GirihPattern className="pattern" />
          <div className="inner">
            <span className="mark">
              <BrandMark size={92} />
            </span>
            <p className="eyebrow">{t("بصائر القرآن")}</p>
            <h1 id="hero-title">{t("تدبّرٌ يقوم على الدليل")}</h1>
            <figure className="verse">
              <blockquote lang="ar" dir="rtl">
                {VERSE.text.split(" ").map((word, index) => (
                  <span key={index} style={{ animationDelay: `${700 + index * 160}ms` }}>
                    {word}{" "}
                  </span>
                ))}
              </blockquote>
              <figcaption>
                {VERSE.surah_name}: {formatNumber(VERSE.ayah)}
              </figcaption>
            </figure>
            <p className="lead">{t("مصحفٌ أصيل، وبحثٌ دقيق في الكلمات والجذور، ودراسةٌ موجَّهة لا تستند إلا إلى الآيات.")}</p>
            <div className="actions">
              <button type="button" className="qb-site-cta" onClick={enter}>
                {t("ابدأ القراءة")}
              </button>
              {AUTH_ENABLED ? (
                <a className="qb-site-ghost" href="/login?tab=signup">
                  {t("أنشئ حساباً")}
                </a>
              ) : null}
            </div>
            {AUTH_ENABLED ? (
              <p className="signin">
                {t("لديك حساب؟")} <a href="/login">{t("تسجيل الدخول")}</a>
              </p>
            ) : null}
          </div>
          <a className="scroll-cue" href="#root" aria-label={t("الجذر")}>
            <Icon name="chevDown" size={20} />
          </a>
        </section>

        <Reveal className="qb-pillars">
          {pillars.map((item) => (
            <article key={item.title}>
              <span className="ico">
                <Icon name={item.icon} size={20} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </Reveal>

        <Reveal className="qb-method" id="method" title={t("منهجٌ يمكن مراجعته")} lead={t("«بصائر» أداة بحث لا مرجعية: تعرض الدليل كاملاً، وتترك الفهم لمن يتدبّر، وتجعل كل خطوة قابلة للتحقّق.")}>
          <ol>
            {method.map((step, index) => (
              <li key={step.title}>
                <span className="num" aria-hidden="true">
                  {formatNumber(index + 1)}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <RootRibbon onOpen={open} />

        <PhoneStory />

        <Reveal className="qb-under" id="technical" title={t("تحت الغطاء")}>
          <div className="rows">
            {technical.map((item) => (
              <article key={item.title}>
                <Icon name={item.icon} size={20} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>

        <section className="qb-numbers-band" aria-label={t("القرآن في أرقام")}>
          <h2>{t("القرآن في أرقام")}</h2>
          <QuranNumbers />
        </section>

        <Reveal className="qb-pledge-wrap" id="privacy">
          <div className="qb-pledge">
            <span className="seal" aria-hidden="true">
              <BrandMark size={44} />
            </span>
            <h2>{t("عهدُ بصائر")}</h2>
            <p className="sub">{t("وعودنا في الخصوصية")}</p>
            <ul>
              {promises.map((text) => (
                <li key={text}>
                  <Icon name="check" size={18} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <p className="signature">{t("— فريق بصائر")}</p>
          </div>
        </Reveal>

        <Reveal className="qb-principles" id="guidelines" title={t("إرشادات المجتمع")} lead={t("مجتمع للتدبّر الجادّ، يُقدَّم فيه الدليل على الرأي، ويُحترم فيه القرآن والناس.")}>
          <ol>
            {principles.map((rule, index) => (
              <li key={rule.title}>
                <span className="num" aria-hidden="true">
                  {formatNumber(index + 1)}
                </span>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </li>
            ))}
          </ol>
          <a className="qb-site-more" href="/guidelines">
            {t("اقرأ الإرشادات كاملة")}
            <Icon name="chevLeft" size={16} />
          </a>
        </Reveal>

        <section className="qb-final">
          <GirihPattern className="pattern" />
          <h2>{t("ابدأ رحلتك مع القرآن")}</h2>
          <button type="button" className="qb-site-cta" onClick={enter}>
            {t("ابدأ القراءة")}
          </button>
        </section>
      </main>

      <SiteFoot />
    </div>
  );
}

/** A section that rises in once it scrolls into view. */
function Reveal({
  className,
  id,
  title,
  lead,
  children,
}: {
  className: string;
  id?: string;
  title?: string;
  lead?: string;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} id={id} className={`qb-reveal ${className}${inView ? " is-in" : ""}`} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {title ? <h2 id={id ? `${id}-title` : undefined}>{title}</h2> : null}
      {lead ? <p className="section-lead">{lead}</p> : null}
      {children}
    </section>
  );
}
