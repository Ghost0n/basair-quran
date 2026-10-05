import { activeLocale, t, tn } from "@/lib/i18n";

const VISIT_KEY = "qb.lastVisit";
/** Away this long, the greeting says welcome back. */
const BACK_AFTER_DAYS = 7;

/** When Home was last opened (ms), or null the first time. */
export function readLastVisit(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(VISIT_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function rememberVisit(): void {
  try {
    window.localStorage.setItem(VISIT_KEY, String(Date.now()));
  } catch {
    /* not remembered */
  }
}

/** Today's day and month in the Umm al-Qura calendar (0 when the platform can't tell). */
export function hijriDayMonth(date: Date): { day: number; month: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric" }).formatToParts(date);
    return {
      day: Number(parts.find((part) => part.type === "day")?.value ?? 0),
      month: Number(parts.find((part) => part.type === "month")?.value ?? 0),
    };
  } catch {
    return { day: 0, month: 0 };
  }
}

/** Today in the Hijri calendar, in the interface's language and digits. */
export function hijriToday(date: Date, formatNumber: (value: number) => string): string {
  const locale = activeLocale() === "ar" ? "ar-SA" : activeLocale();
  try {
    const text = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura-nu-latn`, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
    return text.replace(/\d+/g, (digits) => formatNumber(Number(digits)));
  } catch {
    return "";
  }
}

export type Moment = "morning" | "evening" | "ramadan" | "eid" | "back";

/** What the moment is: Ramadan, Eid, a return after a while, else morning or evening. */
export function momentOf(now: Date, lastVisit: number | null): Moment {
  const { day, month } = hijriDayMonth(now);
  if (month === 9) return "ramadan";
  if ((month === 10 && day <= 3) || (month === 12 && day >= 10 && day <= 13)) return "eid";
  if (lastVisit && now.getTime() - lastVisit > BACK_AFTER_DAYS * 86400000) return "back";
  const hour = now.getHours();
  return hour >= 4 && hour < 12 ? "morning" : "evening";
}

/**
 * The home greeting: the user's name (when signed in) and words that follow
 * the moment; under it, today's Hijri date (or how long it has been).
 */
export function greetingFor({
  name,
  newUser,
  lastVisit,
  formatNumber,
  now = new Date(),
}: {
  name: string | null;
  newUser: boolean;
  lastVisit: number | null;
  formatNumber: (value: number) => string;
  now?: Date;
}): { line: string; sub: string } {
  const date = hijriToday(now, formatNumber);
  if (newUser && !lastVisit) return { line: t("أهلاً بك في بصائر"), sub: date };
  const moment = momentOf(now, lastVisit);
  switch (moment) {
    case "ramadan":
      return { line: name ? t("رمضان كريم، {0}", { 0: name }) : t("رمضان كريم"), sub: date };
    case "eid":
      return { line: name ? t("عيد مبارك، {0}", { 0: name }) : t("عيد مبارك"), sub: date };
    case "back": {
      const days = Math.floor((now.getTime() - (lastVisit ?? now.getTime())) / 86400000);
      return { line: name ? t("مرحباً بعودتك، {0}", { 0: name }) : t("مرحباً بعودتك"), sub: tn("آخر زيارة قبل {0} يوم", days, { 0: formatNumber(days) }) };
    }
    case "morning":
      return { line: name ? t("صباح الخير، {0}", { 0: name }) : t("صباح الخير"), sub: date };
    default:
      return { line: name ? t("مساء الخير، {0}", { 0: name }) : t("مساء الخير"), sub: date };
  }
}
