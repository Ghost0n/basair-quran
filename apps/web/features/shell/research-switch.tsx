"use client";

import "./research-switch.web.css";

import { Icon } from "@/components/icon";
import { haptic } from "@/lib/haptics";

import { useShellMode } from "./mode-context";
import { RESEARCH_PAGES, useOpenDestination } from "./worlds";

import { t } from "@/lib/i18n";

/**
 * On a phone, search and study share the tab bar's research tab: this switch,
 * at the top of both pages, moves between them. Hidden wherever the rail
 * lists them apart (research-switch.web.css).
 */
export function ResearchSwitch() {
  const { mode } = useShellMode();
  const openDestination = useOpenDestination();
  const current = RESEARCH_PAGES.find((item) => item.mode === mode);
  if (!current) return null;
  return (
    <div className="qb-research-switch" role="group" aria-label={t("البحث")}>
      {RESEARCH_PAGES.map((item) => {
        const on = item === current;
        return (
          <button
            key={item.id}
            type="button"
            className={on ? "on" : undefined}
            aria-pressed={on}
            onClick={() => {
              if (on) return;
              haptic("light");
              openDestination(item);
            }}
          >
            <Icon name={item.icon} size={16} stroke={on ? 2.1 : 1.7} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
