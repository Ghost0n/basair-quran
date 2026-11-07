"use client";

import { useCallback, useEffect, useState } from "react";

import type { ModerationUser } from "@q-basair/shared";

import { relativeAge } from "@/features/companions/use-companions";
import { useCommunityAccess } from "@/features/community/use-community-access";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";
import { AuthorBadge, banEnd } from "./parts";

const ACTION_LABEL: Record<string, () => string> = {
  post_approve: () => t("قبول منشور"),
  post_decline: () => t("رفض منشور"),
  post_remove: () => t("إزالة منشور"),
  post_restore: () => t("إبقاء منشور"),
  comment_approve: () => t("قبول تعليق"),
  comment_decline: () => t("رفض تعليق"),
  comment_restore: () => t("إبقاء تعليق"),
  ban_7d: () => t("إيقاف ٧ أيام"),
  ban_30d: () => t("إيقاف ٣٠ يوماً"),
  ban_permanent: () => t("إيقاف نهائي"),
  unban: () => t("رفع الإيقاف"),
  appeal_uphold: () => t("إبقاء قرار بعد اعتراض"),
  appeal_overturn: () => t("قبول اعتراض"),
};

/**
 * Suspicious authors (three or more declines a moderator upheld) and banned
 * ones, with their recent history. Moderators ban for 7 or 30 days; only an
 * admin bans permanently or lifts a permanent ban. Every ban needs a reason.
 */
export function PeopleSection() {
  const access = useCommunityAccess();
  const formatNumber = useNumerals();
  const [kind, setKind] = useState<"suspicious" | "banned">("suspicious");
  const [users, setUsers] = useState<ModerationUser[] | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [problem, setProblem] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setUsers(null);
    setUsers(await api.getModerationUsers(kind).catch(() => []));
  }, [kind]);
  useEffect(() => {
    void load();
  }, [load]);

  async function ban(user: ModerationUser, days: 7 | 30 | null) {
    const reason = reasons[user.user_id]?.trim();
    if (!reason) {
      setProblem((current) => ({ ...current, [user.user_id]: t("اكتب سبب الإيقاف.") }));
      return;
    }
    try {
      await api.banUser(user.user_id, { days, reason });
      await load();
    } catch {
      setProblem((current) => ({ ...current, [user.user_id]: t("تعذّر الإيقاف.") }));
    }
  }

  async function unban(user: ModerationUser) {
    try {
      await api.unbanUser(user.user_id, reasons[user.user_id]?.trim() || undefined);
      await load();
    } catch {
      setProblem((current) => ({ ...current, [user.user_id]: t("رفع الإيقاف النهائي للمشرف العام فقط.") }));
    }
  }

  return (
    <>
      <div className="qb-segmented sub" role="tablist" aria-label={t("المستخدمون")}>
        <button type="button" role="tab" aria-selected={kind === "suspicious"} className={kind === "suspicious" ? "on" : ""} onClick={() => setKind("suspicious")}>
          {t("مشتبه بهم")}
        </button>
        <button type="button" role="tab" aria-selected={kind === "banned"} className={kind === "banned" ? "on" : ""} onClick={() => setKind("banned")}>
          {t("موقوفون")}
        </button>
      </div>
      {users === null ? <div className="qb-skeleton-list" aria-hidden><span /><span /></div> : null}
      {users?.length === 0 ? (
        <div className="qb-empty">{kind === "suspicious" ? t("لا مستخدمين مشتبه بهم.") : t("لا مستخدمين موقوفين.")}</div>
      ) : null}
      {users?.map((user) => (
        <article key={user.user_id} className="qb-mod-card qb-glass">
          <AuthorBadge author={user} />
          {user.banned ? (
            <p className="note">
              {t("موقوف حتى:")} {banEnd(user.banned_until, formatNumber)}
              {user.ban_reason ? ` — ${user.ban_reason}` : ""}
            </p>
          ) : null}
          {user.history.length ? (
            <ul className="history">
              {user.history.map((entry, index) => (
                <li key={index}>
                  <b>{ACTION_LABEL[entry.action]?.() ?? entry.action}</b>
                  {entry.reason ? <span> — {entry.reason}</span> : null}
                  <small> · {relativeAge(entry.created_at)}</small>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            value={reasons[user.user_id] ?? ""}
            onChange={(event) => setReasons((current) => ({ ...current, [user.user_id]: event.target.value }))}
            placeholder={t("السبب (يُشترط للإيقاف)…")}
            aria-label={t("سبب الإيقاف")}
            rows={2}
          />
          {problem[user.user_id] ? <p className="problem" role="alert">{problem[user.user_id]}</p> : null}
          <div className="decide">
            {user.banned ? (
              <button type="button" className="qb-btn ok" onClick={() => void unban(user)}>
                {t("رفع الإيقاف")}
              </button>
            ) : (
              <>
                <button type="button" className="qb-btn warn" onClick={() => void ban(user, 7)}>
                  {t("إيقاف ٧ أيام")}
                </button>
                <button type="button" className="qb-btn warn" onClick={() => void ban(user, 30)}>
                  {t("إيقاف ٣٠ يوماً")}
                </button>
                {access.isAdmin ? (
                  <button type="button" className="qb-btn danger" onClick={() => void ban(user, null)}>
                    {t("إيقاف نهائي")}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </article>
      ))}
    </>
  );
}
