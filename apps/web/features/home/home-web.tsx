"use client";

import "./home.web.css";

import { useEffect, useState, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/icon";
import { GirihPattern } from "@/components/girih";
import { Ribbon, SURAH_NAMES } from "@/components/ribbon";

import { positionCounts } from "./home-web-model";

import { t } from "@/lib/i18n";

export type WebHomeRow = { id: string; icon: IconName; label: string; sub?: string; onClick: () => void };

/** A titled list beside the reading card (the recent pages, the recent searches). */
export type WebHomeList = { id: string; title: string; rows: WebHomeRow[] };

export type WebHomeProps = {
  greeting: { line: string; sub?: string | null } | null;
  verse: { text: string; surah: string; ayah: number; key: number; onRead: () => void; onListen: () => void } | null;
  reading: {
    eyebrow: string;
    title: string;
    meta?: string;
    page: number | null;
    surah: number | null;
    action: string;
    onAction: () => void;
    onListen?: () => void;
  } | null;
  lists: WebHomeList[];
  formatNumber: (value: number) => string;
  /** Phones: the account and settings button, in the hero's corner (the rail that carries it is hidden). */
  corner?: ReactNode;
  /** What opens over Home (the account sheet). */
  overlay?: ReactNode;
};

/**
 * Home in the web design (desktop web): the verse holds the hero, written word
 * by word over the rosette; beside the reading card, the last places read and
 * searches run as quiet lists. Same data and actions as the phone Home (home-screen.tsx).
 */
/** Whether Home's hero has drawn itself once since the app started. */
let heroPlayed = false;

export function WebHome({ greeting, verse, reading, lists, formatNumber, corner, overlay }: WebHomeProps) {
  const words = verse ? verse.text.split(" ") : [];
  // The rosette and the verse draw themselves on the first visit only:
  // coming back to Home finds it as it was left, not a new space. While
  // Home stays open, the next verse still writes itself in.
  const [entrance] = useState(() => !heroPlayed);
  const [firstKey] = useState(() => verse?.key ?? null);
  useEffect(() => {
    heroPlayed = true;
  }, []);
  const writeIn = entrance || verse?.key !== firstKey;
  const here = reading?.surah ? reading.surah - 1 : null;

  return (
    <div className="qb-home-web">
      {corner ? <div className="qbw-corner">{corner}</div> : null}
      {verse ? (
        <section className="qbw-hero" aria-label={t("آية")}>
          <GirihPattern className="qbw-hero-girih" drawn={entrance} />
          {greeting ? (
            <div className="qbw-greeting">
              <h1>{greeting.line}</h1>
              {greeting.sub ? <p>{greeting.sub}</p> : null}
            </div>
          ) : null}
          <p key={verse.key} className={`qbw-verse${writeIn ? " qb-word-in" : ""}`} lang="ar" dir="rtl">
            {words.map((word, i) => (
              <span key={i} style={{ ["--w" as string]: i }}>
                {word}
                {i < words.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
          <p className="qbw-ref">
            {verse.surah}: {formatNumber(verse.ayah)}
          </p>
          <div className="qbw-acts">
            <button type="button" className="qb-btn" onClick={verse.onRead}>
              <Icon name="book" size={16} />
              {t("اقرأها في سياقها")}
            </button>
            <button type="button" className="qb-btn" onClick={verse.onListen}>
              <Icon name="ear" size={16} />
              {t("استمع")}
            </button>
          </div>
        </section>
      ) : greeting ? (
        <div className="qbw-greeting qbw-greeting-solo">
          <h1>{greeting.line}</h1>
          {greeting.sub ? <p>{greeting.sub}</p> : null}
        </div>
      ) : null}

      <div className="qbw-grid">
        <div className="qbw-main">
          {reading ? (
            <section className="qbw-resume" aria-label={reading.eyebrow}>
              <div className="qbw-block-title">
                <h2>{reading.eyebrow}</h2>
                {reading.meta ? <span>{reading.meta}</span> : null}
              </div>
              <div className="qbw-resume-row">
                <h3>{reading.title}</h3>
                {reading.page ? (
                  <div className="qbw-page qb-gold-num">
                    {formatNumber(reading.page)}
                    <small>{t("من {0}", { 0: formatNumber(604) })}</small>
                  </div>
                ) : null}
              </div>
              {here != null ? (
                <Ribbon
                  counts={positionCounts(reading.surah)}
                  label={t("موضعك في المصحف")}
                  here={here}
                  flat
                  grow
                  height={44}
                  readout={(i) => (i === here ? t("{0}: أنت هنا", { 0: SURAH_NAMES[i] }) : SURAH_NAMES[i])}
                  restReadout={t("موضعك في المصحف")}
                />
              ) : null}
              <div className="qbw-acts qbw-acts-start">
                <button type="button" className="qb-btn primary" onClick={reading.onAction}>
                  {reading.action}
                </button>
                {reading.onListen ? (
                  <button type="button" className="qb-btn" onClick={reading.onListen}>
                    <Icon name="play" size={16} />
                    {t("استمع من حيث توقفت")}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {lists.length ? (
          <div className="qbw-lists">
            {lists.map((list) => (
              <section key={list.id} className="qbw-list" aria-label={list.title}>
                <h2 className="qbw-list-title">{list.title}</h2>
                <ul className="qbw-rows">
                  {list.rows.map((row) => (
                    <li key={row.id}>
                      <Row {...row} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>
      {overlay}
    </div>
  );
}

function Row({ icon, label, sub, onClick }: WebHomeRow): ReactNode {
  return (
    <button type="button" className="qbw-row" onClick={onClick}>
      <span className="glyph">
        <Icon name={icon} size={18} />
      </span>
      <span className="txt">
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      <Icon name="chevLeft" size={16} className="chev" />
    </button>
  );
}
