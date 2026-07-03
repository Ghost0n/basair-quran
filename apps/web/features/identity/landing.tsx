"use client";

import { BrandMark } from "@/components/brand-mark";

import "@/features/auth/auth.css";

/**
 * Landing — the first screen for a visitor who is neither signed in nor has
 * chosen to browse as a guest. Offers the three ways in: create an account,
 * sign in, or continue as a guest (reading + search are open; Studio is gated).
 */
export function Landing({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="qb-auth">
      <div style={{ animation: "qbRise 500ms var(--motion-ease-settle) both" }}>
        <BrandMark size={72} />
      </div>
      <div className="qb-auth-head" style={{ animation: "qbRise 500ms var(--motion-ease-settle) 80ms both" }}>
        <div className="qb-auth-wordmark">بَصَائِر القُرآن</div>
        <div className="qb-auth-sub">BASAIR · THE SCHOLAR&apos;S ROOM</div>
      </div>

      <p className="qb-landing-tagline">
        مساحةُ بحثٍ قرآنية للباحث — قراءةٌ مُتقنة للمصحف، بحثٌ في الجذور والكلمات، ودراسةٌ موجَّهة في المعاني.
      </p>

      <div className="qb-landing-actions">
        <a className="qb-landing-primary" href="/login?tab=signup">
          أنشئ حساباً جديداً
        </a>
        <a className="qb-landing-secondary" href="/login">
          تسجيل الدخول
        </a>
      </div>

      <button type="button" className="qb-landing-guest" onClick={onGuest}>
        تصفّح كضيف ←
      </button>

      <div className="qb-auth-guest-note">
        القراءة والبحث متاحان بلا حساب · الدراسة الموجَّهة تتطلّب حساباً
      </div>
    </div>
  );
}
