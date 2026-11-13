"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { NumeralScript, ResearchDefaults } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { BackupSettings } from "@/features/app-mode/backup-settings";
import { DownloadsSettings } from "@/features/app-mode/downloads-settings";
import { FeedbackCard } from "@/features/feedback/feedback-card";
import { AccountSettings } from "@/features/identity/account-settings";
import { READER_MODES, resolveReaderMode } from "@/features/reading/reader-modes";
import { useRecitation } from "@/features/recitation/recitation-context";
import { reciterName, styleLabel } from "@/features/recitation/reciter-catalogue";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";
import { useWorkspace } from "@/features/shell/workspace-context";
import { setShowHighlights, useShowHighlights } from "@/features/themes/ayah-marks";
import { hapticsAvailable, hapticsEnabled, setHapticsEnabled, subscribeHaptics } from "@/lib/haptics";
import { MUSHAF_EDITIONS, resolveEdition } from "@/lib/mushaf-defaults";
import { usePreferences } from "@/lib/preferences-context";

import { AiSettings } from "./ai-settings";
import { HomeSettings } from "./home-settings";
import { LanguageSelect } from "./language-select";
import { chipCentringDelta, chipScrollTarget } from "./settings-index";
import { TranslationsSettings } from "./translations-settings";

import { TAFSSIR_ENABLED } from "@/lib/features";

import { t } from "@/lib/i18n";

const NUMERALS: { value: NumeralScript; label: () => string }[] = [
  { value: "arabic-indic", label: () => t("هنديّة ٠١٢") },
  { value: "latin", label: () => t("لاتينية 012") },
  { value: "persian", label: () => t("فارسيّة ۰۱۲") },
];

const STUDY_MODES: { value: ResearchDefaults["default_mode"]; icon: IconName; label: () => string }[] = [
  { value: "strict", icon: "scale", label: () => t("القرآن وحدَه") },
  { value: "tafssir", icon: "feather", label: () => t("قراءة تفسيرية") },
];

const DEPTHS: { value: ResearchDefaults["depth"]; label: () => string }[] = [
  { value: "fast", label: () => t("سريع") },
  { value: "balanced", label: () => t("متوازن") },
  { value: "deep", label: () => t("عميق") },
];

/** Arabic without its marks (and tatweel), lower-cased: what a search compares. */
function fold(text: string): string {
  return text.replace(/[ً-ٰٟـ]/g, "").toLowerCase().trim();
}

/** What a search can show or hide inside a section (Home's switches, a translation…). */
const ROWS = ".qb-setting-row, .qb-switch-list > li, .qb-translations-card .options > li";

/** The settings' sections, in the order of the page and of its index. */
const SECTIONS: { id: string; icon: IconName; label: () => string }[] = [
  { id: "appearance", icon: "sun", label: () => t("العرض") },
  { id: "translations", icon: "globe", label: () => t("ترجمة المعاني") },
  { id: "reading", icon: "book", label: () => t("القراءة والمصحف") },
  { id: "recitation", icon: "volume", label: () => t("التلاوة") },
  { id: "study", icon: "sparkles", label: () => t("الدراسة") },
  { id: "ai", icon: "zap", label: () => t("الذكاء الاصطناعي") },
  { id: "home", icon: "home", label: () => t("الرئيسية") },
  { id: "downloads", icon: "download", label: () => t("التنزيلات") },
  { id: "backup", icon: "shieldCheck", label: () => t("النسخ الاحتياطي") },
  { id: "support", icon: "comment", label: () => t("الدعم والملاحظات") },
  { id: "account", icon: "user", label: () => t("الحساب") },
];

/** Haptic feedback on this device: whether there is any, and whether it is on. */
function useHapticsSetting(): { available: boolean; on: boolean } {
  const on = useSyncExternalStore(subscribeHaptics, hapticsEnabled, () => true);
  // Known only in the browser (the app's bridge, Android's class on <html>).
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(hapticsAvailable()), []);
  return { available, on };
}

/** One setting: its name and what it does on one side, the control on the other. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="qb-setting-row is-split">
      <div className="txt">
        <span className="name">{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      <div className="ctl">{children}</div>
    </div>
  );
}

function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="qb-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          onClick={() => value !== option.value && onChange(option.value)}
        >
          {option.icon ? <Icon name={option.icon} size={15} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="qb-switch-btn" onClick={() => onChange(!on)}>
      <span className="qb-switch" aria-hidden="true" />
    </button>
  );
}

/**
 * Settings in the web design (desktop): an index of the sections beside the
 * page, always in reach and following the scroll, and every preference the
 * reader owns — display, the Mushaf and how it reads, translations,
 * recitation, the study's defaults, Home, downloads and the account — each as
 * a row: what it is and does on one side, its control on the other.
 */
export function SettingsWeb() {
  const { preferences, updateAccount } = usePreferences();
  const { state, actions } = useWorkspace();
  const recitation = useRecitation();
  const showHighlights = useShowHighlights();
  const haptics = useHapticsSetting();
  const pageRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState<string[]>(SECTIONS.map((section) => section.id));
  const [active, setActive] = useState(SECTIONS[0].id);
  // The top bar carries a search over every setting (the rail already names the page).
  const topSlots = useTopBarSlots();
  const [query, setQuery] = useState("");
  const [matching, setMatching] = useState<string[] | null>(null);

  // A section with nothing to show (downloads on the web, the account without
  // sign-in) leaves the index.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const read = () =>
      setPresent(
        SECTIONS.filter((section) => (page.querySelector(`#settings-${section.id}`)?.childElementCount ?? 0) > 0).map((section) => section.id),
      );
    read();
    const changes = new MutationObserver(read);
    changes.observe(page, { childList: true, subtree: true });
    return () => changes.disconnect();
  }, []);

  // When a chip was last tapped (the page then glides to its section).
  const jumpedAtRef = useRef(-Infinity);

  // Opened on a section (?section=ai, from the study page or a sign-in): go there.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("section");
    if (!wanted) return;
    const timer = window.setTimeout(() => {
      jumpedAtRef.current = performance.now();
      pageRef.current?.querySelector(`#settings-${wanted}`)?.scrollIntoView({ block: "start" });
      setActive(wanted);
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  // The index follows the scroll: the section crossing the top third is current.
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace("settings-", ""));
      },
      { root: page, rootMargin: "0px 0px -66% 0px" },
    );
    page.querySelectorAll("[data-settings-section]").forEach((element) => seen.observe(element));
    // At the very bottom the last sections can never reach the top third:
    // the last one shown is current there.
    const atEnd = () => {
      // A chip just tapped stays current while the page glides to its section.
      if (performance.now() - jumpedAtRef.current < 1200) return;
      if (page.scrollTop <= 0 || page.scrollTop + page.clientHeight < page.scrollHeight - 2) return;
      const shown = Array.from(page.querySelectorAll<HTMLElement>("[data-settings-section]")).filter(
        (element) => element.childElementCount > 0 && !element.hasAttribute("data-filtered-out"),
      );
      const last = shown[shown.length - 1];
      if (last) setActive(last.id.replace("settings-", ""));
    };
    page.addEventListener("scroll", atEnd, { passive: true });
    return () => {
      seen.disconnect();
      page.removeEventListener("scroll", atEnd);
    };
  }, []);

  // The chip row (a phone) follows too: the current section's chip slides to
  // its middle, so the row always shows where the page is. Only the row
  // scrolls, never the page under the finger.
  const indexRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = indexRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const delta = chipCentringDelta(row.getBoundingClientRect(), chip.getBoundingClientRect());
    if (Math.abs(delta) < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // An absolute place inside the row's range, not a distance: quick changes
    // (scrolling back to the top crosses every section) never pile up past
    // its ends, where iOS left the row stuck in its overscroll.
    const rtl = getComputedStyle(row).direction === "rtl";
    row.scrollTo({ left: chipScrollTarget(row.scrollLeft, delta, row.scrollWidth - row.clientWidth, rtl), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  // The search keeps the rows that match (or a whole section when its name
  // does) and hides the rest; the index lists only the sections left.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const needle = fold(query);
    const apply = () => {
      const found: string[] = [];
      page.querySelectorAll<HTMLElement>("[data-settings-section]").forEach((section) => {
        const id = section.id.replace("settings-", "");
        const rows = Array.from(section.querySelectorAll<HTMLElement>(ROWS));
        const titled = needle !== "" && fold(section.querySelector("h2, h3")?.textContent ?? "").includes(needle);
        let any = titled;
        for (const row of rows) {
          const keep = !needle || titled || fold(row.textContent ?? "").includes(needle);
          row.toggleAttribute("data-filtered-out", !keep);
          if (keep && needle) any = true;
        }
        section.toggleAttribute("data-filtered-out", needle !== "" && !any);
        if (!needle || any) found.push(id);
      });
      setMatching(needle ? found : null);
    };
    apply();
    if (!needle) return;
    // Rows that arrive later (the translations' catalogue) are filtered too.
    const changes = new MutationObserver(() => {
      changes.disconnect();
      apply();
      changes.observe(page, { childList: true, subtree: true });
    });
    changes.observe(page, { childList: true, subtree: true });
    return () => changes.disconnect();
  }, [query]);

  function jump(id: string) {
    jumpedAtRef.current = performance.now();
    setActive(id);
    pageRef.current?.querySelector(`#settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const edition = state.edition;
  const readerMode = resolveReaderMode(preferences.reader_layout);
  const reciterId = preferences.reciter || recitation.reciter?.id || "";
  const research = preferences.research;

  const section = (id: string, children: ReactNode) => (
    <div id={`settings-${id}`} data-settings-section className="qb-settings-sec">
      {children}
    </div>
  );

  return (
    <div className="qb-settings is-web" ref={pageRef}>
      {topSlots
        ? createPortal(
            <div className="field qb-settings-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                  if (event.key === "Enter" && matching?.[0]) jump(matching[0]);
                }}
                placeholder={t("ابحث في الإعدادات…")}
                aria-label={t("ابحث في الإعدادات…")}
              />
              {query ? (
                <button type="button" className="clear" onClick={() => setQuery("")} aria-label={t("مسح التصفية")} title={t("مسح التصفية")}>
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>,
            topSlots.start,
          )
        : null}
      {topSlots ? null : (
        // No top bar to carry the page on a phone: its own heading, as before.
        <div className="qb-settings-h">
          <div className="kicker">{t("الإعدادات")}</div>
          <h2>{t("التفضيلات")}</h2>
        </div>
      )}
      <nav className="qb-settings-index" ref={indexRef} aria-label={t("الإعدادات")}>
        {SECTIONS.filter((item) => present.includes(item.id) && (!matching || matching.includes(item.id))).map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "true" : undefined}
            onClick={() => jump(item.id)}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label()}</span>
          </button>
        ))}
      </nav>

      <div className="qb-settings-grid">
        {matching && matching.length === 0 ? <p className="qb-settings-empty">{t("لا نتائج مطابقة.")}</p> : null}
        {section(
          "appearance",
          <section className="qb-setting-card">
            <h3>{t("العرض")}</h3>
            <p className="card-sub">{t("اللغة والسمة وطريقة عرض الأرقام في الواجهة.")}</p>
            <Row label={t("السمة")}>
              <Segments
                label={t("السمة")}
                value={state.theme}
                options={[
                  { value: "dark", label: t("داكنة"), icon: "moon" },
                  { value: "light", label: t("فاتحة"), icon: "sun" },
                ]}
                onChange={() => actions.toggleTheme()}
              />
            </Row>
            <Row label={t("لغة الواجهة")} hint="Language">
              <LanguageSelect className="qb-setting-menu" />
            </Row>
            <Row label={t("الأرقام")}>
              <Segments
                label={t("الأرقام")}
                value={preferences.numerals}
                options={NUMERALS.map((option) => ({ value: option.value, label: option.label() }))}
                onChange={(numerals) => void updateAccount({ numerals })}
              />
            </Row>
            {haptics.available ? (
              <Row label={t("الاهتزاز عند اللمس")} hint={t("نقرة خفيفة عند تقليب الصفحة وتغيير التبويب، على هذا الجهاز.")}>
                <Switch label={t("الاهتزاز عند اللمس")} on={haptics.on} onChange={setHapticsEnabled} />
              </Row>
            ) : null}
          </section>,
        )}

        {section(
          "reading",
          <section className="qb-setting-card">
            <h3>{t("القراءة والمصحف")}</h3>
            <Row label={t("المصحف")} hint={edition.description}>
              {MUSHAF_EDITIONS.length > 1 ? (
                <SelectMenu
                  className="qb-setting-menu"
                  ariaLabel={t("المصحف")}
                  value={edition.id}
                  options={MUSHAF_EDITIONS.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={(next) => void updateAccount({ mushaf_edition: resolveEdition(next).id })}
                />
              ) : (
                <span className="value">{edition.name}</span>
              )}
            </Row>
            <Row label={t("طريقة القراءة (Shift+M)")} hint={READER_MODES.find((item) => item.mode === readerMode)?.hint}>
              <Segments
                label={t("طريقة القراءة (Shift+M)")}
                value={readerMode}
                options={READER_MODES.map((item) => ({ value: item.mode, label: item.label, icon: item.icon }))}
                onChange={(mode) => void updateAccount({ reader_layout: READER_MODES.find((item) => item.mode === mode)!.layout })}
              />
            </Row>
            <Row label={t("تظليل المواضيع")} hint={t("لوّن آيات مواضيعك في المصحف.")}>
              <Switch label={t("تظليل المواضيع")} on={showHighlights} onChange={setShowHighlights} />
            </Row>
          </section>,
        )}

        {section("translations", <TranslationsSettings />)}

        {section(
          "recitation",
          <section className="qb-setting-card">
            <h3>{t("التلاوة")}</h3>
            <p className="card-sub">{t("القارئ الذي تبدأ به التلاوة على كل أجهزتك.")}</p>
            <Row label={t("القارئ")} hint={styleLabel(recitation.reciters.find((item) => item.id === reciterId)?.style ?? "") || undefined}>
              {recitation.reciters.length ? (
                <SelectMenu
                  className="qb-setting-menu"
                  ariaLabel={t("القارئ")}
                  value={reciterId}
                  options={recitation.reciters.map((item) => ({ value: item.id, label: reciterName(item) }))}
                  onChange={(reciter) => void updateAccount({ reciter })}
                />
              ) : (
                <span className="value">{t("جارٍ التحميل…")}</span>
              )}
            </Row>
          </section>,
        )}

        {/* «الدراسة» holds only the explanatory reading's choices: it exists
            only in a build that has that reading (lib/features.ts). */}
        {TAFSSIR_ENABLED && section(
          "study",
          <section className="qb-setting-card">
            <h3>{t("الدراسة")}</h3>
            <p className="card-sub">{t("كيف تبدأ كل دراسة جديدة؛ تغيّرها لكل سؤال من صفحة الدراسة.")}</p>
            <Row
              label={t("المنهج")}
              hint={research.default_mode === "strict" ? t("أجوبة من نص القرآن وحده.") : t("قراءة تستعين بالتفاسير، مع التنبيه عليها.")}
            >
              <Segments
                label={t("المنهج")}
                value={research.default_mode}
                options={STUDY_MODES.map((option) => ({ value: option.value, label: option.label(), icon: option.icon }))}
                onChange={(default_mode) => void updateAccount({ research: { default_mode } })}
              />
            </Row>
            {research.default_mode === "tafssir" ? (
              <Row label={t("العمق")} hint={t("الأعمق أدقّ وأبطأ.")}>
                <Segments
                  label={t("العمق")}
                  value={research.depth}
                  options={DEPTHS.map((option) => ({ value: option.value, label: option.label() }))}
                  onChange={(depth) => void updateAccount({ research: { depth } })}
                />
              </Row>
            ) : null}
          </section>,
        )}

        {section("ai", <AiSettings />)}
        {section("home", <HomeSettings />)}
        {section("downloads", <DownloadsSettings />)}
        {section("backup", <BackupSettings />)}
        {section("support", <FeedbackCard />)}
        {section("account", <AccountSettings />)}
      </div>
    </div>
  );
}
