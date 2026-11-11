// i18n-ignore-file — long-form policy text, kept whole in Arabic (the reference,
// docs/community-guidelines.md) and English (for every other interface language).

export type GuidelinesSection = { title: string; items: string[]; ordered?: boolean };
export type GuidelinesText = { title: string; intro: string; note?: string; sections: GuidelinesSection[] };

export const GUIDELINES: Record<"ar" | "en", GuidelinesText> = {
  ar: {
    title: "إرشادات مجتمع «بصائر»",
    intro:
      "تنطبق على كل ما يُنشر من أبحاث وتعليقات. غايتها مجتمعٌ للبحث الجادّ في القرآن: يُقدَّم فيه الدليل على الرأي، ويُعرض فيه الفهم بحدوده، ويُحترم فيه الناس على اختلافهم.",
    sections: [
      {
        title: "١. القرآن هو الدليل",
        items: [
          "**انقل الآيات بنصّها ومرجعها.** كل آية مقتبسة تُطابَق آلياً مع نص المصحف قبل النشر؛ لا يُنشر بحث فيه آية محرّفة أو منسوبة إلى غير موضعها.",
          "**لا تنسب إلى القرآن ما ليس فيه.** فرّق بوضوح بين نص الآية وفهمك لها.",
          "**لا تجتزئ الآية من سياقها** لتقرير معنى يخالف سياقها؛ اذكر ما قبلها وما بعدها حين يغيّر السياقُ المعنى.",
          "**الترجمات معانٍ وليست القرآن.** ارجع إلى النص العربي في كل استنتاج، واذكر الترجمة التي نقلتَ عنها.",
        ],
      },
      {
        title: "٢. منهجٌ قابل للمراجعة",
        items: [
          "**استقرئ ولا تنتقِ.** إن بنيتَ نتيجةً على مواضع كلمة أو جذر فاعرضها كلها، أو بيّن لماذا اخترتَ بعضها.",
          "**اجعل بحثك قابلاً للإعادة:** اذكر الكلمة أو الجذر الذي بحثتَ عنه وعدد المواضع وطريقة الفرز، ليصل غيرك إلى ما وصلتَ إليه.",
          "**فرّق بين ثلاثة:** ما تنصّ عليه الآية، وما تحتمله، وما تراه أنت.",
          "**صرّح بحدود بحثك:** ما لم تجد له دليلاً، وما بقي احتمالاً، وما يحتاج إلى نظرٍ أوسع.",
        ],
      },
      {
        title: "٣. بحثٌ لا إفتاء",
        items: [
          "«بصائر» منصّة تدبّر وبحث، **لا منصّة إفتاء**. لا تنشر أحكاماً بصيغة الإلزام («يجب»، «يحرم») على أنها نتيجة بحثك.",
          "صِف ما تقدّمه بدقّة: **تأمّل شخصي**، أو **خلاصة بحث**، أو **نقل عن مصدر** منسوب إلى صاحبه مع موضعه.",
          "القراءة التفسيرية المولَّدة آلياً **تجريبية** وتبقى موسومة بتنبيهها؛ لا يُحذف التنبيه ولا يُخفى.",
        ],
      },
      {
        title: "٤. المحتوى المولَّد آلياً",
        items: [
          "كل قسم أنتجه «الباحث الآلي» يبقى موسوماً «جواب آلي» عند النشر، ولو عدّلتَه.",
          "أنت مسؤول عمّا تنشره: راجِع الجواب الآلي وتحقّق من الآيات قبل نشره.",
        ],
      },
      {
        title: "٥. الأدب والاحترام",
        items: [
          "**ناقش الفكرة لا الشخص.** لا سخرية ولا تجريح، ولا حكمَ على إيمان أحد أو نيّته.",
          "**لا تهجّم على أيّ جماعة أو مدرسة فكرية أو معتقد.** يُعرض الاختلاف بإنصاف، بحجّته ومراجعه.",
          "لا محتوى يسيء إلى الأنبياء والرسل، أو إلى أيّ دين أو فئة من الناس.",
          "**لا مضايقة:** لا تلاحق أحداً بالتعليقات ولا تستهدفه، ولا تحرّض غيرك على ذلك.",
        ],
      },
      {
        title: "٦. الأمانة العلمية",
        items: [
          "انسب الأقوال إلى أصحابها، واذكر المصدر والموضع. لا تنتحل عمل غيرك.",
          "**لا تعرض نصاً أو قولاً غير موثَّق على أنه ثابت.** كل نقل من خارج القرآن يُذكر مصدره ودرجة توثيقه إن كانت معروفة.",
          "**لا تقدّم ربطاً بين الآيات ونظرية علمية أو حدث تاريخي على أنه قطعي**؛ اعرضه احتمالاً مع حدوده.",
          "**صحّح خطأك علناً** حين يتبيّن لك، وأشر إلى ما عدّلتَه.",
          "**احترم حقوق النشر:** اقتبس من الكتب والترجمات بقدر الحاجة، مع ذكر المصدر.",
        ],
      },
      {
        title: "٧. التعليق البنّاء",
        items: [
          "علّق لتضيف شيئاً: دليلاً، أو سؤالاً، أو تصحيحاً، أو موضعاً فات الكاتب.",
          "إن خالفتَ فاذكر حجّتك وموضعها في المصحف، واطلب الدليل بلطف.",
          "الإعجاب بمنشور تقديرٌ للجهد، لا شهادة على صحّة كل ما فيه.",
        ],
      },
      {
        title: "٨. ما لا يُقبل",
        items: [
          "الترويج التجاري والروابط الدعائية وجمع المتابعين.",
          "المحتوى السياسي الحزبي والتحريض.",
          "المعلومات المضلِّلة عمداً.",
          "مشاركة بيانات شخصية لغيرك.",
          "إغراق المجتمع بمنشورات مكرّرة.",
          "التعليقات الخارجة عن موضوع البحث المعلَّق عليه.",
        ],
      },
      {
        title: "٩. كيف تُراجَع المنشورات والتعليقات",
        ordered: true,
        items: [
          "**فحوص آلية حاسمة** (تمنع النشر إن فشلت): مطابقة نصوص الآيات، صحّة المراجع، وسم الأقسام الآلية، تنبيه القراءة التفسيرية، حدود الحجم.",
          "**مراجعة آلية** وفق هذه الإرشادات، تجري دورياً على المنشورات والتعليقات الجديدة، وتشرح سبب كل ملاحظة بلغتك.",
          "**مراجعة بشرية**: المشرفون أصحاب القرار النهائي. يراجع مشرفٌ أوّل منشور لكل مستخدم، وكل ما تتردّد فيه المراجعة الآلية أو ترفضه، ويُعلَم الكاتب بالسبب ويمكنه التعديل وإعادة الإرسال.",
        ],
      },
      {
        title: "١٠. البلاغات والاعتراض",
        items: [
          "يمكن لكل مستخدم الإبلاغ عن منشور أو تعليق مع ذكر البند المخالَف.",
          "يمكن للكاتب الاعتراض على قرار الإشراف مرة واحدة، ويُراجَع اعتراضه مشرفٌ آخر.",
        ],
      },
    ],
  },
  en: {
    title: "Basair community guidelines",
    intro:
      "They apply to every research and comment published. Their aim is a community for serious research on the Quran: evidence comes before opinion, understanding is shown with its limits, and people are respected in all their differences.",
    note: "Translated from the Arabic original, which is the reference.",
    sections: [
      {
        title: "1. The Quran is the evidence",
        items: [
          "**Quote verses with their exact text and reference.** Every quoted verse is checked automatically against the mushaf before publishing; a research with an altered or misplaced verse is not published.",
          "**Don't attribute to the Quran what it doesn't say.** Keep the verse's text clearly apart from your understanding of it.",
          "**Don't cut a verse from its context** to assert a meaning its context contradicts; give what comes before and after when the context changes the meaning.",
          "**Translations are meanings, not the Quran.** Go back to the Arabic text for every conclusion, and name the translation you quote.",
        ],
      },
      {
        title: "2. A method others can review",
        items: [
          "**Gather, don't cherry-pick.** If a conclusion rests on the occurrences of a word or root, show them all, or explain why you chose some.",
          "**Make your research repeatable:** give the word or root you searched, the number of occurrences and how you sorted them, so others can reach what you reached.",
          "**Keep three things apart:** what the verse states, what it allows, and what you think.",
          "**State the limits of your research:** what you found no evidence for, what remains a possibility, and what needs a wider look.",
        ],
      },
      {
        title: "3. Research, not rulings",
        items: [
          "Basair is a place for reflection and research, **not for issuing rulings**. Don't publish binding statements («must», «forbidden») as the conclusion of your research.",
          "Describe what you offer precisely: a **personal reflection**, a **research summary**, or a **quotation from a source** attributed to its author, with its place.",
          "AI-generated interpretive readings are **experimental** and keep their warning; the warning is never removed or hidden.",
        ],
      },
      {
        title: "4. AI-generated content",
        items: [
          "Every section produced by the research assistant stays labelled «AI answer» when published, even if you edited it.",
          "You are responsible for what you publish: review the AI answer and check its verses before publishing it.",
        ],
      },
      {
        title: "5. Courtesy and respect",
        items: [
          "**Discuss the idea, not the person.** No mockery or insults, and no judging anyone's faith or intentions.",
          "**No attacks on any group, school of thought or belief.** Differences are presented fairly, with their arguments and sources.",
          "No content insulting the prophets and messengers, or any religion or group of people.",
          "**No harassment:** don't follow or target anyone with comments, and don't encourage others to.",
        ],
      },
      {
        title: "6. Scholarly honesty",
        items: [
          "Attribute sayings to their authors, with the source and the place. Don't pass off others' work as yours.",
          "**Don't present an unverified text or saying as established.** Anything quoted from outside the Quran gives its source, and how well it is verified when that is known.",
          "**Don't present a link between verses and a scientific theory or a historical event as certain**; offer it as a possibility, with its limits.",
          "**Correct your mistakes openly** when you find them, and point out what you changed.",
          "**Respect copyright:** quote books and translations only as much as you need, with the source.",
        ],
      },
      {
        title: "7. Constructive comments",
        items: [
          "Comment to add something: evidence, a question, a correction, or an occurrence the author missed.",
          "If you disagree, give your argument and where it is in the mushaf, and ask for evidence kindly.",
          "Liking a post recognises the effort; it doesn't vouch for everything in it.",
        ],
      },
      {
        title: "8. Not accepted",
        items: [
          "Commercial promotion, advertising links and follower-seeking.",
          "Partisan political content and incitement.",
          "Deliberately misleading information.",
          "Sharing other people's personal data.",
          "Flooding the community with repeated posts.",
          "Comments off the topic of the research they're on.",
        ],
      },
      {
        title: "9. How posts and comments are reviewed",
        ordered: true,
        items: [
          "**Blocking automatic checks** (publishing stops if one fails): verse texts, references, AI section labels, the interpretive-reading warning, size limits.",
          "**An automated review** against these guidelines runs regularly on new posts and comments, and explains each finding in your language.",
          "**Human review**: moderators have the final say. A moderator reviews each user's first post and anything the automated review is unsure about or declines; the author is told why and can edit and resubmit.",
        ],
      },
      {
        title: "10. Reports and appeals",
        items: [
          "Anyone can report a post or a comment, naming the guideline it breaks.",
          "An author can appeal a moderation decision once; another moderator reviews the appeal.",
        ],
      },
    ],
  },
};
