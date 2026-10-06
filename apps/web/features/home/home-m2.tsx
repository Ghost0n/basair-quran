"use client";

import "./home-m2.css";

import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import { useShellMode } from "@/features/shell/mode-context";

import { t } from "@/lib/i18n";

export type HomeCard = {
  eyebrow: string;
  title: string;
  small?: boolean;
  meta?: string;
  action: string;
  onAction: () => void;
  onListen?: () => void;
};

type Shortcut = { id: string; icon: IconName; label: string; sub?: string; onClick: () => void };

/**
 * Home in the phone prototype (lib/ux-prototype.ts). The screen splits the way
 * a hand holds it: the upper half is for looking (brand, greeting), the lower
 * half for acting — the one thing to continue, four labelled shortcuts and the
 * search field, all inside the thumb's comfortable arc above the tab bar.
 * No deck to swipe and no hidden worlds: every choice is a visible, labelled
 * target of at least 48px (docs/mobile-ergonomics-prototype.md).
 */
export function HomeM2({
  greeting,
  reading,
  research,
  hasSession,
  newPosts,
  accountButton,
  onOpenAccount,
}: {
  greeting: { line: string; sub?: string | null };
  reading: HomeCard;
  research: HomeCard;
  hasSession: boolean;
  newPosts: number;
  accountButton: React.RefObject<HTMLButtonElement | null>;
  onOpenAccount: () => void;
}) {
  const { setMode } = useShellMode();

  const shortcuts: Shortcut[] = [
    { id: "index", icon: "menu", label: t("الفهرس"), sub: t("كل السور"), onClick: () => setMode("index") },
    { id: "saved", icon: "bookmark", label: t("المحفوظة"), sub: t("الصفحات المحفوظة"), onClick: () => setMode("saved") },
    // The last study session to resume, or a new one.
    hasSession
      ? { id: "study", icon: "sparkles", label: research.eyebrow, sub: research.title, onClick: research.onAction }
      : { id: "study", icon: "sparkles", label: t("الدراسة"), sub: t("جلسة جديدة"), onClick: () => setMode("studio") },
    {
      id: "community",
      icon: "users",
      label: t("المجتمع"),
      sub: newPosts > 0 ? t("جديد المجتمع") : t("ما يشاركه الباحثون"),
      onClick: () => setMode("community", { params: { tab: null } }),
    },
  ];

  return (
    <div className="qb-home2">
      <header className="qb-home2-top">
        <span className="qb-brandmini" role="img" aria-label={t("بصائر")}>
          <BrandMark size={30} themed />
          <span className="bname" aria-hidden="true">
            {t("بَصَائِر")}
          </span>
        </span>
        <button
          ref={accountButton}
          type="button"
          className="qb-home2-account"
          onClick={onOpenAccount}
          aria-haspopup="dialog"
          aria-label={t("الحساب والإعدادات")}
        >
          <Icon name="user" size={20} />
        </button>
      </header>

      <div className="qb-home2-greeting">
        <h1>{greeting.line}</h1>
        {greeting.sub ? <p>{greeting.sub}</p> : null}
      </div>

      {/* The lower half: everything you can do from here, within reach. */}
      <div className="qb-home2-reach">
        <section className="qb-home2-continue" aria-label={reading.eyebrow}>
          <span className="eyebrow">
            <Icon name="book" size={15} />
            {reading.eyebrow}
          </span>
          <div className="row">
            <div className="txt">
              <h2 className={reading.small ? "sm" : undefined}>{reading.title}</h2>
              {reading.meta ? <p>{reading.meta}</p> : null}
            </div>
            {reading.onListen ? (
              <button type="button" className="listen" onClick={reading.onListen} aria-label={t("استمع من حيث توقفت")}>
                <Icon name="play" size={20} />
              </button>
            ) : null}
          </div>
          <button type="button" className="go" onClick={reading.onAction}>
            {reading.action}
          </button>
        </section>

        <div className="qb-home2-grid">
          {shortcuts.map((item) => (
            <Tile key={item.id} icon={item.icon} label={item.label} sub={item.sub} onClick={item.onClick}>
              {item.id === "community" && newPosts > 0 ? <i className="dot" aria-hidden="true" /> : null}
            </Tile>
          ))}
        </div>

        <button type="button" className="qb-home2-search" onClick={() => setMode("search")}>
          <Icon name="search" size={20} />
          <span>{t("ابحث بكلمة أو جذر، أو اطرح سؤالاً")}</span>
        </button>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  sub,
  onClick,
  children,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="qb-home2-tile" onClick={onClick}>
      <span className="ico">
        <Icon name={icon} size={20} />
        {children}
      </span>
      <span className="txt">
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </button>
  );
}
