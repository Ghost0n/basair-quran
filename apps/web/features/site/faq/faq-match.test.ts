import { describe, expect, it } from "vitest";

import { ANSWERED, rankFaq, type FaqCandidate } from "./faq-match";

const ENTRIES: FaqCandidate[] = [
  { id: "delete", question: "كيف أحذف حسابي؟", keywords: "حذف، إلغاء، حساب، بيانات", answer: "من الإعدادات ← الحساب، احذف حسابك وكل بياناتك متى شئت." },
  { id: "font-size", question: "كيف أكبّر الخط؟", keywords: "حجم، خط، تكبير، تصغير، قراءة", answer: "في وضع «آية آية» غيّر حجم الخط من قائمة «العرض»." },
  { id: "free", question: "هل «بصائر» مجاني؟", keywords: "سعر، اشتراك، دفع، مال، إعلانات", answer: "نعم، القراءة والبحث والتلاوة والدراسة مجانية." },
  { id: "repeat", question: "How do I repeat a verse to memorise it?", keywords: "repeat, memorise, review, range", answer: "In the recitation settings choose to repeat the verse." },
  { id: "offline", question: "离线时可以收听吗？", keywords: "下载、离线、无网络", answer: "在手机应用中可以：在设置中下载。" },
  { id: "ko-delete", question: "계정은 어떻게 삭제하나요?", keywords: "계정, 삭제, 탈퇴, 데이터", answer: "설정 → 계정에서 삭제할 수 있습니다." },
];

const best = (question: string) => rankFaq(question, ENTRIES)[0];

describe("matching a question to the answers already written", () => {
  it("finds the answer whatever the wording, diacritics or letter forms", () => {
    expect(best("اريد حذف الحساب")).toMatchObject({ id: "delete" });
    expect(best("كَيْفَ أُكَبِّرُ حجم الخطّ في المصحف")).toMatchObject({ id: "font-size" });
    expect(best("هل التطبيق مجاني ام باشتراك؟")?.id).toBe("free");
    expect(best("can I repeat one verse many times?")?.id).toBe("repeat");
  });

  it("calls a close match answered, and a new question not", () => {
    expect(best("كيف احذف حسابي")!.score).toBeGreaterThanOrEqual(ANSWERED);
    const unrelated = best("متى يصدر التطبيق على ساعة آبل؟");
    expect(!unrelated || unrelated.score < ANSWERED).toBe(true);
  });

  it("works for languages written without spaces", () => {
    expect(best("可以离线收听吗")?.id).toBe("offline");
  });

  it("meets Korean words typed with their particles", () => {
    expect(best("계정을 삭제하고 싶어요")?.id).toBe("ko-delete");
  });

  it("ignores words that say nothing about the subject", () => {
    expect(rankFaq("how do I", ENTRIES)).toEqual([]);
  });
});
