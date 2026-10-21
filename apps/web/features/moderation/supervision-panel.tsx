"use client";

import "./moderation.css";

import { useCallback, useEffect, useState } from "react";

import type { ModerationHealth } from "@q-basair/shared";

import { Icon, type IconName } from "@/components/icon";
import { useCommunityAccess } from "@/features/community/use-community-access";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";
import { FeedbackSection } from "./feedback-section";
import { HealthSection } from "./health-section";
import { PeopleSection } from "./people-section";
import { QueueSection } from "./queue-section";
import { TeamSection } from "./team-section";

type Section = "queue" | "people" | "feedback" | "team" | "health";

/**
 * The supervision panel (docs/community-moderation-design.md): what waits for
 * a person, suspicious and banned authors, the feedback centre, the team
 * (admins) and the checking batches' health. Shown to moderators and admins.
 */
export function SupervisionPanel({ surahName, onOpen }: { surahName: (surahId: number) => string; onOpen: (postId: string) => void }) {
  const access = useCommunityAccess();
  const formatNumber = useNumerals();
  const [section, setSection] = useState<Section>("queue");
  const [health, setHealth] = useState<ModerationHealth | null>(null);

  const refreshHealth = useCallback(() => {
    api.getModerationHealth().then(setHealth).catch(() => {});
  }, []);
  useEffect(() => refreshHealth(), [refreshHealth, section]);

  const sections: { value: Section; label: string; icon: IconName; count?: number }[] = [
    { value: "queue", label: t("المراجعة"), icon: "gavel", count: (health?.backlog.waiting_for_people ?? 0) + (health?.backlog.open_appeals ?? 0) },
    { value: "people", label: t("المستخدمون"), icon: "users" },
    { value: "feedback", label: t("الملاحظات"), icon: "comment", count: health?.backlog.open_feedback },
    ...(access.isAdmin ? [{ value: "team" as Section, label: t("الفريق"), icon: "shieldCheck" as IconName }] : []),
    { value: "health", label: t("الحالة"), icon: "monitor" },
  ];

  return (
    <div className="qb-moderation qb-supervision">
      <div className="qb-segmented qb-fit-track sections" data-autofit="1" role="tablist" aria-label={t("لوحة الإشراف")}>
        {sections.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={section === entry.value}
            className={section === entry.value ? "on" : ""}
            onClick={() => setSection(entry.value)}
          >
            <Icon name={entry.icon} size={14} /> {entry.label}
            {entry.count ? <span className="count">{formatNumber(entry.count)}</span> : null}
          </button>
        ))}
      </div>
      {section === "queue" ? <QueueSection surahName={surahName} onOpen={onOpen} onChange={refreshHealth} /> : null}
      {section === "people" ? <PeopleSection /> : null}
      {section === "feedback" ? <FeedbackSection onChange={refreshHealth} /> : null}
      {section === "team" && access.isAdmin ? <TeamSection /> : null}
      {section === "health" ? <HealthSection health={health} onRefresh={refreshHealth} canRun={access.isAdmin} /> : null}
    </div>
  );
}
