import type { FeedbackKind, FeedbackStatus, GuidelineRule, PostStatus, QueueReason, ReviewState } from "@q-basair/shared";

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
    return t("تهجّم على جماعة أو معتقد");
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
  get off_topic() {
    return t("خارج موضوع البحث");
  },
  get harassment() {
    return t("مضايقة أو استهداف");
  },
  get other() {
    return t("سبب آخر");
  },
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  get queued() {
    return t("قيد الفحص");
  },
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
  "harassment",
  "off_topic",
  "other",
];

/** A new version of a published post, while it is reviewed. */
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  get queued() {
    return t("نسخة جديدة قيد الفحص");
  },
  get pending_review() {
    return t("نسخة جديدة بانتظار مشرف");
  },
  get changes_requested() {
    return t("النسخة الجديدة تحتاج تعديلاً");
  },
};

/** Why an item waits for a person (the moderators' queue). */
export const QUEUE_REASON_LABEL: Record<QueueReason, string> = {
  get first_post() {
    return t("أول منشور للكاتب");
  },
  get unsure() {
    return t("الفحص الآلي متردّد");
  },
  get declined() {
    return t("رفضه الفحص الآلي");
  },
  get reported() {
    return t("مُبلَّغ عنه");
  },
};

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  get contact() {
    return t("تواصل");
  },
  get bug() {
    return t("خلل");
  },
  get help() {
    return t("مساعدة");
  },
  get feature() {
    return t("اقتراح ميزة");
  },
  get error() {
    return t("تقرير خطأ");
  },
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  get new() {
    return t("جديد");
  },
  get in_progress() {
    return t("قيد المعالجة");
  },
  get resolved() {
    return t("تمّت المعالجة");
  },
  get closed() {
    return t("مغلق");
  },
};

/** True when an API error says posting is suspended for this account (a ban). */
export function isBanned(error: unknown): boolean {
  return error instanceof Error && /"code":"banned"/.test(error.message);
}
