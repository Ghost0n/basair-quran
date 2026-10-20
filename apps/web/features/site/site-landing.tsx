"use client";

import "./site.css";

import { type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { continueAsGuest } from "@/features/auth/identity-flow";
import { AUTH_ENABLED } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

// i18n-ignore — Quran text stays exactly as in the mushaf (data/quran.db, Ḥafṣ).
const VERSE = { text: "هَٰذَا بَصَٰٓئِرُ لِلنَّاسِ وَهُدٗى وَرَحۡمَةٌ لِّقَوۡمٖ يُوقِنُونَ", surah: "الجاثية", ayah: 20 };

type Item = { icon: IconName; title: string; body: string };

/**
 * The public face of «بصائر»: what it is for, what it offers, how it is built,
 * what it promises about privacy, and how its community behaves. Served at
 * /about (server-rendered, for search engines and shared links) and shown at
 * the app's door to web visitors who are neither signed in nor guests yet
 * (`onEnter` then opens the app in place).
 */
export function SiteLanding({ onEnter }: { onEnter?: () => void }) {
  const formatNumber = useNumerals();

  const enter = () => {
    if (onEnter) {
      onEnter();
      return;
    }
    continueAsGuest();
    window.location.assign("/");
  };

  const goals: Item[] = [
    { icon: "book", title: t("القرآن أولاً"), body: t("كل جواب يُبنى على آيات تُعرض بنصّها ومرجعها، ويبقى الفهم البشري منفصلاً عن النص.") },
    { icon: "shieldCheck", title: t("دقّة يمكن التحقّق منها"), body: t("البحث في الكلمات والجذور حتميّ وقابل للتكرار: النتيجة نفسها لكل باحث، مع مواضعها في المصحف.") },
    { icon: "globe", title: t("متاح للجميع"), body: t("مجاني، بأكثر من عشرين لغة للواجهة، ويعمل على الهاتف دون اتصال.") },
  ];
  const features: Item[] = [
    { icon: "page", title: t("المصحف الأصيل"), body: t("صفحات مصحف المدينة النبوية كما طُبعت، أو آيةً آية مع ترجمات المعاني.") },
    { icon: "search", title: t("البحث في الكلمات والجذور"), body: t("ابحث بكلمة أو جذر أو عبارة، واعرف مواضعها وانتشارها في السور.") },
    { icon: "ear", title: t("التلاوة"), body: t("قرّاء متعدّدون، وتكرار الآية أو المقطع، وصفحةٌ تتبع التلاوة.") },
    { icon: "sparkles", title: t("الدراسة الموجَّهة"), body: t("اطرح سؤالك فيجيبك الباحث الآلي من الآيات وحدها؛ والقراءة التفسيرية تجريبية وموسومة.") },
    { icon: "notebook", title: t("الدفتر واللوحات"), body: t("احفظ الآيات وصنّفها في مواضيع، واربط بينها في لوحات، وحوّلها إلى بحث.") },
    { icon: "users", title: t("المجتمع"), body: t("شارك أبحاثك مع الباحثين وفق إرشادات تحفظ الأدب والأمانة العلمية.") },
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
  const guidelines = [
    { title: t("القرآن هو الدليل"), body: t("انقل الآيات بنصّها ومرجعها، وفرّق بين الآية وفهمك لها.") },
    { title: t("تدبّر لا فتوى"), body: t("صِف ما تقدّمه بدقّة: تأمّل شخصي أو خلاصة بحث أو نقل موثَّق.") },
    { title: t("الأدب والاحترام"), body: t("ناقش الفكرة لا الشخص، بلا سخرية ولا تجريح ولا طعن طائفي.") },
    { title: t("الأمانة العلمية"), body: t("انسب الأقوال إلى أصحابها، ولا تعرض حديثاً دون درجته ومصدره.") },
  ];

  return (
    <div className="qb-site">
      <header className="qb-site-bar">
        <a className="brand" href="/about" aria-label={t("بصائر القرآن")}>
          <BrandMark size={34} />
          <span>{t("بصائر")}</span>
        </a>
        <nav aria-label={t("أقسام الصفحة")}>
          <a href="#features">{t("المزايا")}</a>
          <a href="#technical">{t("التقنية")}</a>
          <a href="#privacy">{t("الخصوصية")}</a>
          <a href="#guidelines">{t("الإرشادات")}</a>
        </nav>
        <button type="button" className="qb-site-cta sm" onClick={enter}>
          {t("افتح التطبيق")}
        </button>
      </header>

      <main>
        <section className="qb-site-hero">
          <span className="mark">
            <BrandMark size={84} />
          </span>
          <p className="eyebrow">{t("بصائر القرآن")}</p>
          <h1>{t("تدبّرٌ يقوم على الدليل")}</h1>
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
          <figure className="verse">
            <blockquote lang="ar" dir="rtl">
              {VERSE.text}
            </blockquote>
            <figcaption>
              {VERSE.surah}: {formatNumber(VERSE.ayah)}
            </figcaption>
          </figure>
        </section>

        <Section id="goals" title={t("لماذا بصائر؟")}>
          <Grid items={goals} wide />
        </Section>

        <Section id="features" title={t("ما تجده في بصائر")}>
          <Grid items={features} />
        </Section>

        <Section id="technical" title={t("تحت الغطاء")}>
          <Grid items={technical} pairs />
        </Section>

        <Section id="privacy" title={t("وعودنا في الخصوصية")}>
          <ul className="qb-site-promises">
            {promises.map((text) => (
              <li key={text}>
                <Icon name="check" size={18} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="guidelines" title={t("إرشادات المجتمع")} lead={t("مجتمع للتدبّر الجادّ، يُقدَّم فيه الدليل على الرأي، ويُحترم فيه القرآن والناس.")}>
          <ol className="qb-site-rules">
            {guidelines.map((rule, index) => (
              <li key={rule.title}>
                <span className="num">{formatNumber(index + 1)}</span>
                <div>
                  <h3>{rule.title}</h3>
                  <p>{rule.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <a className="qb-site-more" href="/guidelines">
            {t("اقرأ الإرشادات كاملة")}
            <Icon name="chevLeft" size={16} />
          </a>
        </Section>

        <section className="qb-site-final">
          <h2>{t("ابدأ رحلتك مع القرآن")}</h2>
          <button type="button" className="qb-site-cta" onClick={enter}>
            {t("ابدأ القراءة")}
          </button>
        </section>
      </main>

      <footer className="qb-site-foot">
        <span>{t("بصائر القرآن")}</span>
        <nav aria-label={t("روابط")}>
          <a href="/guidelines">{t("إرشادات المجتمع")}</a>
          <a href="/about#privacy">{t("الخصوصية")}</a>
        </nav>
      </footer>
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="qb-site-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {lead ? <p className="section-lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function Grid({ items, wide = false, pairs = false }: { items: Item[]; wide?: boolean; pairs?: boolean }) {
  return (
    <div className={`qb-site-grid${wide ? " wide" : ""}${pairs ? " pairs" : ""}`}>
      {items.map((item) => (
        <article key={item.title} className="qb-site-card">
          <span className="ico">
            <Icon name={item.icon} size={20} />
          </span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}
