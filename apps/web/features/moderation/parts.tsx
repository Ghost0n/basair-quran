"use client";

import type { AuthorStanding, GuidelineRule, PostReview } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { RULE_LABEL } from "@/features/community/labels";
import { localeInfo } from "@/lib/i18n/locales";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

type Issue = { rule?: string; severity?: string; quote?: string; explanation?: string; suggestion?: string };

const VERDICT_LABEL: Record<string, () => string> = {
  valid: () => t("سليم"),
  unsure: () => t("متردّد"),
  declined: () => t("مرفوض"),
};

/** The agent's latest check of an item: verdict, confidence, the language it wrote in, its findings. */
export function AgentCheck({ checks }: { checks: PostReview[] }) {
  const formatNumber = useNumerals();
  const agent = checks.find((check) => check.stage === "agent");
  if (!agent) return null;
  const issues = (agent.issues ?? []) as Issue[];
  const failed = agent.note === "provider_unavailable" || agent.note === "invalid_output";
  return (
    <div className="qb-mod-check">
      <div className={`ai v-${agent.verdict}`}>
        <Icon name="shieldCheck" size={14} />
        <span>
          {t("الفحص الآلي:")} <b>{VERDICT_LABEL[agent.verdict]?.() ?? agent.verdict}</b>
          {agent.confidence != null && !failed ? (
            <small>
              {" "}
              · {t("الثقة")} {formatNumber(Math.round(agent.confidence * 100))}٪
            </small>
          ) : null}
          {agent.note === "provider_unavailable" ? <small>{t(" (لم يكن الوكيل متاحاً)")}</small> : null}
          {agent.note === "invalid_output" ? <small>{t(" (مخرجات غير صالحة)")}</small> : null}
          {agent.language ? (
            <small>
              {" "}
              · {t("بلغة الكاتب:")} {localeInfo(agent.language).native}
            </small>
          ) : null}
        </span>
      </div>
      {issues.length ? (
        <ul className="issues">
          {issues.map((issue, index) => (
            <li key={index} className={`sev-${issue.severity}`}>
              <b>{RULE_LABEL[(issue.rule ?? "other") as GuidelineRule] ?? issue.rule}</b>
              {issue.quote ? <q>{issue.quote}</q> : null}
              <span>{issue.explanation}</span>
              {issue.suggestion ? (
                <span className="suggest">
                  {t("اقتراح:")} {issue.suggestion}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Who wrote it, and where they stand: trust level, upheld declines, ban. */
export function AuthorBadge({ author }: { author: AuthorStanding }) {
  const formatNumber = useNumerals();
  return (
    <span className="qb-mod-author">
      <b>{author.name}</b>
      <span className={`trust ${author.level}`}>{author.level === "verified" ? t("موثوق") : t("غير موثَّق")}</span>
      {author.upheld_declines ? (
        <span className={`strikes${author.suspicious ? " suspicious" : ""}`}>
          {t("مخالفات مؤكَّدة:")} {formatNumber(author.upheld_declines)}
        </span>
      ) : null}
      {author.banned ? <span className="banned">{t("موقوف")}</span> : null}
    </span>
  );
}

/** A ban's end, as a date, or «نهائي». */
export function banEnd(until: number | null | undefined, formatNumber: (n: number) => string): string {
  if (until == null) return "";
  if (until === -1) return t("نهائي");
  const date = new Date(until * 1000);
  return `${formatNumber(date.getDate())}/${formatNumber(date.getMonth() + 1)}/${formatNumber(date.getFullYear())}`;
}
