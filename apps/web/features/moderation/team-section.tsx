"use client";

import { useEffect, useState } from "react";

import type { TeamMember } from "@q-basair/shared";

import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";

/** Admins appoint moderators (by the email of their account) and remove them. */
export function TeamSection() {
  const formatNumber = useNumerals();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api.getModerationTeam().then(setTeam).catch(() => setTeam([]));
  }, []);

  async function change(target: string, role: "moderator" | "user") {
    setProblem(null);
    try {
      setTeam(await api.setModeratorRole(target, role));
      if (role === "moderator") setEmail("");
    } catch (error) {
      setProblem(error instanceof Error && /\b404\b/.test(error.message) ? t("لا حساب بهذا البريد.") : t("تعذّر تغيير الدور."));
    }
  }

  return (
    <>
      <form
        className="qb-mod-card qb-glass add-member"
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) void change(email.trim(), "moderator");
        }}
      >
        <label htmlFor="mod-email">{t("تعيين مشرف")}</label>
        <input
          id="mod-email"
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com" // i18n-ignore
          autoComplete="off"
        />
        <button type="submit" className="qb-btn primary" disabled={!email.trim()}>
          {t("تعيين")}
        </button>
        {problem ? <p className="problem" role="alert">{problem}</p> : null}
      </form>
      {team === null ? <div className="qb-skeleton-list" aria-hidden><span /></div> : null}
      {team?.map((member) => (
        <article key={member.user_id} className="qb-mod-card qb-glass compact member">
          <span className="who">
            <b>{member.name || member.email}</b>
            <small dir="ltr">{member.email}</small>
          </span>
          <span className={`role ${member.role}`}>{member.role === "admin" ? t("مشرف عام") : t("مشرف")}</span>
          <span className="meta">
            {t("القرارات:")} {formatNumber(member.actions)}
          </span>
          {member.role === "moderator" ? (
            <button type="button" className="qb-btn ghost" onClick={() => void change(member.email, "user")}>
              {t("إلغاء الإشراف")}
            </button>
          ) : null}
        </article>
      ))}
    </>
  );
}
