import type { GuidelineRule, PostStatus } from "@q-basair/shared";

import { t } from "@/lib/i18n";

export const RULE_LABEL: Record<GuidelineRule, string> = {
  get misattribution() {
    return t("نسبة إلى القرآن ما ليس فيه");
  },
  get ruling_as_fact() {
    return t("حكم شرعي بلا مرجع");
  },
  get unlabelled_ai() {
    return t("محتوى آلي غير موسوم");
  },
  get disrespect() {
    return t("إساءة أو تجريح");
  },
  get sectarian_attack() {
    return t("طعن طائفي");
  },
  get integrity() {
    return t("أمانة علمية");
  },
  get spam_promo() {
    return t("ترويج أو إغراق");
  },
  get personal_data() {
    return t("بيانات شخصية");
  },
  get other() {
    return t("سبب آخر");
  },
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  get pending_review() {
    return t("قيد المراجعة");
  },
  get published() {
    return t("منشور");
  },
  get changes_requested() {
    return t("مطلوب تعديل");
  },
  get rejected() {
    return t("مرفوض");
  },
  get withdrawn() {
    return t("مسحوب");
  },
  get removed() {
    return t("أُزيل");
  },
};

export const REPORT_RULES: GuidelineRule[] = [
  "misattribution",
  "ruling_as_fact",
  "disrespect",
  "sectarian_attack",
  "integrity",
  "spam_promo",
  "personal_data",
  "other",
];
