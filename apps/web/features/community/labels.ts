import type { GuidelineRule, PostStatus } from "@q-basair/shared";

export const RULE_LABEL: Record<GuidelineRule, string> = {
  misattribution: "نسبة إلى القرآن ما ليس فيه",
  ruling_as_fact: "حكم شرعي بلا مرجع",
  unlabelled_ai: "محتوى آلي غير موسوم",
  disrespect: "إساءة أو تجريح",
  sectarian_attack: "طعن طائفي",
  integrity: "أمانة علمية",
  spam_promo: "ترويج أو إغراق",
  personal_data: "بيانات شخصية",
  other: "سبب آخر",
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  pending_review: "قيد المراجعة",
  published: "منشور",
  changes_requested: "مطلوب تعديل",
  rejected: "مرفوض",
  withdrawn: "مسحوب",
  removed: "أُزيل",
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
