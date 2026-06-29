"use client";

import "./onboarding.css";

import { useEffect, useState } from "react";

import { BrandMarkRich } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { modKey } from "@/lib/platform";

const STORAGE_KEY = "qbasair.onboarded";

const CARDS: { num: string; icon: IconName; title: string; body: string; example: string }[] = [
  {
    num: "١",
    icon: "search",
    title: "ابحث بالجذر والكلمة",
    body: "اكتب جذراً أو كلمة قرآنية في شريط الأوامر، فتظهر كل المواضع بجانب المصحف الحيّ.",
    example: "ب · ص · ر",
  },
  {
    num: "٢",
    icon: "book",
    title: "المصحف هو الغرفة",
    body: "اقرأ المصحف كاملاً، انتقل بالصفحة أو السورة أو الجزء، واستمع للتلاوة.",
    example: "صفحة ١٤١ · سورة الأنعام",
  },
  {
    num: "٣",
    icon: "feather",
    title: "بحث موجَّه — لا يخلط",
    body: "الوضع المُقيَّد يستند إلى القرآن وحدَه (ذهبي)؛ الوضع التفسيري تجريبي (نحاسي) ويحمل تنبيهه دائماً.",
    example: "القرآن وحدَه · قراءة تفسيرية",
  },
];

/**
 * Onboarding — the first-launch hero. Shown once (gated by localStorage);
 * dismissed by "ابدأ القراءة".
 */
export function OnboardingScreen({ onClose }: { onClose: () => void }) {
  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode — onboarding may show again, harmless */
    }
    onClose();
  }

  return (
    <div className="qb-onboard" role="dialog" aria-label="مرحباً بك في بصائر القرآن">
      <div className="qb-onboard-inner">
        <BrandMarkRich size={108} />
        <h1>بَصَائِر القُرآن</h1>
        <div className="subtitle">Baṣāʾir · the scholar&apos;s room for the Qurʾān</div>
        <p className="lead">
          مساحة عمل تجمع البحث في الجذور والكلمات، قراءة المصحف، والبحث الموجَّه — في غرفة واحدة هادئة.
        </p>

        <div className="qb-onboard-grid">
          {CARDS.map((card) => (
            <div key={card.num} className="qb-onboard-card">
              <span className="num">{card.num}</span>
              <Icon name={card.icon} size={22} />
              <h4>{card.title}</h4>
              <p>{card.body}</p>
              <div className="example">{card.example}</div>
            </div>
          ))}
        </div>

        {/* U2: platform-aware modifier key */}
        <div className="qb-onboard-cmd" suppressHydrationWarning>
          <span>شريط أوامر واحد لكل شيء — البحث، التنقّل، السؤال:</span>
          <kbd suppressHydrationWarning>{modKey()}</kbd>
          <kbd>K</kbd>
          <span>أو</span>
          <kbd>/</kbd>
        </div>

        <div className="qb-onboard-actions">
          <button type="button" className="gold" onClick={dismiss}>
            ابدأ القراءة <Icon name="arrowLeft" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mounts the onboarding overlay only on the user's first visit.
 */
export function OnboardingGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "1") {
        setShow(true);
      }
    } catch {
      /* localStorage unavailable — skip onboarding */
    }
  }, []);

  if (!show) return null;
  return <OnboardingScreen onClose={() => setShow(false)} />;
}
