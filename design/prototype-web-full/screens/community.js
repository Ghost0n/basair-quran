/* Community (المجتمع) and Post (المنشور): an editorial feed of published research, moderation,
   and the post page typeset like a paper with its comments. World: community (copper marks).
   Seeds QB.state.posts / QB.state.reports when absent; other screens may push posts in. */
(() => {
  const { n, esc } = QB;

  /* ---------------- Helpers ---------------- */
  // Verse text for any reference: the loaded pages first, then the root search lists.
  let vmap = null;
  const vtext = (s, a) => {
    const v = QB.ayah(s, a);
    if (v) return v.text;
    if (!vmap) { vmap = {}; QB.searchRoots().forEach((r) => ((QB.search(r) || {}).verses || []).forEach((x) => { vmap[`${x.s}:${x.a}`] = x.text; })); }
    return vmap[`${s}:${a}`] || quoted[`${s}:${a}`] || '';
  };
  const parse = (ref) => { if (typeof ref === 'object') return { s: +ref.s, a: +ref.a }; const [s, a] = String(ref).split(':').map(Number); return { s, a }; };
  const refName = (r) => `${QB.surah(r.s).name}: ${n(r.a)}`;
  const strip = (x) => QB.strip(String(x || '')).toLowerCase();
  const tx = (s) => n(esc(s));   // escape + numerals per setting (seed text is written with Latin digits)
  // Arabic counted nouns: [one, two, three-to-ten, eleven-plus]
  const pl = (k, f) => (k === 1 ? f[0] : k === 2 ? f[1] : `${n(k)} ${k % 100 >= 3 && k % 100 <= 10 ? f[2] : f[3]}`);
  const W = {
    ayah: ['آية واحدة', 'آيتان', 'آيات', 'آية'],
    post: ['منشور واحد', 'منشورين', 'منشورات', 'منشوراً'],
    postN: ['منشور واحد', 'منشوران', 'منشورات', 'منشوراً'],
    comment: ['تعليق واحد', 'تعليقان', 'تعليقات', 'تعليقاً'],
    surah: ['سورة واحدة', 'سورتين', 'سور', 'سورة'],
    section: ['قسم واحد', 'قسمان', 'أقسام', 'قسماً'],
  };
  const qt = (t) => (/^«.*»$/.test(t.trim()) ? tx(t) : `«${tx(t)}»`);
  const initial = (name) => (String(name || 'ب').trim()[0] || 'ب');
  const me = () => (QB.state.user && QB.state.user.name) || '';
  const isAdmin = () => QB.signedIn() && QB.state.user.role === 'admin';
  const guestToast = () => QB.toast('سجّل الدخول لتتفاعل مع المجتمع.');
  const LOADED = 'هذه الآية خارج الصفحات المحمّلة في النموذج (١، ٢، ٤٩٩–٥٠١).';
  const openVerse = (s, a) => { if (QB.pageOf(s, a)) QB.go('reader', { s, a }); else QB.toast(LOADED); };
  const TAFSIR = 'تنبيه — ما يَلي قراءة تفسيرية بشرية مُولَّدة من نموذج لغوي. ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم. الدليل الوحيد المُعتَمَد هنا هو القرآن الكريم.';
  const STATUS = { published: ['منشور', 'ok'], review: ['قيد المراجعة', 'warn'], changes: ['مطلوب تعديل', 'warn'], rejected: ['مرفوض', 'bad'], withdrawn: ['مسحوب', 'mute'], removed: ['أُزيل', 'bad'] };
  const REASONS = ['نسبة إلى القرآن ما ليس فيه', 'حكم شرعي بلا مرجع', 'إساءة أو تجريح', 'طعن طائفي', 'أمانة علمية', 'ترويج أو إغراق', 'بيانات شخصية', 'سبب آخر'];
  const RULES = [
    ['القرآن هو الدليل', 'انقل الآيات بنصّها ومرجعها، ولا تنسب إلى القرآن ما ليس فيه.'],
    ['تدبّر لا فتوى', 'صِف ما تقدّمه بدقّة: تأمّل، أو خلاصة بحث، أو نقل موثّق؛ لا حكم في صيغة الإلزام.'],
    ['المحتوى الآلي موسوم', 'ما أنتجه الباحث الآلي يبقى موسوماً «جواب آلي»، وأنت مسؤول عن مراجعته.'],
    ['الأدب والإنصاف', 'ناقش الفكرة لا الشخص، واعرض الخلاف المعتبر بإنصاف ومراجعه.'],
    ['الأمانة العلمية', 'انسب الأقوال إلى أصحابها، ولا تقدّم إعجازاً غير منضبط على أنه قطعي.'],
  ];
  const share = (id) => {
    const url = `https://basair.app/?mode=post&id=${id}`;
    try { const pr = navigator.clipboard && navigator.clipboard.writeText(url); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* clipboard blocked: the toast still confirms in the prototype */ }
    QB.toast('نُسخ رابط المنشور.');
  };

  /* ---------------- Seed ---------------- */
  const sp = QB.search('بصر') || { total: 148, surahs: 62 };
  const T = (kind, a, b, c) => {
    // T('text', title?, body) · T('ayat', title?, refs[]) · T('note'|'question'|'ai', title?, body, refs?)
    if (kind === 'ayat') return { kind, title: b ? a : '', refs: b || a };
    return { kind, title: b !== undefined ? a : '', body: b !== undefined ? b : a, refs: c || [] };
  };
  const C = (by, at, text, extra) => Object.assign({ id: QB.uid('c'), by, at, text }, extra || {});
  const SEED = [
    { id: 'p1', by: 'مريم', at: '2026-10-18', title: '«البصائر» بين الأنعام والجاثية', mode: 'strict', likes: 24, liked: true,
      summary: 'تتكرّر «بصائر» جمعاً في ثلاثة مواضع تصف الوحي نفسه. أتتبّع ما يقترن بها في كل موضع: الهدى والرحمة، ثم من يُخاطَب بها: «لقوم يؤمنون» و«لقوم يوقنون».',
      tags: ['البصيرة', 'بصر', 'الجاثية'], quote: '45:20',
      board: { name: 'من البصر إلى البصيرة', rels: ['يؤكّد', 'يؤكّد', 'يقابل', 'مثال'], note: 'البصائر وصف للوحي لا للعين' },
      sections: [
        T('text', 'المدخل', `يرد جذر «ب ص ر» ${sp.total} موضعاً في ${sp.surahs} سورة، أكثرها في الإبصار الحسّي. لكن صيغة الجمع «بصائر» تنفرد بوصف ما جاء من الله: حججاً يُبصَر بها الطريق.`),
        T('ayat', 'ثلاثة مواضع للجمع', ['6:104', '7:203', '45:20']),
        T('text', 'ما يقترن بالبصائر', 'في الأعراف والجاثية تأتي «بصائر» مع «هدى ورحمة»، فكأنها ثلاث مراتب: ما يُبصَر به، ثم ما يُهتدى به، ثم ما يُرحم به. ويختلف المخاطَب: «لقوم يؤمنون» في الأعراف، و«لقوم يوقنون» في الجاثية، واليقين أخصّ.'),
        T('ayat', 'والبصيرة في الدعوة', ['12:108']),
        T('note', 'لم أجد في السياقات الثلاثة ما يجعل «بصائر» وصفاً للقلب؛ هي وصف للوحي، والإبصار فعل المخاطَب: «فمن أبصر فلنفسه».'),
        T('question', 'هل يصحّ أن نقرأ «على بصيرة» في يوسف 108 امتداداً لهذا المعنى، أي دعوة قائمة على تلك البصائر؟'),
      ],
      refs: [{ type: 'آية', name: 'الأنعام 104', loc: 'الجزء 7' }, { type: 'كتاب', name: 'المفردات في غريب القرآن، الراغب الأصفهاني', loc: 'مادة «بصر»' }],
      comments: [
        C('يوسف', '2026-10-18', 'ملاحظة دقيقة في الفرق بين «يؤمنون» و«يوقنون». هل ترين أن سياق الجاثية، وهي تكرّر «لقوم يوقنون» في مطلعها أيضاً، يفسّر اختيار اليقين هنا؟'),
        C('مريم', '2026-10-19', 'نعم، الآية الرابعة من الجاثية تقول «آيات لقوم يوقنون»، فالسورة تبني على اليقين من أولها. أضفتها إلى اللوحة.'),
        C('عائشة', '2026-10-19', 'أقترح إضافة الأنعام 50: «قل هل يستوي الأعمى والبصير»، فهي في السورة نفسها قبل موضع البصائر.'),
        C('المشرف', '2026-10-20', 'بحث نافع. البصائر في الأنعام تأتي بعد ذكر إدراك الأبصار في الآية 103، والتقابل بينهما لافت.', { mine: true }),
        C('عبد الله', '2026-10-20', 'هل للفرق بين «بصائر للناس» في الجاثية و«بصائر من ربكم» في الأنعام دلالة؟ الأولى بالمخاطَب والثانية بالمصدر.'),
        C('ليلى', '2026-10-20', 'سؤال عبد الله جميل. لعلّ الموضعين يكمل أحدهما الآخر: مصدرها من الله، ووجهتها الناس.'),
        C('حمزة', '2026-10-21', 'شكراً على التنبيه إلى أن الإبصار فعل المخاطَب؛ هذا يربط البحث بآية يوسف ربطاً حسناً.'),
      ] },
    { id: 'p2', by: 'المشرف', mine: true, docId: 'd2', at: '2026-10-18', title: 'بنو إسرائيل: النعمة والاختلاف', mode: 'strict', likes: 11,
      summary: 'تجمع الجاثية في آيتين ما تفصّله البقرة: نعمة الكتاب والحكم والنبوّة، ثم اختلاف «من بعد ما جاءهم العلم بغياً بينهم». أقرأ الموضعين معاً.',
      tags: ['بنو إسرائيل', 'النعمة', 'الاختلاف'], quote: '45:17',
      sections: [
        T('text', 'السؤال', 'من هم بنو إسرائيل في القرآن، وما الذي يجمع ذكرهم في الجاثية والبقرة؟ بدأ البحث من جلسة دراسة، ثم صار بحثاً يجمع الآيات حول محورين: النعمة، والاختلاف.'),
        T('ayat', 'النعمة', ['45:16', '2:47']),
        T('text', 'تعدّد الجاثية النعمة: الكتاب والحكم والنبوّة والطيّبات والتفضيل على العالمين، والبقرة تأمر بذكرها: «اذكروا نعمتي». فالذكر هنا مسؤولية تقابل النعمة.'),
        T('ayat', 'الاختلاف بعد العلم', ['45:17', '2:213']),
        T('text', 'يتكرّر في الموضعين أن الاختلاف جاء «من بعد» البيّنات والعلم، وأن سببه «بغياً بينهم». فالمشكلة ليست في نقص العلم بل في البغي.'),
        T('ai', 'ربط الآيات', 'تتّصل آية البقرة 83 بالمحورين: ميثاق يقوم على العبادة والإحسان، ثم «توليتم إلا قليلاً منكم». الميثاق نعمة، والتولّي عنه صورة من صور الاختلاف.', ['2:83']),
      ],
      refs: [{ type: 'آية', name: 'الجاثية 16–17', loc: '' }, { type: 'تفسير', name: 'جلسة الدراسة: من هم بنو إسرائيل في القرآن؟', loc: '4 رسائل' }],
      comments: [
        C('خديجة', '2026-10-19', 'ربط حسن بين «من بعد ما جاءهم العلم» في الموضعين. هل تتبّعت العبارة في آل عمران أيضاً؟'),
        C('المشرف', '2026-10-19', 'لم أفعل بعد؛ سأضيفها في الإصدار القادم من البحث.', { mine: true }),
        C('عمر', '2026-10-20', 'أعجبني التنبيه على أن الذكر مسؤولية تقابل النعمة.'),
      ] },
    { id: 'p3', by: 'يوسف', at: '2026-10-12', title: 'الصبر والصلاة: قرينان في البقرة', mode: 'strict', likes: 31, saved: true,
      summary: 'يأمر الخطاب مرتين بالاستعانة «بالصبر والصلاة»، مرة لبني إسرائيل ومرة للذين آمنوا. ما الذي يتغيّر بين الموضعين، ولماذا يتقدّم الصبر؟',
      tags: ['الصبر', 'الصلاة', 'البقرة'], quote: '2:153',
      sections: [
        T('ayat', 'الموضعان', ['2:45', '2:153']),
        T('text', 'بين الموضعين', 'في الأولى «وإنها لكبيرة إلا على الخاشعين»، وفي الثانية «إن الله مع الصابرين». الأولى تصف ثقل الأمر، والثانية تعد بالمعيّة. ويتقدّم الصبر في الموضعين.'),
        T('ayat', 'ثم يأتي الابتلاء', ['2:155', '2:177']),
        T('note', 'تعقب الآيةُ 155 الآيةَ 153 بآية واحدة؛ فالأمر بالاستعانة يسبق ذكر الابتلاء. وفي آية البرّ يرد الصبر «في البأساء والضراء وحين البأس».'),
        T('ayat', 'دعاء الصبر', ['2:250']),
      ],
      refs: [{ type: 'آية', name: 'البقرة 45، 153', loc: '' }],
      comments: [
        C('مريم', '2026-10-13', 'ترتيب جميل: الأمر ثم الابتلاء ثم الدعاء. كأن السورة تعلّم الصبر على مراحل.'),
        C('حمزة', '2026-10-14', 'هل لاحظت أن «الخاشعين» في الأولى يقابلها «الصابرين» في الثانية؟'),
        C('يوسف', '2026-10-14', 'نعم، وهذا ما دفعني إلى السؤال عن تقدّم الصبر. سأضيف الملاحظة.'),
        C('زينب', '2026-10-16', 'يمكن ضمّ آل عمران 200 «اصبروا وصابروا ورابطوا» إلى البحث.'),
      ] },
    { id: 'p4', by: 'عائشة', at: '2026-10-15', title: '«ختم الله على قلوبهم»: القلب والسمع والبصر', mode: 'tafsir', likes: 19,
      summary: 'قراءة في اقتران القلب بالسمع والبصر: يُختم على القلب والسمع، وتكون الغشاوة على البصر. كيف تعود هذه الثلاثية في الأعراف؟',
      tags: ['القلب', 'بصر', 'الإدراك'], quote: '2:7',
      board: { name: 'أدوات الإدراك', rels: ['يؤكّد', 'يقابل', 'مثال', 'مثال'], note: 'الختم للقلب والسمع، والغشاوة للبصر' },
      sections: [
        T('ai', 'الخلاصة', 'تجمع البقرة 7 ثلاث أدوات للإدراك وتفرّق في وصفها: الختم يقع على القلوب والسمع، والغشاوة على الأبصار. وتعود الأعراف 179 إلى الأدوات نفسها لتصف من عطّلها.'),
        T('ayat', 'التحليل اللغوي', ['2:7', '7:179']),
        T('ai', 'ربط الآيات', 'في البقرة 10 يصير القلب موضع «مرض» يزداد، وفي البقرة 74 موضع «قسوة» تُشبَّه بالحجارة؛ فالقلب في هذه السياقات متغيّر الحال، لا عضو ثابت.', ['2:10', '2:74']),
        T('text', 'الرؤية المستفادة', 'ما يلفت أن آية الأعراف لا تنفي وجود الأدوات: «لهم قلوب… ولهم أعين… ولهم آذان»، بل تنفي استعمالها. المسؤولية في الاستعمال.'),
        T('note', 'حدود القراءة', 'هذه قراءة تفسيرية تجريبية لا تُغني عن كتب التفسير. وللوقف على «سمعهم» أثر في توزيع الختم والغشاوة لم أتتبّعه بعد.'),
      ],
      refs: [{ type: 'تفسير', name: 'جلسة دراسة بالقراءة التفسيرية', loc: 'عمق متوازن' }, { type: 'كتاب', name: 'التحرير والتنوير، ابن عاشور', loc: 'تفسير البقرة 7' }],
      comments: [
        C('يوسف', '2026-10-16', 'ملاحظة الوقف على «سمعهم» مهمة، فهي تغيّر توزيع الختم والغشاوة.'),
        C('أبو فهد', '2026-10-19', 'هذا كلام من لا يعرف العربية، الأولى أن تتعلّمي قبل أن تكتبي.', { id: 'c4x' }),
        C('ليلى', '2026-10-20', 'أتفق مع الرؤية المستفادة: الأدوات موجودة، والتعطيل هو المشكلة.'),
        C('عائشة', '2026-10-20', 'شكراً يا يوسف، أضفت تنبيهاً على الوقف في «حدود القراءة».'),
      ] },
    { id: 'p5', by: 'عبد الله', at: '2026-10-09', title: 'الهدى من الفاتحة إلى البقرة: من الدعاء إلى الجواب', mode: 'strict', likes: 27,
      summary: 'يدعو المصلّي في الفاتحة «اهدنا الصراط المستقيم»، فتبدأ البقرة بـ«هدى للمتقين». أقرأ مطلع البقرة جواباً عن دعاء الفاتحة.',
      tags: ['الهداية', 'الفاتحة', 'البقرة'], quote: '2:2',
      board: { name: 'الدعاء والجواب', rels: ['يفسّر', 'يؤكّد', 'سبب ← نتيجة', 'يتكرّر في'], note: 'الهدى يُطلب ثم يُعطى ثم يُتّبع' },
      sections: [
        T('ayat', 'الدعاء', ['1:6']),
        T('ayat', 'الجواب', ['2:2', '2:5']),
        T('text', 'في الفاتحة يُطلب الهدى، وفي البقرة يُوصف الكتاب بأنه «هدى»، ثم يُوصف أهله بأنهم «على هدى من ربهم». ثلاث درجات: طلب، ثم مصدر، ثم حال.'),
        T('ayat', 'الهدى عهد قديم', ['2:38']),
        T('question', 'هل «فإما يأتينكم مني هدى» في قصة آدم أصلٌ لهذا كله، والكتاب إحدى صور ذلك الهدى؟'),
      ],
      refs: [{ type: 'آية', name: 'الفاتحة 6', loc: '' }, { type: 'آية', name: 'البقرة 2، 5، 38', loc: '' }],
      comments: [
        C('خديجة', '2026-10-10', 'قراءة مطلع البقرة جواباً عن الفاتحة قال بها بعض المفسّرين؛ لو ذكرت من قال بها لكان أوثق.'),
        C('عبد الله', '2026-10-10', 'صدقتِ، سأضيف المرجع في قسم المراجع.'),
        C('عمر', '2026-10-12', 'سؤال آية آدم جميل. «فمن تبع هداي» تربط الهدى بالاتّباع.'),
      ] },
    { id: 'p6', by: 'ليلى', at: '2026-10-19', title: 'الرحمة في سياق التوبة', mode: 'strict', likes: 16,
      summary: 'يقترن «التوّاب» بـ«الرحيم» في توبة آدم وتوبة قوم موسى. أتتبّع هذا الاقتران، ثم الرحمة التي «لِنتَ» بها للناس في آل عمران.',
      tags: ['الرحمة', 'التوبة'], quote: '2:37',
      sections: [
        T('ayat', 'البسملة', ['1:1']),
        T('ayat', 'التوّاب الرحيم', ['2:37', '2:54']),
        T('text', 'يُختم الموضعان بالعبارة نفسها: «إنه هو التوّاب الرحيم». في الأول توبة فرد بكلمات تلقّاها، وفي الثاني توبة قوم بعد اتّخاذ العجل. الرحمة واحدة والحال مختلفة.'),
        T('ayat', 'رحمة تصير خُلُقاً', ['3:159']),
        T('note', 'في آل عمران 159 تنتقل الرحمة من صفة لله إلى أثر في خُلُق النبي ﷺ مع الناس: «فبما رحمة من الله لنت لهم».'),
      ],
      refs: [{ type: 'آية', name: 'البقرة 37، 54', loc: '' }],
      comments: [
        C('مريم', '2026-10-19', 'ربط آية آل عمران بالموضعين يفتح باباً: الرحمة تُتلقّى ثم تُعطى.'),
        C('حمزة', '2026-10-20', 'هل تتبّعتِ «التوّاب الرحيم» في بقية المصحف؟ لعلّ الإحصاء يضيف إلى البحث.'),
        C('ليلى', '2026-10-20', 'فكرة جيدة، سأجرّب مواضع الجذر في لوحة المطابقة.'),
      ] },
    { id: 'p7', by: 'حمزة', at: '2026-10-20', title: 'النور والظلمات: مثل الذي استوقد ناراً', mode: 'tafsir', likes: 22,
      summary: 'قراءة في مثل المنافقين: نار تُضيء ثم يذهب الله بنورهم. أقابلها بآيات «يخرجهم من الظلمات إلى النور».',
      tags: ['النور', 'الأمثال', 'بصر'], quote: '2:17',
      board: { name: 'من الظلمات إلى النور', rels: ['يقابل', 'يؤكّد', 'يؤكّد', 'مثال'], note: 'النار تُضيء، والنور يهدي' },
      sections: [
        T('ayat', 'المثل', ['2:17']),
        T('ai', 'التحليل اللغوي', 'قال «ذهب الله بنورهم» ولم يقل بنارهم؛ فالذي ذهب هو النور الذي يُهتدى به، وبقيت الظلمات «لا يبصرون». والظلمات جمع والنور مفرد في أكثر المواضع.'),
        T('ayat', 'ربط الآيات', ['2:257', '5:15', '5:16']),
        T('ai', 'حدود القراءة', 'ملاحظة الإفراد والجمع مشهورة لكنها ليست مطّردة في كل مثل، وتحتاج إلى تتبّع أوسع قبل البناء عليها.'),
      ],
      refs: [{ type: 'تفسير', name: 'جلسة دراسة بالقراءة التفسيرية', loc: 'عمق عميق' }],
      comments: [
        C('عائشة', '2026-10-20', 'التنبيه على «بنورهم» لا «بنارهم» دقيق جداً.'),
        C('عمر', '2026-10-21', 'أظن أن القسم الثاني يحمّل آية البقرة 17 أكثر مما يحتمل سياقها؛ المثل عن المنافقين تحديداً.'),
        C('حمزة', '2026-10-21', 'ملاحظة في محلها يا عمر، ولهذا وضعت «حدود القراءة». سأوضّح أن المثل خاص بسياقه.'),
        C('زينب', '2026-10-21', 'مجيء الآية 257 بعد آية الكرسي بآيتين يجعل المقابلة أوضح.'),
      ] },
    { id: 'p8', by: 'خديجة', at: '2026-10-05', title: 'العلم الذي عُلِّمه آدم', mode: 'strict', likes: 14,
      summary: 'في أربع آيات متتالية من البقرة يتكرّر الجذر «ع ل م» بصيغ مختلفة: «أعلم ما لا تعلمون»، «وعلّم آدم»، «لا علم لنا إلا ما علّمتنا». ما الذي يقوله هذا التتابع عن الاستخلاف؟',
      tags: ['العلم', 'آدم', 'الاستخلاف'], quote: '2:32',
      sections: [
        T('ayat', 'السؤال عن الخليفة', ['2:30']),
        T('text', 'تبدأ القصة بسؤال الملائكة عن الخليفة، ويأتي الجواب علماً: «إني أعلم ما لا تعلمون». ثم يُعلَّم آدم الأسماء، فيصير العلم ما يميّز الخليفة.'),
        T('ayat', 'التعليم والإنباء', ['2:31', '2:32', '2:33']),
        T('note', 'الملائكة تنسب العلم إلى الله: «إنك أنت العليم الحكيم»، والآية التالية تختم بـ«وأعلم ما تبدون وما كنتم تكتمون». يبدأ المقطع بالعلم وينتهي به.'),
      ],
      refs: [{ type: 'آية', name: 'البقرة 30–33', loc: '' }],
      comments: [
        C('يوسف', '2026-10-06', 'تتبّع الجذر داخل مقطع واحد طريقة جميلة. هل جرّبت الإحصاء من أداة التحديد؟'),
        C('خديجة', '2026-10-07', 'نعم، أحصيت 8 مواضع في الآيات الأربع، وسأضيف الجدول.'),
      ] },
    { id: 'p9', by: 'عمر', at: '2026-10-21', title: 'اليقين في الجاثية: «لقوم يوقنون»', mode: 'strict', likes: 9,
      summary: 'تخاطب الجاثية «قوماً يوقنون» في مطلعها وفي آية البصائر، ثم تحكي في ختامها قول من قالوا «وما نحن بمستيقنين». أقرأ السورة بين يقين وظنّ.',
      tags: ['اليقين', 'الجاثية'], quote: '45:4',
      sections: [
        T('ayat', 'اليقين في مطلع السورة وفي آية البصائر', ['45:4', '45:20']),
        T('text', 'يأتي اليقين في مطلع السورة مع آيات الخلق، ويعود في آية البصائر. ثم يأتي الختام بنقيضه: «إن نظن إلا ظناً وما نحن بمستيقنين».'),
        T('ayat', 'الظنّ', ['45:32']),
        T('ayat', 'اليقين في غير الجاثية', ['2:4', '15:99']),
      ],
      refs: [{ type: 'آية', name: 'الجاثية 4، 20، 32', loc: '' }],
      comments: [
        C('مريم', '2026-10-21', 'قراءة السورة بين اليقين والظنّ تتّصل ببحثي عن البصائر. سأشير إليها.'),
        C('عبد الله', '2026-10-21', 'آية الحجر في ختام البحث مناسبة جداً.'),
      ] },
    { id: 'p10', by: 'سارة', at: '2026-09-28', title: '«فصبر جميل»: صبر يعقوب وصبر يوسف', mode: 'tafsir', likes: 35, saved: true,
      summary: 'تتكرّر «فصبر جميل» على لسان يعقوب مرتين، في أول المحنة وفي آخرها، ثم يقول يوسف «إنه من يتّق ويصبر». قراءة في الصبر عبر القصة.',
      tags: ['الصبر', 'يوسف', 'القصص'], quote: '12:18',
      sections: [
        T('ayat', 'الموضعان', ['12:18', '12:83']),
        T('ai', 'التحليل اللغوي', '«فصبر جميل» جملة حُذف أحد ركنيها، فكأن الصبر حال ثابتة لا فعل طارئ. وتأتي في الموضعين بعد «بل سوّلت لكم أنفسكم أمراً».'),
        T('ayat', 'الصبر في خاتمة القصة', ['12:90']),
        T('ai', 'الرؤية المستفادة', 'يبدأ الصبر في القصة من الأب ويُختم على لسان الابن، فالقصة تورّث الصبر جيلاً بعد جيل.'),
        T('note', 'حدود القراءة', 'في إعراب «فصبر جميل» وجهان منقولان، ولم أرجّح بينهما.'),
      ],
      refs: [{ type: 'كتاب', name: 'إعراب القرآن وبيانه، محيي الدين درويش', loc: 'سورة يوسف' }],
      comments: [
        C('يوسف', '2026-09-29', 'تكرار العبارة نفسها في أول المحنة وآخرها لافت، كأن الصبر لم يتغيّر مع طول الزمن.'),
        C('عائشة', '2026-09-30', 'أحسنتِ في ذكر الوجهين دون ترجيح.'),
        C('خديجة', '2026-10-02', 'في الموضع الثاني زاد «عسى الله أن يأتيني بهم جميعاً»؛ الصبر صار رجاءً.'),
        C('سارة', '2026-10-02', 'ملاحظة جميلة يا خديجة، سأضيفها إلى الرؤية المستفادة.'),
        C('حمزة', '2026-10-04', 'بحث هادئ ونافع، جزاكِ الله خيراً.'),
      ] },
    { id: 'p11', by: 'زينب', at: '2026-10-16', title: 'آيات لقوم يعقلون: التدرّج في مطلع الجاثية', mode: 'strict', likes: 12,
      summary: 'يتدرّج مطلع الجاثية في خواتيم آياته: «للمؤمنين»، ثم «لقوم يوقنون»، ثم «لقوم يعقلون»، ثم «لقوم يتفكّرون». لوحة تربط الآيات الأربع.',
      tags: ['الجاثية', 'الآيات', 'التفكّر'], quote: '45:5',
      board: { name: 'خواتيم مطلع الجاثية', rels: ['يتكرّر في', 'يتكرّر في', 'يتكرّر في', 'يؤكّد'], note: 'إيمان، يقين، عقل، تفكّر' },
      sections: [
        T('ayat', 'ثلاث خواتيم متتالية', ['45:3', '45:4', '45:5']),
        T('text', 'تنتقل الخواتيم من الإيمان إلى اليقين إلى العقل، وكل آية تذكر مجالاً أوسع: السماوات والأرض، ثم الخلق والدوابّ، ثم الليل والنهار والمطر والرياح.'),
        T('ayat', 'والتفكّر', ['45:13']),
        T('question', 'هل التدرّج مقصود ترتيباً، أم أن كل خاتمة تناسب ما في آيتها فحسب؟'),
      ],
      refs: [{ type: 'آية', name: 'الجاثية 3–5، 13', loc: '' }],
      comments: [
        C('عمر', '2026-10-17', 'هذا يتّصل ببحثي عن اليقين في الجاثية. التدرّج واضح جداً.'),
        C('مريم', '2026-10-18', 'السؤال في الخاتمة منصف؛ لا يلزم أن يكون التدرّج ترتيباً.'),
        C('زينب', '2026-10-18', 'شكراً لكما، أضفت الآية 13 لأنها تكمل الخواتيم بالتفكّر.'),
      ] },
    // Mine, not yet in the feed
    { id: 'p12', by: 'المشرف', mine: true, at: '2026-10-21', status: 'review', title: 'السمع والبصر والفؤاد: أدوات المسؤولية', mode: 'strict', likes: 0,
      summary: '«إن السمع والبصر والفؤاد كل أولئك كان عنه مسؤولاً». أتتبّع الثلاثية من الخلق «لا تعلمون شيئاً» إلى المساءلة.',
      tags: ['بصر', 'المسؤولية', 'العلم'], quote: '17:36',
      sections: [
        T('ayat', 'النعمة ثم السؤال', ['16:78', '17:36']),
        T('text', 'في النحل يُخرَج الإنسان «لا يعلم شيئاً» ثم تُجعل له الأدوات «لعلكم تشكرون»، وفي الإسراء تُذكر الأدوات نفسها موضعاً للسؤال. بين الآيتين: نعمة ثم مسؤولية.'),
        T('ayat', 'حين تُعطَّل الأدوات', ['2:7']),
      ],
      refs: [{ type: 'آية', name: 'النحل 78، الإسراء 36', loc: '' }], comments: [] },
    { id: 'p13', by: 'المشرف', mine: true, at: '2026-10-14', status: 'changes', vis: 'link', title: 'الهدى والرحمة لقوم يوقنون', mode: 'tafsir', likes: 0,
      modNote: 'القسم الثالث يقدّم حكماً بصيغة «يجب» دون مرجع؛ صِغه تأمّلاً أو اذكر مصدره، ثم أعد الإرسال.',
      summary: 'قراءة في اقتران الهدى والرحمة في آيتي الأعراف والجاثية، ومن يُخاطَب بهما.',
      tags: ['الهداية', 'الرحمة', 'اليقين'], quote: '7:203',
      sections: [
        T('ayat', 'الموضعان', ['7:203', '45:20']),
        T('ai', 'الخلاصة', 'يقترن الهدى بالرحمة في الموضعين بعد ذكر البصائر، ويختلف المخاطَب بين الإيمان واليقين.'),
        T('text', 'ما يلزم القارئ', 'يجب على من قرأ هاتين الآيتين أن يجعل القرآن مصدره الوحيد للهدى.'),
      ],
      refs: [], comments: [] },
    // Moderation queue (others, first posts or flagged by the automatic review)
    { id: 'q1', by: 'رامي', at: '2026-10-21', status: 'review', title: 'الإعجاز العددي في تكرار لفظ «البصر»', mode: 'strict', likes: 0,
      summary: 'يرد لفظ البصر في القرآن 140 مرة، وهذا العدد دليل قاطع على إعجاز لا يقبل الشك. وفي آخر البحث رابط لدورة كاملة في الإعجاز العددي.',
      tags: ['بصر', 'الإعجاز'], quote: '17:36',
      sections: [T('text', 'يرد لفظ البصر في القرآن 140 مرة، وهذا العدد دليل قاطع على إعجاز لا يقبل الشك.'), T('ayat', ['17:36'])],
      audit: { verdict: 'reject', reason: 'ادّعاء إعجاز يُقدَّم قطعياً، وعدد لا يطابق المصحف، ورابط دعائي في الخاتمة.',
        suggestions: [`العدد المذكور (140) لا يطابق إحصاء المصحف: ${sp.total} موضعاً للجذر «ب ص ر» في ${sp.surahs} سورة.`, 'يقدّم الإحصاء دليلاً «قاطعاً»؛ الإرشادات تطلب ألّا تُقدَّم ادّعاءات الإعجاز غير المنضبطة على أنها قطعية (الأمانة العلمية).', 'الرابط في الخاتمة ترويج لدورة مدفوعة (ما لا يُقبل).'] },
      refs: [], comments: [] },
    { id: 'q2', by: 'هند', at: '2026-10-20', status: 'review', title: 'متى يكون الصبر واجباً؟ قراءة في آيات الصبر', mode: 'tafsir', likes: 0,
      summary: 'قراءة في آيات الصبر في البقرة، تنتهي بخلاصة في ما يجب على المؤمن عند الابتلاء.',
      tags: ['الصبر', 'الابتلاء'], quote: '2:155',
      sections: [T('ayat', ['2:155', '2:177']), T('ai', 'الخلاصة', 'يجب على المؤمن عند المصيبة أن يصبر ولا يجزع، ومن جزع فقد خالف أمر الله.')],
      audit: { verdict: 'human', reason: 'صيغة إلزام في الخلاصة قد تُفهم فتوى، وهو أول منشور للكاتبة.',
        suggestions: ['قسم «الخلاصة» يقرّر حكماً بصيغة «يجب» دون مرجع؛ تحقّق أهو نقل موثّق أم رأي الكاتبة (تدبّر لا فتوى).', 'تنبيه القراءة التفسيرية حاضر وموسوم كما ينبغي.', 'أول منشور لهذه الكاتبة؛ يراجعه مشرف قبل ظهوره (الإرشاد 7).'] },
      refs: [], comments: [] },
  ];
  const norm = (p) => {
    // Posts pushed by other screens may carry fewer fields: fill the rest.
    p.id = p.id || QB.uid('p');
    if (p.mine == null) p.mine = !!(p.docId && (QB.state.documents || []).some((d) => d.id === p.docId)) || (!p.by && QB.signedIn());
    p.by = p.author || p.by || (p.mine ? me() : 'باحث');
    p.at = p.at || QB.today.toISOString();
    p.status = p.status || 'published';
    p.vis = p.visibility || p.vis || 'public';
    if (p.vis === 'link-only' || p.vis === 'unlisted') p.vis = 'link';
    p.mode = p.mode || 'strict';
    if (p.board === true || (p.board && typeof p.board !== 'object')) {
      // Document publishing sets board: true when the research came from a board.
      const doc = (QB.state.documents || []).find((d) => d.id === p.docId);
      const bd = doc && (QB.state.boards || []).find((b) => b.id === doc.boardId);
      p.board = { name: (bd && bd.name) || 'لوحة الموضوع', rels: [], note: '' };
    } else if (!p.board) p.board = null;
    p.tags = p.tags || [];
    p.likes = p.likes || 0;
    p.comments = p.comments || [];
    p.refs = p.refs || [];
    p.sections = p.sections || [];
    p.summary = p.summary || '';
    return p;
  };
  const seed = () => {
    if (!Array.isArray(QB.state.posts)) QB.state.posts = [];
    const have = new Set(QB.state.posts.map((p) => p.id));
    SEED.forEach((p) => { if (!have.has(p.id)) QB.state.posts.push(p); });
    if (!Array.isArray(QB.state.reports)) QB.state.reports = [
      { id: 'r1', postId: 'p4', commentId: 'c4x', rule: 'إساءة أو تجريح', detail: 'يهاجم الكاتبة بدل مناقشة الفكرة.', by: 'ليلى', at: '2026-10-20', open: true },
      { id: 'r2', postId: 'p7', rule: 'نسبة إلى القرآن ما ليس فيه', detail: 'القسم الثاني يحمّل آية البقرة 17 معنى أوسع من سياقها.', by: 'عمر', at: '2026-10-21', open: true },
    ];
  };
  seed();
  const posts = () => QB.state.posts.map(norm);
  // A post linked to a research document (docId) shows that document's sections and references
  // (shape from screens/document.js: kinds text/ayat/note/question/machine, verses [{s,a,text}]).
  // Seeded body text is the fallback while the document has no sections yet.
  const docOf = (p) => (p.docId ? (QB.state.documents || []).find((d) => d.id === p.docId) : null);
  const REFT = { book: 'كتاب', tafsir: 'تفسير', ayah: 'آية', link: 'رابط' };
  const quoted = {};   // 's:a' → quoted text from a document, used only when the verse is not in the loaded data
  const secsOf = (p) => {
    const doc = docOf(p);
    if (!doc || !Array.isArray(doc.sections) || !doc.sections.length) return p.sections;
    return doc.sections.map((x) => ({
      kind: x.kind === 'machine' ? 'ai' : x.kind || 'text',
      title: x.title || '', body: x.body || '',
      refs: (x.verses || x.refs || []).map((v) => { if (typeof v !== 'object') return v; if (v.text) quoted[`${v.s}:${v.a}`] = v.text; return `${v.s}:${v.a}`; }),
    }));
  };
  const refsOf = (p) => {
    const doc = docOf(p);
    if (!doc || !Array.isArray(doc.refs) || !Array.isArray(doc.sections) || !doc.sections.length) return p.refs;
    return doc.refs.map((r) => ({ type: REFT[r.type] || r.type || 'كتاب', name: r.name || '', loc: r.locus || r.loc || '' }));
  };
  const post = (id) => posts().find((p) => p.id === id) || null;

  const verses = (p) => { const out = [], seen = new Set(); const ss = secsOf(p); if (!ss.length && Array.isArray(p.verses)) return p.verses.map(parse); ss.forEach((s) => (s.refs || []).forEach((r) => { const k = typeof r === 'object' ? `${r.s}:${r.a}` : r; if (!seen.has(k)) { seen.add(k); out.push(parse(k)); } })); return out; };
  const readMin = (p) => Math.max(2, Math.round((p.summary + secsOf(p).map((s) => (s.body || '') + (s.refs || []).map((r) => { const v = parse(r); return vtext(v.s, v.a); }).join(' ')).join(' ')).split(/\s+/).length / 110));
  const days = (iso) => Math.max(0, Math.round((QB.today - new Date(iso)) / 86400000));
  const visibleComments = (p) => p.comments.filter((c) => !c.hidden);
  const score = (p) => p.likes + 2 * visibleComments(p).length + Math.max(0, 14 - days(p.at)) * 1.2;
  const inFeed = (p) => p.status === 'published' && p.vis !== 'link';
  const canSee = (p) => p && (p.status === 'published' || p.mine || isAdmin());

  /* ---------------- Community: feed state ---------------- */
  const F = { tab: 'feed', q: '', sort: 'top', surah: null, type: 'all', board: false, tag: null, author: null, limit: 6 };
  const sheetCount = () => (F.surah ? 1 : 0) + (F.type !== 'all' ? 1 : 0) + (F.board ? 1 : 0);
  const anyFilter = () => sheetCount() + (F.tag ? 1 : 0) + (F.author ? 1 : 0) + (F.q.trim() ? 1 : 0) > 0;
  const clearFilters = () => { F.q = ''; F.surah = null; F.type = 'all'; F.board = false; F.tag = null; F.author = null; F.limit = 6; };
  const ribbonCounts = () => { const c = new Array(114).fill(0); posts().filter(inFeed).forEach((p) => verses(p).forEach((v) => { if (v.s >= 1 && v.s <= 114) c[v.s - 1] += 1; })); return c; };
  const base = () => {
    const all = posts();
    if (F.tab === 'saved') return all.filter((p) => p.saved && (p.status === 'published' || p.mine));
    if (F.tab === 'mine') return all.filter((p) => p.mine);
    return all.filter(inFeed);
  };
  const applyFilters = (list) => {
    const q = strip(F.q.trim());
    return list.filter((p) => {
      if (F.surah && !verses(p).some((v) => v.s === F.surah)) return false;
      if (F.type === 'strict' && p.mode !== 'strict') return false;
      if (F.type === 'tafsir' && p.mode !== 'tafsir') return false;
      if (F.board && !p.board) return false;
      if (F.tag && !p.tags.includes(F.tag)) return false;
      if (F.author && p.by !== F.author) return false;
      if (q && ![p.title, p.summary, ...p.tags].some((x) => strip(x).includes(q))) return false;
      return true;
    }).sort((a, b) => (F.tab === 'mine' || F.sort === 'new' ? new Date(b.at) - new Date(a.at) : score(b) - score(a)));
  };
  const popularTags = () => { const m = {}; posts().filter(inFeed).forEach((p) => p.tags.forEach((t) => (m[t] = (m[t] || 0) + 1))); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10); };
  const queue = () => posts().filter((p) => p.status === 'review' && !p.mine && p.audit);
  const openReports = () => QB.state.reports.filter((r) => r.open);

  /* ---------------- Pieces ---------------- */
  const quoteHtml = (p) => {
    const r = p.quote ? parse(p.quote) : verses(p)[0];
    if (!r) return '';
    const t = vtext(r.s, r.a);
    if (!t) return '';
    const w = QB.words(t);
    const shown = w.length > 22 ? `${w.slice(0, 20).join(' ')} …` : t;
    return `<blockquote class="cm-quote"><p class="q" lang="ar">﴿${shown}﴾</p><cite>${refName(r)}</cite></blockquote>`;
  };
  const badges = (p, withStatus, noLink) => [
    p.mode === 'tafsir' ? '<span class="pill tafsir">تفسيرية تجريبية</span>' : '',
    p.board ? `<span class="pill mute">${QB.ico('board', 'sm')}لوحة</span>` : '',
    withStatus && STATUS[p.status] ? `<span class="pill ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : '',
    !noLink && p.vis === 'link' && (withStatus || p.mine) ? `<span class="pill mute">${QB.ico('lock', 'sm')}برابط فقط</span>` : '',
  ].join('');
  const card = (p) => {
    const vs = verses(p).length, cs = visibleComments(p).length;
    return `<li class="cm-post">
      <div class="cm-by">
        <button class="cm-who" data-act="author" data-author="${esc(p.by)}" title="منشورات هذا الباحث"><span class="cm-av${p.mine ? ' me' : ''}" aria-hidden="true">${esc(initial(p.by))}</span><span class="cm-author">${esc(p.by)}</span></button>
        <span>${QB.age(p.at)}، قراءة ${n(readMin(p))} د</span>
        <span class="cm-badges">${badges(p, F.tab === 'mine')}</span>
      </div>
      <h3 class="cm-title"><button data-act="open" data-id="${p.id}">${tx(p.title)}</button></h3>
      <p class="cm-sum">${tx(p.summary)}</p>
      ${quoteHtml(p)}
      ${p.tags.length ? `<div class="cm-tags">${p.tags.map((t) => `<button class="cm-tag" data-act="tag" data-tag="${esc(t)}" aria-pressed="${F.tag === t}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${p.status === 'changes' && p.modNote ? `<p class="cm-modnote"><b>ملاحظة المشرف:</b> ${tx(p.modNote)}</p>` : ''}
      <div class="cm-foot">
        <button class="cm-act${p.liked ? ' on' : ''}" data-act="like" data-id="${p.id}" aria-pressed="${!!p.liked}" aria-label="${p.liked ? 'إلغاء الإعجاب' : 'أعجبني'}، ${n(p.likes)}" title="${p.liked ? 'إلغاء الإعجاب' : 'أعجبني'}">${QB.ico('heart', p.liked ? 'sm fill' : 'sm')}<span>${n(p.likes)}</span></button>
        <button class="cm-act" data-act="comments" data-id="${p.id}" aria-label="التعليقات، ${n(cs)}" title="التعليقات">${QB.ico('comment', 'sm')}<span>${n(cs)}</span></button>
        <span class="cm-meta">${pl(vs, W.ayah)}</span>
        <span class="cm-sp"></span>
        <button class="cm-act${p.saved ? ' on' : ''}" data-act="save" data-id="${p.id}" aria-pressed="${!!p.saved}" aria-label="${p.saved ? 'إزالة من المحفوظة' : 'احفظ'}" title="${p.saved ? 'إزالة من المحفوظة' : 'احفظ'}">${QB.ico('bookmark', p.saved ? 'sm fill' : 'sm')}<span>${p.saved ? 'محفوظ' : 'احفظ'}</span></button>
        <button class="cm-act" data-act="link" data-id="${p.id}" aria-label="شارك الرابط">${QB.ico('share', 'sm')}<span>شارك الرابط</span></button>
      </div>
    </li>`;
  };
  const guidelinesBox = () => `<section class="panel cm-guide" aria-labelledby="cm-guide-t">
      <h2 class="h3" id="cm-guide-t">إرشادات المجتمع باختصار</h2>
      <ol class="cm-rules">${RULES.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
      <button class="link" data-act="guidelines">الإرشادات كاملة ${QB.ico('chevL', 'sm')}</button>
    </section>`;

  /* ---------------- Community screen ---------------- */
  let cmEl = null;
  const renderList = () => {
    const el = cmEl; if (!el) return;
    const listEl = el.querySelector('#cm-list'); if (!listEl) return;
    const all = base(), list = applyFilters(all), shown = list.slice(0, F.limit);
    // pills
    const pills = [];
    if (F.surah) pills.push(['surah', `سورة ${QB.surah(F.surah).name}`]);
    if (F.type !== 'all') pills.push(['type', F.type === 'strict' ? 'القرآن وحدَه' : 'تفسيرية']);
    if (F.board) pills.push(['board', 'بلوحة موضوع']);
    if (F.tag) pills.push(['tag', `#${F.tag}`]);
    if (F.author) pills.push(['author', `منشورات هذا الباحث: ${F.author}`]);
    if (F.q.trim()) pills.push(['q', `«${F.q.trim()}»`]);
    el.querySelector('#cm-pills').innerHTML = pills.length ? `${pills.map(([k, l]) => `<button class="chip" aria-pressed="true" data-act="clear" data-k="${k}" aria-label="أزل التصفية: ${esc(l)}">${esc(l)}${QB.ico('x', 'sm')}</button>`).join('')}<button class="link" data-act="clear-all">مسح الكل</button>` : '';
    const badge = el.querySelector('#cm-fcount'); if (badge) { badge.textContent = n(sheetCount()); badge.hidden = !sheetCount(); }
    el.querySelectorAll('[data-act="tag"]').forEach((b) => b.setAttribute('aria-pressed', String(F.tag === b.dataset.tag)));
    // ribbon selection
    const rib = el.querySelector('#cm-rib');
    if (rib) rib.querySelectorAll('.bar').forEach((b, i) => { b.classList.toggle('here', F.surah === i + 1); b.classList.toggle('dim', !!F.surah && F.surah !== i + 1); });
    const ro = el.querySelector('#cm-read'); if (ro && ro.dataset.rest !== undefined) ro.textContent = ribbonRest();
    // list
    let empty = '';
    if (!all.length) {
      empty = F.tab === 'saved' ? `<div class="empty-state"><h3 class="h3">لا منشورات محفوظة</h3><p class="empty">اضغط «احفظ» تحت أي بحث في الموجز لتجده هنا.</p><button class="ghost sm" data-act="tab" data-tab="feed">إلى الموجز</button></div>`
        : F.tab === 'mine' ? `<div class="empty-state"><h3 class="h3">لا منشورات لك بعد</h3><p class="empty">لم تنشر بحثاً بعد. افتح بحثاً من الدفتر واضغط «نشر».</p><button class="cta sm" data-act="share-research">${QB.ico('plus', 'sm')}شارك بحثاً</button></div>`
        : `<div class="empty-state"><h3 class="h3">الموجز فارغ</h3><p class="empty">لم يُنشر بحث بعد. كن أول من يشارك تدبّره.</p><button class="cta sm" data-act="share-research">${QB.ico('plus', 'sm')}شارك بحثاً</button></div>`;
    } else if (!list.length) {
      empty = `<div class="empty-state"><p class="empty">لا منشورات تطابق هذه التصفية.</p><button class="ghost sm" data-act="clear-all">مسح التصفية</button></div>`;
    }
    listEl.innerHTML = empty || `<p class="label cm-count" aria-live="polite">${list.length === all.length ? (F.tab === 'mine' ? `${pl(all.length, W.postN)} لك` : `${pl(all.length, W.postN)}، ${F.sort === 'top' ? 'الأبرز أولاً' : 'الأحدث أولاً'}`) : `${pl(list.length, W.postN)} من ${n(all.length)}`}</p>
      <ol class="cm-feed">${shown.map(card).join('')}</ol>
      ${list.length > shown.length ? `<div class="cm-more"><button class="ghost sm" data-act="more">المزيد</button><span class="label">عُرض ${n(shown.length)} من ${n(list.length)}</span></div>` : ''}`;
  };
  let ribTotals = { verses: 0, surahs: 0 };
  const ribbonRest = () => (F.surah ? `تعرض الأبحاث التي تستشهد بسورة ${QB.surah(F.surah).name}` : `${pl(ribTotals.verses, W.ayah)} من ${pl(ribTotals.surahs, W.surah)} تستشهد بها أبحاث المجتمع`);

  const listTools = () => `
    <div class="cm-tools">
      <label class="cm-search" for="cm-q">${QB.ico('search', 'sm')}<span class="sr">ابحث في المنشورات</span><input id="cm-q" type="search" value="${esc(F.q)}" placeholder="ابحث في العناوين والملخّصات والوسوم…" autocomplete="off"></label>
      ${F.tab !== 'mine' ? `<div class="seg-ctl" role="group" aria-label="الترتيب"><button data-act="sort" data-sort="top" aria-pressed="${F.sort === 'top'}">الأبرز</button><button data-act="sort" data-sort="new" aria-pressed="${F.sort === 'new'}">الأحدث</button></div>` : ''}
      <button class="chip cm-fbtn" data-act="filters" aria-haspopup="dialog">${QB.ico('filter', 'sm')}تصفية<span class="cm-badge" id="cm-fcount" ${sheetCount() ? '' : 'hidden'}>${n(sheetCount())}</span></button>
    </div>
    <div class="cm-pills" id="cm-pills"></div>`;

  const modHtml = () => {
    const q = queue(), r = openReports();
    return `<section class="cm-mod-sec" aria-labelledby="cm-q-t">
        <div class="block-title"><h2 class="h2" id="cm-q-t">بانتظار المراجعة</h2><span class="label">${q.length ? pl(q.length, W.postN) : ''}</span></div>
        ${q.length ? `<ol class="cm-feed">${q.map((p) => {
          const rej = p.audit.verdict === 'reject';
          return `<li class="cm-post cm-mod">
            <div class="cm-by"><span class="cm-av" aria-hidden="true">${esc(initial(p.by))}</span><span class="cm-author">${esc(p.by)}</span><span>${QB.age(p.at)}</span><span class="cm-badges">${badges(p)}</span></div>
            <h3 class="cm-title sm"><button data-act="open" data-id="${p.id}">${tx(p.title)}</button></h3>
            <p class="cm-sum">${tx(p.summary)}</p>
            <div class="cm-verdict"><span class="label">المراجعة الآلية</span><span class="pill ${rej ? 'bad' : 'warn'}">${QB.ico('shield', 'sm')}${rej ? 'يوصي بالرفض' : 'يحتاج نظراً بشرياً'}</span><span class="cm-reason">${tx(p.audit.reason)}</span></div>
            <ul class="cm-sugg">${p.audit.suggestions.map((s) => `<li>${tx(s)}</li>`).join('')}</ul>
            <label class="sr" for="cm-note-${p.id}">ملاحظة للكاتب</label>
            <textarea class="textarea cm-note" id="cm-note-${p.id}" rows="2" placeholder="ملاحظة للكاتب (اختيارية)…"></textarea>
            <div class="cm-mod-acts">
              <button class="cta sm" data-act="mod" data-do="publish" data-id="${p.id}">نشر</button>
              <button class="ghost sm" data-act="mod" data-do="changes" data-id="${p.id}">طلب تعديل</button>
              <button class="quiet danger" data-act="mod" data-do="reject" data-id="${p.id}">رفض</button>
              <span class="cm-sp"></span>
              <button class="link" data-act="open" data-id="${p.id}">افتح المنشور ${QB.ico('chevL', 'sm')}</button>
            </div>
          </li>`;
        }).join('')}</ol>` : '<div class="empty-state"><p class="empty">لا منشورات بانتظار المراجعة.</p></div>'}
      </section>
      <section class="cm-mod-sec" aria-labelledby="cm-r-t">
        <div class="block-title"><h2 class="h2" id="cm-r-t">البلاغات</h2><span class="label">${r.length ? `${n(r.length)} مفتوحة` : ''}</span></div>
        ${r.length ? `<ol class="cm-feed">${r.map((x) => {
          const p = post(x.postId); const c = p && x.commentId ? p.comments.find((k) => k.id === x.commentId) : null;
          if (!p) return '';
          return `<li class="cm-post cm-rep">
            <div class="cm-by"><span class="pill warn">${QB.ico('flag', 'sm')}${esc(x.rule)}</span><span>بلاغ من ${esc(x.by)}، ${QB.age(x.at)}</span></div>
            <p class="cm-rep-what">${c ? `تعليق ${esc(c.by)} على ${qt(p.title)}` : `المنشور ${qt(p.title)} لـ${esc(p.by)}`}</p>
            <blockquote class="cm-rep-q">${tx(c ? c.text : p.summary)}</blockquote>
            ${x.detail ? `<p class="label">تفصيل المبلِّغ: ${tx(x.detail)}</p>` : ''}
            <div class="cm-mod-acts">
              <button class="ghost sm" data-act="rep-open" data-id="${x.id}">افتح المنشور</button>
              ${c ? `<button class="quiet danger" data-act="rep-hide" data-id="${x.id}">إخفاء التعليق</button>` : ''}
              <button class="quiet" data-act="rep-ok" data-id="${x.id}">لا مخالفة</button>
            </div>
          </li>`;
        }).join('')}</ol>` : '<div class="empty-state"><p class="empty">لا بلاغات مفتوحة.</p></div>'}
      </section>`;
  };

  const renderCommunity = (el) => {
    cmEl = el;
    const signed = QB.signedIn(), admin = isAdmin();
    if (F.tab === 'mine' && !signed) F.tab = 'feed';
    if (F.tab === 'moderation' && !admin) F.tab = 'feed';
    const counts = ribbonCounts();
    ribTotals = { verses: counts.reduce((a, b) => a + b, 0), surahs: counts.filter(Boolean).length };
    const modN = admin ? queue().length + openReports().length : 0;
    const tabs = [['feed', 'الموجز'], ['saved', 'المحفوظة'], signed ? ['mine', 'منشوراتي'] : null, admin ? ['moderation', 'الإشراف'] : null].filter(Boolean);
    const tags = popularTags();
    el.innerHTML = `<div class="wrap">
      <section class="cm-hero" aria-labelledby="cm-hero-t">
        <div class="cm-hero-text">
          <div class="kicker">المجتمع</div>
          <h2 id="cm-hero-t">أبحاث يتشاركها المتدبّرون</h2>
          <p class="lede">كل بحث هنا تطابق آياته نصّ المصحف قبل نشره، ويراجعه المشرفون وفق إرشادات المجتمع. اقرأ، وناقش الفكرة بدليلها.</p>
        </div>
        <button class="cta" data-act="share-research">${QB.ico('plus', 'sm')}شارك بحثاً</button>
        <div class="cm-rib-wrap">
          <div class="cm-rib-head"><span class="label">ما تتدبّره الأبحاث في المصحف</span><span class="label">المس سورة لتعرض أبحاثها</span></div>
          ${QB.ribbon(counts, { id: 'cm-rib', live: true, grow: true, label: 'السور التي تستشهد بها أبحاث المجتمع' })}
          <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="cm-read" data-rest aria-live="polite"></span><span>${QB.data.names[113]}</span></div>
        </div>
      </section>
      <div class="tabs cm-tabs" role="tablist" aria-label="أقسام المجتمع">${tabs.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${F.tab === k}">${l}${k === 'moderation' && modN ? `<span class="cm-badge">${n(modN)}</span>` : ''}</button>`).join('')}</div>
      <div class="cm-cols">
        <div class="cm-main">
          ${F.tab === 'moderation' ? modHtml() : `${listTools()}<div id="cm-list" class="cm-list"></div>`}
        </div>
        <div class="cm-side">
          ${F.tab !== 'moderation' && tags.length ? `<section class="cm-tagrail" aria-labelledby="cm-tags-t"><h2 class="h3" id="cm-tags-t">وسوم رائجة</h2><div class="chips">${tags.map(([t, k]) => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${F.tag === t}">#${esc(t)}<span class="cm-tagn">${n(k)}</span></button>`).join('')}</div></section>` : ''}
          ${guidelinesBox()}
          <p class="label cm-honest">${QB.ico('info', 'sm')}المنشورات والتعليقات هنا أمثلة في ذاكرة النموذج؛ تفاعلك يحدّثها ولا يُرسَل إلى أحد.</p>
        </div>
      </div>
    </div>`;
    QB.wireRibbon(el.querySelector('#cm-rib'), el.querySelector('#cm-read'),
      (i) => (counts[i] ? `${QB.data.names[i]}: ${pl(counts[i], W.ayah)} في ${pl(posts().filter(inFeed).filter((p) => verses(p).some((v) => v.s === i + 1)).length, W.post)}` : `${QB.data.names[i]}: لا تستشهد بها الأبحاث بعد`),
      (i) => {
        if (i == null) { if (F.surah) { F.surah = null; F.limit = 6; renderList(); } return; }
        if (!counts[i] || F.surah === i + 1) return;
        F.surah = i + 1; F.limit = 6;
        if (F.tab === 'moderation') { F.tab = 'feed'; renderCommunity(el); return; }
        renderList();
      }, ribbonRest);
    renderList();
  };

  const openFilters = () => QB.sheet({ title: 'تصفية', render: (b, close) => {
    const draw = () => {
      const k = applyFilters(base()).length;
      const pc = {}; posts().filter(inFeed).forEach((p) => new Set(verses(p).map((v) => v.s)).forEach((s) => (pc[s] = (pc[s] || 0) + 1)));
      b.innerHTML = `
        <label class="field" for="cm-f-surah"><span>السورة</span>
          <select class="select" id="cm-f-surah"><option value="">كل السور</option>${QB.data.index.map((s) => `<option value="${s.id}" ${F.surah === s.id ? 'selected' : ''}>${n(s.id)}. ${s.name}${pc[s.id] ? ` (${n(pc[s.id])})` : ''}</option>`).join('')}</select></label>
        <div class="field"><span id="cm-f-type-l">النوع</span>
          <div class="seg-ctl" role="group" aria-labelledby="cm-f-type-l">${[['all', 'الكل'], ['strict', 'القرآن وحدَه'], ['tafsir', 'تفسيرية']].map(([v, l]) => `<button data-type="${v}" aria-pressed="${F.type === v}">${l}</button>`).join('')}</div></div>
        <div class="cm-f-row"><span id="cm-f-b-l">بلوحة موضوع<small class="label">أبحاث نُشرت معها لوحة تربط آياتها</small></span><button class="switch" role="switch" id="cm-f-board" aria-checked="${F.board}" aria-labelledby="cm-f-b-l"></button></div>
        <div class="cm-f-foot"><button class="cta" data-done>${k ? `اعرض ${pl(k, W.postN)}` : 'لا منشورات بهذه التصفية'}</button><button class="quiet" data-clear>مسح التصفية</button></div>`;
      b.querySelector('#cm-f-surah').addEventListener('change', (e) => { F.surah = e.target.value ? +e.target.value : null; F.limit = 6; renderList(); draw(); b.querySelector('#cm-f-surah').focus(); });
      b.querySelectorAll('[data-type]').forEach((x) => x.addEventListener('click', () => { F.type = x.dataset.type; F.limit = 6; renderList(); draw(); b.querySelector(`[data-type="${F.type}"]`).focus(); }));
      b.querySelector('#cm-f-board').addEventListener('click', () => { F.board = !F.board; F.limit = 6; renderList(); draw(); b.querySelector('#cm-f-board').focus(); });
      b.querySelector('[data-done]').addEventListener('click', close);
      b.querySelector('[data-clear]').addEventListener('click', () => { F.surah = null; F.type = 'all'; F.board = false; renderList(); draw(); });
    };
    draw();
  } });

  const openGuidelines = () => QB.modal({ render: (b, close) => {
    const G = [
      ['القرآن هو الدليل', ['انقل الآيات بنصّها ومرجعها. كل آية مقتبسة تُطابَق آلياً مع نص المصحف قبل النشر.', 'لا تنسب إلى القرآن ما ليس فيه، وفرّق بوضوح بين نص الآية وفهمك لها.', 'لا تجتزئ الآية من سياقها لتقرير معنى يخالف سياقها.']],
      ['الفرق بين التدبّر والفتوى', ['«بصائر» منصّة تدبّر وبحث، لا منصّة فتوى. لا تنشر أحكاماً في صيغة الإلزام على أنها نتيجة بحثك.', 'صِف ما تقدّمه بدقّة: تأمّل شخصي، أو خلاصة بحث، أو نقل عن عالم مع ذكر المرجع.', 'القراءة التفسيرية المولَّدة آلياً تجريبية، وتبقى موسومة بتنبيهها.']],
      ['المحتوى المولَّد آلياً', ['كل قسم أنتجه «الباحث الآلي» يبقى موسوماً «جواب آلي» عند النشر، ولو عدّلتَه.', 'أنت مسؤول عمّا تنشره: راجِع الجواب الآلي وتحقّق من الآيات قبل نشره.']],
      ['الأدب والاحترام', ['ناقش الفكرة لا الشخص. لا سخرية ولا تجريح ولا تكفير ولا تبديع.', 'لا طعن طائفياً أو مذهبياً، ولا إساءة إلى الأنبياء أو الصحابة أو أيّ دين أو فئة.', 'لا مضايقة ولا ملاحقة لأحد بالتعليقات.']],
      ['الأمانة العلمية', ['انسب الأقوال إلى أصحابها، واذكر الكتاب والموضع.', 'لا أحاديث موضوعة تُعرض على أنها ثابتة، ولا ادّعاءات «إعجاز» غير منضبطة تُقدَّم قطعية.']],
      ['ما لا يُقبل', ['الترويج التجاري والروابط الدعائية، والمحتوى السياسي الحزبي، ومشاركة بيانات غيرك، والإغراق بالمكرّر، والتعليقات الخارجة عن موضوع البحث.']],
      ['كيف تُراجَع المنشورات', ['فحوص آلية حاسمة تمنع النشر إن فشلت، ثم مراجعة آلية وفق الإرشادات، ثم مراجعة بشرية: المشرفون أصحاب القرار، ويُعلَم الكاتب بالسبب ويمكنه التعديل وإعادة الإرسال.']],
      ['البلاغات والاعتراض', ['يمكن لكل مستخدم الإبلاغ عن منشور أو تعليق مع ذكر البند المخالَف، وللكاتب أن يعترض على قرار الإشراف مرة واحدة.']],
    ];
    b.innerHTML = `<h2 class="h2">إرشادات مجتمع «بصائر»</h2><p class="lede">أن يبقى المجتمع مكاناً للتدبّر الجادّ، يُقدَّم فيه الدليل على الرأي، ويُحترم فيه القرآن والناس.</p>
      <ol class="cm-gfull">${G.map(([t, items]) => `<li><h3 class="h3">${t}</h3><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></li>`).join('')}</ol>
      <button class="ghost sm" data-x style="align-self:flex-start">إغلاق</button>`;
    b.querySelector('[data-x]').addEventListener('click', close);
  } });

  // Shared interactions (feed cards and post page)
  const toggleLike = (p) => { if (!QB.signedIn()) return guestToast(); p.liked = !p.liked; p.likes += p.liked ? 1 : -1; };
  const toggleSave = (p) => { if (!QB.signedIn()) return guestToast(); p.saved = !p.saved; QB.toast(p.saved ? 'حُفظ في «المحفوظة».' : 'أُزيل من «المحفوظة».'); };

  QB.screen('community', {
    world: 'community',
    title: () => ['المجتمع', `${pl(posts().filter(inFeed).length, W.postN)} في الموجز`],
    mount(el) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        const act = t.dataset.act, p = t.dataset.id ? post(t.dataset.id) : null;
        if (act === 'share-research') QB.requireAccount('النشر في المجتمع', () => QB.go('notebook', { tab: 'documents' }), 'يتطلّب');
        if (act === 'tab') { F.tab = t.dataset.tab; F.limit = 6; renderCommunity(el); el.querySelector(`[data-tab="${F.tab}"]`)?.focus(); }
        if (act === 'sort') { F.sort = t.dataset.sort; el.querySelectorAll('[data-act="sort"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === F.sort))); renderList(); }
        if (act === 'filters') openFilters();
        if (act === 'clear') { const k = t.dataset.k; if (k === 'surah') F.surah = null; if (k === 'type') F.type = 'all'; if (k === 'board') F.board = false; if (k === 'tag') F.tag = null; if (k === 'author') F.author = null; if (k === 'q') { F.q = ''; const q = el.querySelector('#cm-q'); if (q) q.value = ''; } renderList(); el.querySelector('#cm-q')?.focus(); }
        if (act === 'clear-all') { clearFilters(); const q = el.querySelector('#cm-q'); if (q) q.value = ''; renderList(); }
        if (act === 'tag') { F.tag = F.tag === t.dataset.tag ? null : t.dataset.tag; F.limit = 6; if (F.tab === 'moderation') { F.tab = 'feed'; renderCommunity(el); } else renderList(); }
        if (act === 'author') { F.author = t.dataset.author; F.limit = 6; if (F.tab !== 'feed') { F.tab = 'feed'; renderCommunity(el); } else renderList(); el.querySelector('.cm-tools')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        if (act === 'more') { F.limit += 6; renderList(); }
        if (act === 'open' && p) QB.go('post', { id: p.id });
        if (act === 'comments' && p) QB.go('post', { id: p.id, focus: 'comments' });
        if (act === 'like' && p) { toggleLike(p); renderList(); el.querySelector(`[data-act="like"][data-id="${p.id}"]`)?.focus(); }
        if (act === 'save' && p) { toggleSave(p); renderList(); el.querySelector(`[data-act="save"][data-id="${p.id}"]`)?.focus(); }
        if (act === 'link' && p) share(p.id);
        if (act === 'guidelines') openGuidelines();
        if (act === 'mod' && p) {
          const note = (el.querySelector(`#cm-note-${p.id}`) || {}).value?.trim() || '';
          if (t.dataset.do === 'publish') { p.status = 'published'; p.modNote = note; QB.toast('نُشر المنشور في المجتمع.'); }
          if (t.dataset.do === 'changes') { p.status = 'changes'; p.modNote = note || p.audit.suggestions[0]; QB.toast('أُرسل طلب التعديل إلى الكاتب.'); }
          if (t.dataset.do === 'reject') { p.status = 'rejected'; p.modNote = note || p.audit.reason; QB.toast('رُفض المنشور وأُعلم الكاتب بالسبب.'); }
          QB.emit('posts'); renderCommunity(el); QB.setTitle();
        }
        if (act === 'rep-open' || act === 'rep-hide' || act === 'rep-ok') {
          const r = QB.state.reports.find((x) => x.id === t.dataset.id); if (!r) return;
          if (act === 'rep-open') { QB.go('post', { id: r.postId, focus: r.commentId || 'top' }); return; }
          if (act === 'rep-hide') { const pp = post(r.postId); const c = pp && pp.comments.find((k) => k.id === r.commentId); if (c) c.hidden = true; QB.toast('أُخفي التعليق وأُعلم كاتبه.'); }
          if (act === 'rep-ok') QB.toast('أُغلق البلاغ: لا مخالفة.');
          r.open = false; renderCommunity(el);
        }
      });
      el.addEventListener('input', (e) => { if (e.target.id === 'cm-q') { F.q = e.target.value; F.limit = 6; renderList(); } });
    },
    show(el, params = {}) {
      if (params.tab) F.tab = params.tab === 'feed' || params.tab === 'saved' || params.tab === 'mine' || params.tab === 'moderation' ? params.tab : 'feed';
      if (params.tag) { F.tag = params.tag; if (!params.tab) F.tab = 'feed'; }
      if (params.surah) { F.surah = +params.surah; if (!params.tab) F.tab = 'feed'; }
      if (params.author) { F.author = params.author; F.tab = 'feed'; }
      F.limit = 6;
      renderCommunity(el);
    },
  });
  QB.on('posts', () => { if (QB.current() === 'community' && cmEl) renderCommunity(cmEl); });

  /* ---------------- Post screen ---------------- */
  const PV = { view: {}, draft: {}, err: {} };
  const verseBlock = (r) => {
    const t = vtext(r.s, r.a);
    return `<button class="cm-verse" data-act="verse" data-s="${r.s}" data-a="${r.a}" aria-label="افتح ${QB.surah(r.s).name}، الآية ${n(r.a)} في المصحف">
      <span class="q" lang="ar">﴿${t || '…'}﴾</span><small>${refName(r)}</small></button>`;
  };
  const sectionHtml = (s, i) => {
    const refs = (s.refs || []).map(parse);
    const head = s.title ? `<h3 class="cm-sec-t">${tx(s.title)}</h3>` : '';
    if (s.kind === 'ayat') return `<section class="cm-sec">${head}${s.body ? `<p class="cm-p">${tx(s.body)}</p>` : ''}<div class="cm-verses">${refs.map(verseBlock).join('')}</div></section>`;
    if (s.kind === 'note') return `<section class="cm-sec"><aside class="cm-note-b"><span class="label">${s.title ? tx(s.title) : 'ملاحظة'}</span><p>${tx(s.body)}</p></aside>${refs.length ? `<div class="cm-verses">${refs.map(verseBlock).join('')}</div>` : ''}</section>`;
    if (s.kind === 'question') return `<section class="cm-sec"><div class="cm-qst"><span class="label">${s.title ? tx(s.title) : 'سؤال'}</span><p>${tx(s.body)}</p></div></section>`;
    if (s.kind === 'ai') return `<section class="cm-sec">${s.title ? `<h3 class="cm-sec-t">${tx(s.title)}</h3>` : ''}<span class="pill teal">${QB.ico('spark', 'sm')}جواب آلي</span><p class="cm-p">${tx(s.body)}</p>${refs.length ? `<div class="cm-verses">${refs.map(verseBlock).join('')}</div>` : ''}</section>`;
    return `<section class="cm-sec">${head}<p class="cm-p">${tx(s.body)}</p>${refs.length ? `<div class="cm-verses">${refs.map(verseBlock).join('')}</div>` : ''}</section>`;
  };
  // A small static schematic of the published board: heading, up to four verse cards, one note.
  const boardSvg = (p) => {
    const vs = verses(p).slice(0, 4), k = vs.length, Wd = 760, nw = 156, nh = 96, y = 156;
    if (!k) return `<div class="empty-state"><p class="empty">لا آيات في لوحة «${esc(p.board.name)}» بعد.</p></div>`;
    const gap = k > 1 ? (Wd - 40 - k * nw) / (k - 1) : 0;
    const xs = vs.map((_, i) => (k === 1 ? (Wd - nw) / 2 : Wd - 20 - nw - i * (nw + gap)));
    const hx = Wd / 2, hy = 30, hw = 300, hh = 48;
    const edges = vs.map((v, i) => {
      const cx = xs[i] + nw / 2, mx = (hx + cx) / 2, my = (hy + hh + y) / 2;
      const rel = (p.board.rels || [])[i] || 'يؤكّد', rw = rel.length * 7.2 + 20;
      return `<path class="e" d="M${hx} ${hy + hh} C ${hx} ${my}, ${cx} ${my}, ${cx} ${y}"/><rect class="rl" x="${mx - rw / 2}" y="${my - 11}" width="${rw}" height="22" rx="11"/><text class="rt" x="${mx}" y="${my + 4.5}">${esc(rel)}</text>`;
    }).join('');
    const nodes = vs.map((v, i) => {
      const w = QB.words(vtext(v.s, v.a));
      return `<g><rect class="ay" x="${xs[i]}" y="${y}" width="${nw}" height="${nh}" rx="10"/><text class="ref" x="${xs[i] + nw / 2}" y="${y + 22}">${esc(refName(v))}</text>
        <text class="bq" x="${xs[i] + nw / 2}" y="${y + 52}">${esc(w.slice(0, 3).join(' '))}</text><text class="bq" x="${xs[i] + nw / 2}" y="${y + 80}">${esc(w.slice(3, 6).join(' '))}${w.length > 6 ? ' …' : ''}</text></g>`;
    }).join('');
    const ny = 302, nwid = 330;
    const note = p.board.note ? `<path class="e d" d="M${xs[0] + nw / 2} ${y + nh} L ${xs[0] + nw / 2} ${ny + 25} L ${hx + nwid / 2} ${ny + 25}"/><rect class="nt" x="${hx - nwid / 2}" y="${ny}" width="${nwid}" height="50" rx="8"/><text class="ntt" x="${hx}" y="${ny + 30}">${esc(p.board.note)}</text>` : '';
    return `<figure class="cm-board">
      <svg viewBox="0 0 ${Wd} 372" role="img" aria-label="مخطط لوحة «${esc(p.board.name)}»: ${n(k)} آيات وملاحظة">
        <defs><pattern id="cm-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle class="dot" cx="2" cy="2" r="1.1"/></pattern></defs>
        <rect class="bg" x="0" y="0" width="${Wd}" height="372" rx="14"/>
        ${edges}${note}
        <rect class="hd" x="${hx - hw / 2}" y="${hy}" width="${hw}" height="${hh}" rx="10"/><text class="hdt" x="${hx}" y="${hy + 31}">${esc(p.board.name)}</text>
        ${nodes}
      </svg>
      <figcaption class="label">مخطط مبسّط للوحة «${esc(p.board.name)}» كما نُشرت مع البحث${verses(p).length > 4 ? `، ويعرض أول أربع آيات من ${n(verses(p).length)}` : ''}. الأسهم علاقات وضعها الكاتب بين الآيات.</figcaption>
    </figure>`;
  };
  const banner = (p) => {
    if (p.status === 'published') return '';
    const [label, tone] = STATUS[p.status] || ['', 'mute'];
    let body = '';
    if (p.mine) {
      if (p.status === 'review') body = 'يراجع المشرفون بحثك قبل ظهوره في المجتمع.';
      if (p.status === 'changes') body = 'يحتاج بحثك إلى تعديل قبل نشره. عدّله في الدفتر ثم أعد إرساله.';
      if (p.status === 'rejected') body = 'لم يُقبل هذا البحث للنشر. يمكنك الاعتراض على القرار مرة واحدة.';
      if (p.status === 'withdrawn') body = 'سحبتَ هذا المنشور، فلم يعد ظاهراً في المجتمع. بقي البحث في دفترك.';
      if (p.status === 'removed') body = 'أزال المشرفون هذا المنشور لمخالفته الإرشادات.';
    } else body = p.status === 'review' ? 'هذا المنشور بانتظار المراجعة ولا يراه غير المشرفين.' : 'هذا المنشور غير ظاهر في المجتمع.';
    return `<div class="cm-banner ${tone}" role="status">
      <span class="pill ${tone}">${label}</span><p>${body}</p>
      ${p.modNote && p.status !== 'published' ? `<p class="cm-banner-note"><b>ملاحظة المشرف:</b> ${tx(p.modNote)}</p>` : ''}
      <div class="cm-banner-acts">
        ${p.mine && p.docId ? `<button class="ghost sm" data-act="doc">افتح البحث في الدفتر</button>` : ''}
        ${p.mine && !p.docId && p.status === 'changes' ? `<button class="ghost sm" data-act="soon-doc">عدّل البحث</button>` : ''}
        ${!p.mine && isAdmin() && p.status === 'review' ? `<button class="ghost sm" data-act="to-mod">افتح الإشراف</button>` : ''}
      </div>
    </div>`;
  };
  const commentsHtml = (p) => {
    const vis = visibleComments(p);
    const open = p.status === 'published';
    const err = PV.err[p.id];
    return `<section class="cm-comments" id="cm-comments" aria-labelledby="cm-ct">
      <h2 class="h2" id="cm-ct">التعليقات ${n(vis.length)}</h2>
      ${p.comments.length ? `<ol class="cm-clist">${p.comments.map((c) => c.hidden ? `<li class="cm-c hidden" id="cm-c-${c.id}"><p class="label">أُخفي هذا التعليق بقرار من المشرفين.</p></li>` : `<li class="cm-c" id="cm-c-${c.id}">
          <span class="cm-av${c.mine ? ' me' : ''}" aria-hidden="true">${esc(initial(c.by))}</span>
          <div class="cm-c-body">
            <div class="cm-c-head"><b>${esc(c.by)}</b>${c.by === p.by ? '<span class="pill mute">الكاتب</span>' : ''}<span class="label">${QB.age(c.at)}</span></div>
            <p>${tx(c.text)}</p>
            <div class="cm-c-acts">${c.mine ? `<button class="quiet danger" data-act="c-del" data-c="${c.id}">${QB.ico('trash', 'sm')}حذف التعليق</button>` : `<button class="quiet" data-act="c-report" data-c="${c.id}">${QB.ico('flag', 'sm')}إبلاغ عن التعليق</button>`}</div>
          </div></li>`).join('')}</ol>` : `<p class="empty">${open ? 'لا تعليقات بعد. ابدأ النقاش بفكرة تثري البحث.' : 'تُفتح التعليقات بعد نشر البحث.'}</p>`}
      ${!open ? '' : QB.signedIn() ? `<div class="cm-compose">
          <span class="cm-av me" aria-hidden="true">${esc(initial(me()))}</span>
          <div class="cm-compose-f">
            <label class="sr" for="cm-cbox">أضف تعليقاً</label>
            <textarea class="textarea" id="cm-cbox" rows="3" placeholder="أضف تعليقاً يثري البحث… (ناقش الفكرة لا الشخص)" ${err ? 'aria-invalid="true" aria-describedby="cm-cerr"' : ''}>${esc(PV.draft[p.id] || '')}</textarea>
            ${err ? `<p class="cm-err" id="cm-cerr" role="alert">${err}</p>` : ''}
            <div class="cm-compose-a"><span class="label">ناقش الفكرة لا الشخص، واذكر الآية بموضعها.</span><button class="cta sm" data-act="c-send" ${(PV.draft[p.id] || '').trim() ? '' : 'disabled'}>تعليق</button></div>
          </div>
        </div>` : `<div class="cm-guest"><p class="empty">سجّل الدخول لتعلّق على هذا البحث وتشارك في نقاشه.</p><button class="ghost sm" data-act="login">سجّل الدخول لتعلّق</button></div>`}
    </section>`;
  };
  const openReport = (p, c) => {
    if (!QB.requireAccount('التفاعل مع المجتمع', null, 'يتطلّب')) return;
    QB.modal({ render: (b, close) => {
      b.innerHTML = `<h2 class="h2">إبلاغ المشرفين</h2>
        <p class="label">${c ? `عن تعليق ${esc(c.by)} على ${qt(p.title)}` : `عن المنشور ${qt(p.title)}`}</p>
        <fieldset class="cm-reasons"><legend>ما البند المخالَف؟</legend>
          ${REASONS.map((r, i) => `<label class="cm-radio"><input type="radio" name="cm-reason" value="${i}"><span>${r}</span></label>`).join('')}
        </fieldset>
        <label class="sr" for="cm-rep-d">تفصيل البلاغ</label>
        <textarea class="textarea" id="cm-rep-d" rows="3" placeholder="تفصيل اختياري…"></textarea>
        <div class="cm-mod-acts"><button class="cta sm" data-send disabled>إرسال البلاغ</button><button class="ghost sm" data-no>إلغاء</button></div>`;
      const send = b.querySelector('[data-send]');
      b.querySelectorAll('input[name="cm-reason"]').forEach((x) => x.addEventListener('change', () => { send.disabled = false; }));
      b.querySelector('[data-no]').addEventListener('click', close);
      send.addEventListener('click', () => {
        const pick = b.querySelector('input[name="cm-reason"]:checked'); if (!pick) return;
        QB.state.reports.unshift({ id: QB.uid('r'), postId: p.id, commentId: c ? c.id : null, rule: REASONS[+pick.value], detail: b.querySelector('#cm-rep-d').value.trim(), by: me(), at: QB.today.toISOString(), open: true });
        close(); QB.toast('وصل البلاغ إلى المشرفين. شكراً لك.');
      });
    } });
  };

  let poEl = null;
  const renderPost = (el, params) => {
    poEl = el;
    const id = params.id || 'p1';
    const p = post(id);
    if (!canSee(p) || p.status === 'removed' && !p.mine && !isAdmin()) {
      el.innerHTML = `<div class="wrap cm-pw"><div class="cm-bar"><button class="quiet" data-act="back">${QB.ico('chevR', 'sm')}إلى المجتمع</button></div>
        <div class="empty-state"><h3 class="h3">هذا المنشور غير متاح.</h3><p class="empty">ربما سحبه كاتبه أو ما زال قيد المراجعة.</p><button class="ghost sm" data-act="back">إلى المجتمع</button></div></div>`;
      return;
    }
    const vs = verses(p), view = p.board ? (PV.view[p.id] || 'doc') : 'doc';
    const others = !p.mine;
    el.innerHTML = `<div class="wrap cm-pw">
      <div class="cm-bar">
        <button class="quiet" data-act="back">${QB.ico('chevR', 'sm')}إلى المجتمع</button>
        <span class="cm-sp"></span>
        ${p.status === 'published' ? `<button class="cm-act${p.liked ? ' on' : ''}" data-act="like" aria-pressed="${!!p.liked}" aria-label="${p.liked ? 'إلغاء الإعجاب' : 'أعجبني'}، ${n(p.likes)}" title="${p.liked ? 'إلغاء الإعجاب' : 'أعجبني'}">${QB.ico('heart', p.liked ? 'sm fill' : 'sm')}<span>${n(p.likes)}</span></button>
        <button class="cm-act${p.saved ? ' on' : ''}" data-act="save" aria-pressed="${!!p.saved}" aria-label="${p.saved ? 'إزالة من المحفوظة' : 'احفظ'}" title="${p.saved ? 'إزالة من المحفوظة' : 'احفظ'}">${QB.ico('bookmark', p.saved ? 'sm fill' : 'sm')}<span>${p.saved ? 'محفوظ' : 'احفظ'}</span></button>` : ''}
        <button class="cm-act" data-act="link" aria-label="انسخ رابط المنشور" title="الرابط">${QB.ico('copy', 'sm')}<span>الرابط</span></button>
        <button class="cm-act" data-act="share" aria-label="مشاركة" title="مشاركة">${QB.ico('share', 'sm')}<span>مشاركة</span></button>
        ${others ? `<button class="cm-act" data-act="report" aria-label="إبلاغ المشرفين عن هذا المنشور">${QB.ico('flag', 'sm')}<span>إبلاغ</span></button>` : ''}
      </div>
      ${banner(p)}
      <article class="cm-paper" aria-labelledby="cm-pt">
        <header class="cm-ph">
          <div class="cm-by">
            <button class="cm-who" data-act="author" title="منشورات هذا الباحث"><span class="cm-av${p.mine ? ' me' : ''}" aria-hidden="true">${esc(initial(p.by))}</span><span class="cm-author">${esc(p.by)}</span></button>
            <span>${QB.age(p.at)}${p.vis === 'link' ? '، برابط فقط' : ''}</span>
            <span class="cm-badges">${badges(p, false, true)}</span>
          </div>
          <h1 class="cm-ptitle" id="cm-pt">${tx(p.title)}</h1>
          ${p.summary ? `<p class="cm-psum">${tx(p.summary)}</p>` : ''}
          ${p.tags.length ? `<div class="cm-tags">${p.tags.map((t) => `<button class="cm-tag" data-act="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
          <div class="facts"><span><b>${pl(secsOf(p).length, W.section)}</b></span><span><b>${pl(vs.length, W.ayah)}</b></span><span>قراءة ${n(readMin(p))} د</span></div>
        </header>
        ${p.mode === 'tafsir' ? `<div class="cm-tafsir" role="note"><span class="pill tafsir">قراءة تفسيرية تجريبية</span><p>${TAFSIR}</p></div>` : ''}
        ${p.board ? `<div class="tabs cm-view" role="tablist" aria-label="طريقة العرض"><button role="tab" data-act="view" data-v="doc" aria-selected="${view === 'doc'}">البحث</button><button role="tab" data-act="view" data-v="board" aria-selected="${view === 'board'}">اللوحة</button></div>` : ''}
        ${view === 'board' ? boardSvg(p) : `<div class="cm-body">${secsOf(p).length ? secsOf(p).map(sectionHtml).join('') : '<p class="empty">لا أقسام في هذا البحث.</p>'}</div>`}
        <section class="cm-refs" aria-labelledby="cm-refs-t">
          <h2 class="h3" id="cm-refs-t">المراجع</h2>
          ${refsOf(p).length ? `<ol class="list">${refsOf(p).map((r) => `<li class="cm-ref"><span class="pill mute">${esc(r.type || 'كتاب')}</span><span>${tx(r.name)}${r.loc ? `<small>${tx(r.loc)}</small>` : ''}</span></li>`).join('')}</ol>` : '<p class="empty">لا مراجع بعد.</p>'}
        </section>
        ${p.mine ? `<div class="cm-owner">
          ${p.docId ? `<button class="ghost sm" data-act="doc">${QB.ico('doc', 'sm')}افتح البحث في الدفتر</button>` : ''}
          ${p.status !== 'withdrawn' && p.status !== 'removed' ? `<button class="quiet danger" data-act="withdraw">سحب المنشور</button>` : ''}
        </div>` : ''}
      </article>
      ${commentsHtml(p)}
    </div>`;
    const box = el.querySelector('#cm-cbox');
    if (box) box.addEventListener('input', () => { PV.draft[p.id] = box.value; if (PV.err[p.id]) { PV.err[p.id] = ''; box.removeAttribute('aria-invalid'); el.querySelector('#cm-cerr')?.remove(); } el.querySelector('[data-act="c-send"]').disabled = !box.value.trim(); });
  };

  QB.screen('post', {
    world: 'community',
    title: (pr = {}) => { const p = post(pr.id || 'p1'); return ['منشور', p && canSee(p) ? `بحث ${p.by}` : '']; },
    mount(el) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        const params = QB.params(), p = post(params.id || 'p1'), act = t.dataset.act;
        const again = () => renderPost(el, params);
        if (act === 'back') { QB.go('community'); return; }
        if (!p) return;
        if (act === 'like') { toggleLike(p); again(); el.querySelector('[data-act="like"]')?.focus(); }
        if (act === 'save') { toggleSave(p); again(); el.querySelector('[data-act="save"]')?.focus(); }
        if (act === 'link') share(p.id);
        if (act === 'share') QB.soon('مشاركة المنشور');
        if (act === 'report') openReport(p, null);
        if (act === 'author') QB.go('community', { author: p.by });
        if (act === 'tag') QB.go('community', { tag: t.dataset.tag });
        if (act === 'view') { PV.view[p.id] = t.dataset.v; again(); el.querySelector(`[data-act="view"][data-v="${t.dataset.v}"]`)?.focus(); }
        if (act === 'verse') openVerse(+t.dataset.s, +t.dataset.a);
        if (act === 'doc') QB.go('document', { id: p.docId });
        if (act === 'soon-doc') QB.soon('تعديل هذا البحث');
        if (act === 'to-mod') QB.go('community', { tab: 'moderation' });
        if (act === 'login') QB.go('account', { tab: 'login' });
        if (act === 'withdraw') QB.confirm({ title: 'سحب المنشور؟', body: 'يختفي البحث من المجتمع ويبقى في دفترك، ويمكنك نشره من جديد لاحقاً.', confirm: 'سحب المنشور', danger: true,
          onConfirm: () => { p.status = 'withdrawn'; QB.emit('posts'); again(); QB.toast('سُحب المنشور. بقي البحث في دفترك.'); } });
        if (act === 'c-del') QB.confirm({ title: 'حذف التعليق؟', body: 'يُحذف تعليقك من نقاش هذا البحث.', confirm: 'حذف التعليق', danger: true,
          onConfirm: () => { p.comments = p.comments.filter((c) => c.id !== t.dataset.c); again(); QB.toast('حُذف التعليق.'); } });
        if (act === 'c-report') openReport(p, p.comments.find((c) => c.id === t.dataset.c));
        if (act === 'c-send') {
          const text = (PV.draft[p.id] || '').trim();
          if (!text) return;
          const links = (text.match(/(https?:\/\/|www\.)\S+/gi) || []).length;
          if (links > 2) { PV.err[p.id] = 'التعليق يحوي روابط كثيرة.'; again(); el.querySelector('#cm-cbox')?.focus(); return; }
          p.comments.push({ id: QB.uid('c'), by: me(), mine: true, at: QB.today.toISOString(), text });
          PV.draft[p.id] = ''; PV.err[p.id] = '';
          again(); QB.toast('نُشر تعليقك.');
          const list = el.querySelectorAll('.cm-c'); list[list.length - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    },
    show(el, params = {}) {
      renderPost(el, params);
      const f = params.focus;
      if (f) setTimeout(() => {
        const target = f === 'comments' ? el.querySelector('#cm-comments') : f === 'top' ? null : el.querySelector(`#cm-c-${f}`);
        if (!target) return;
        target.scrollIntoView({ block: f === 'comments' ? 'start' : 'center' });
        if (f !== 'comments') { target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 2200); }
      }, 30);
    },
  });
})();
