// i18n-ignore-file — long-form policy text, kept whole in Arabic (the reference,
// docs/community-guidelines.md) and English (for every other interface language).

export type GuidelinesSection = { title: string; items: string[]; ordered?: boolean };
export type GuidelinesText = { title: string; intro: string; note?: string; sections: GuidelinesSection[] };

export const GUIDELINES: Record<"ar" | "en", GuidelinesText> = {
  ar: {
    title: "إرشادات مجتمع «بصائر»",
    intro:
      "تنطبق على كل ما يُنشر من أبحاث وتعليقات. الغاية أن يبقى المجتمع مكاناً للتدبّر الجادّ، يُقدَّم فيه الدليل على الرأي، ويُحترم فيه القرآن والناس.",
    sections: [
      {
        title: "١. القرآن هو الدليل",
        items: [
          "**انقل الآيات بنصّها ومرجعها.** كل آية مقتبسة تُطابَق آلياً مع نص المصحف قبل النشر؛ لا يُنشر بحث فيه آية محرّفة أو منسوبة إلى غير موضعها.",
          "**لا تنسب إلى القرآن ما ليس فيه.** فرّق بوضوح بين نص الآية وفهمك لها.",
          "**لا تجتزئ الآية من سياقها** لتقرير معنى يخالف سياقها؛ اذكر ما قبلها وما بعدها حين يغيّر السياقُ المعنى.",
        ],
      },
      {
        title: "٢. الفرق بين التدبّر والفتوى",
        items: [
          "«بصائر» منصّة تدبّر وبحث، **لا منصّة فتوى**. لا تنشر أحكاماً شرعية في صيغة الإلزام («يجب»، «يحرم») على أنها نتيجة بحثك.",
          "صِف ما تقدّمه بدقّة: **تأمّل شخصي**، أو **خلاصة بحث**، أو **نقل عن عالم أو تفسير** مع ذكر المرجع.",
          "القراءة التفسيرية المولَّدة آلياً **تجريبية** وتبقى موسومة بتنبيهها؛ لا يُحذف التنبيه ولا يُخفى.",
        ],
      },
      {
        title: "٣. المحتوى المولَّد آلياً",
        items: [
          "كل قسم أنتجه «الباحث الآلي» يبقى موسوماً «جواب آلي» عند النشر، ولو عدّلتَه.",
          "أنت مسؤول عمّا تنشره: راجِع الجواب الآلي وتحقّق من الآيات قبل نشره.",
        ],
      },
      {
        title: "٤. الأدب والاحترام",
        items: [
          "ناقش الفكرة لا الشخص. لا سخرية ولا تجريح ولا تكفير ولا تبديع للأشخاص أو الجماعات.",
          "لا طعن طائفياً أو مذهبياً. الخلاف المعتبر يُعرض بإنصاف ومراجعه.",
          "لا محتوى يسيء إلى الأنبياء أو الصحابة أو أمهات المؤمنين أو إلى أيّ دين أو فئة.",
          "**لا مضايقة:** لا تلاحق أحداً بالتعليقات ولا تستهدفه، ولا تحرّض غيرك على ذلك.",
        ],
      },
      {
        title: "٥. الأمانة العلمية",
        items: [
          "انسب الأقوال إلى أصحابها، واذكر الكتاب والموضع. لا تنتحل عمل غيرك.",
          "لا أحاديث موضوعة أو منكرة تُعرض على أنها ثابتة؛ إن ذكرتَ حديثاً فاذكر درجته ومصدره.",
          "لا ادّعاءات «إعجاز» غير منضبطة تُقدَّم على أنها قطعية.",
        ],
      },
      {
        title: "٦. ما لا يُقبل",
        items: [
          "الترويج التجاري والروابط الدعائية وجمع المتابعين.",
          "المحتوى السياسي الحزبي والتحريض.",
          "مشاركة بيانات شخصية لغيرك.",
          "إغراق المجتمع بمنشورات مكرّرة.",
          "التعليقات الخارجة عن موضوع البحث المعلَّق عليه.",
        ],
      },
      {
        title: "٧. كيف تُراجَع المنشورات والتعليقات",
        ordered: true,
        items: [
          "**فحوص آلية حاسمة** (تمنع النشر إن فشلت): مطابقة نصوص الآيات، صحّة المراجع، وسم الأقسام الآلية، تنبيه القراءة التفسيرية، حدود الحجم.",
          "**مراجعة آلية** وفق هذه الإرشادات، تجري دورياً على المنشورات والتعليقات الجديدة، وتشرح سبب كل ملاحظة بلغتك.",
          "**مراجعة بشرية**: المشرفون أصحاب القرار النهائي. يراجع مشرفٌ أوّل منشور لكل مستخدم، وكل ما تتردّد فيه المراجعة الآلية أو ترفضه، ويُعلَم الكاتب بالسبب ويمكنه التعديل وإعادة الإرسال.",
        ],
      },
      {
        title: "٨. البلاغات والاعتراض",
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
      "They apply to every research and comment published. The aim is to keep the community a place for serious reflection, where evidence comes before opinion and the Quran and people are respected.",
    note: "Translated from the Arabic original, which is the reference.",
    sections: [
      {
        title: "1. The Quran is the evidence",
        items: [
          "**Quote verses with their exact text and reference.** Every quoted verse is checked automatically against the mushaf before publishing; a research with an altered or misplaced verse is not published.",
          "**Don't attribute to the Quran what it doesn't say.** Keep the verse's text clearly apart from your understanding of it.",
          "**Don't cut a verse from its context** to assert a meaning its context contradicts; give what comes before and after when the context changes the meaning.",
        ],
      },
      {
        title: "2. Reflection, not religious rulings",
        items: [
          "Basair is a place for reflection and research, **not for fatwas**. Don't publish binding rulings («must», «forbidden») as the conclusion of your research.",
          "Describe what you offer precisely: a **personal reflection**, a **research summary**, or a **quotation from a scholar or a tafsir** with its reference.",
          "AI-generated interpretive readings are **experimental** and keep their warning; the warning is never removed or hidden.",
        ],
      },
      {
        title: "3. AI-generated content",
        items: [
          "Every section produced by the research assistant stays labelled «AI answer» when published, even if you edited it.",
          "You are responsible for what you publish: review the AI answer and check its verses before publishing it.",
        ],
      },
      {
        title: "4. Courtesy and respect",
        items: [
          "Discuss the idea, not the person. No mockery, insults, or declaring people or groups unbelievers or innovators.",
          "No sectarian or partisan attacks. Recognised differences of opinion are presented fairly, with their sources.",
          "No content insulting the prophets, the Companions, the Mothers of the Believers, or any religion or group.",
          "**No harassment:** don't follow or target anyone with comments, and don't encourage others to.",
        ],
      },
      {
        title: "5. Scholarly honesty",
        items: [
          "Attribute sayings to their authors, with the book and the place. Don't pass off others' work as yours.",
          "No fabricated or rejected hadiths presented as authentic; when you cite a hadith, give its grade and source.",
          "No loose claims of scientific «miracles» presented as certain.",
        ],
      },
      {
        title: "6. Not accepted",
        items: [
          "Commercial promotion, advertising links and follower-seeking.",
          "Partisan political content and incitement.",
          "Sharing other people's personal data.",
          "Flooding the community with repeated posts.",
          "Comments off the topic of the research they're on.",
        ],
      },
      {
        title: "7. How posts and comments are reviewed",
        ordered: true,
        items: [
          "**Blocking automatic checks** (publishing stops if one fails): verse texts, references, AI section labels, the interpretive-reading warning, size limits.",
          "**An automated review** against these guidelines runs regularly on new posts and comments, and explains each finding in your language.",
          "**Human review**: moderators have the final say. A moderator reviews each user's first post and anything the automated review is unsure about or declines; the author is told why and can edit and resubmit.",
        ],
      },
      {
        title: "8. Reports and appeals",
        items: [
          "Anyone can report a post or a comment, naming the guideline it breaks.",
          "An author can appeal a moderation decision once; another moderator reviews the appeal.",
        ],
      },
    ],
  },
};
