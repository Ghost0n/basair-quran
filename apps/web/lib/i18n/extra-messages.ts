/**
 * Message ids used through variables — module constants translated where they
 * are displayed (`t(RELATION_LABELS[i])`) — so the catalog extractor, which
 * reads `t("…")` literals, still collects them. One id per line.
 */
export const EXTRA_MESSAGES = [
  "يفسّر",
  "يؤكّد",
  "يقابل",
  "سبب ← نتيجة",
  "مثال",
  "يتكرّر في",
  "بلا موضوع",
  "قراءة تفسيرية تجريبية",
  "ملاحظة مولَّدة آلياً",
  "حدث خطأ في تحميل صفحة المصحف.",
  "تعذر تحميل صفحة المصحف.",
  "تعذّر إتمام الطلب الآن. تحقّق من اتصالك وحاول مرة أخرى.",
  "تنبيه — ما يَلي قراءة تفسيرية بشرية مُولَّدة من نموذج لغوي. ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم. الدليل الوحيد المُعتَمَد هنا هو القرآن الكريم.",
];
