"use client";

import { BrandMark } from "@/components/brand-mark";

import "./studio-auth-modal.css";

/**
 * StudioAuthModal — shown when a guest tries to use the (auth-gated) Studio.
 * Offers sign-up / sign-in (with a next= back to Studio) or dismiss. The user's
 * draft is preserved (the panel checks auth before clearing it), so they can
 * sign in and resume.
 */
export function StudioAuthModal({ onClose }: { onClose: () => void }) {
  const next =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/";
  const enc = encodeURIComponent(next);

  return (
    <div className="qb-studio-auth" role="dialog" aria-modal="true" aria-label="الدراسة تتطلّب حساباً">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="dialog">
        <BrandMark size={52} />
        <h4>الدراسة تتطلّب حساباً</h4>
        <p>
          القراءة والبحث متاحان للضيف؛ أمّا الدراسة الموجَّهة — الجواب المستند على القرآن مع شواهده —
          فتحتاج حساباً لحفظ جلساتك ومزامنتها.
        </p>
        <div className="actions">
          <a className="primary" href={`/login?tab=signup&next=${enc}`}>
            أنشئ حساباً
          </a>
          <a className="secondary" href={`/login?next=${enc}`}>
            تسجيل الدخول
          </a>
        </div>
        <button type="button" className="dismiss" onClick={onClose}>
          لاحقاً
        </button>
      </div>
    </div>
  );
}
