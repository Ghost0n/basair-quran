/* Study (الدراسة): a research session that answers from the Quran, beside the Mushaf.
   Params: {session: id} opens it; {ask: text, focus?: {s, a}} opens a new session and sends the
   question; {new: true} opens a fresh session. The agent is simulated: it maps the question to a
   root, picks real verses from the loaded search lists or pages, and writes a short grounded answer.
   Prefix st-. */
(() => {
  const { n, esc } = QB;
  const STEPS = ['فهم السؤال', 'جمع المرشحات', 'ترتيب المرشحات', 'تنقية النتائج'];
  const DEPTHS = [['quick', 'سريع'], ['balanced', 'متوازن'], ['deep', 'عميق']];
  const MODE = { strict: 'القرآن وحدَه', tafsir: 'قراءة تفسيرية' };
  const DISC_T = 'قراءة تفسيرية تجريبية';
  const DISC = 'تنبيه — ما يَلي قراءة تفسيرية بشرية مُولَّدة من نموذج لغوي. ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم. الدليل الوحيد المُعتَمَد هنا هو القرآن الكريم.';
  const EMPTY = 'اطرح سؤالاً حرّاً — يُحوّله الباحث إلى ألفاظ قرآنية، يعرض الآيات الأقرب، ثم يصوغ الجواب منها.';
  const PLACEHOLDER = 'تابع البحث، أو اطرح سؤالاً جديداً…';
  const EXAMPLES = ['ما الفرق بين البصر والبصيرة؟', 'كيف يصف القرآن الصبر؟', 'ما صلة النور بالقلب في القرآن؟'];
  const SECTIONS = ['الخلاصة', 'التحليل اللغوي', 'ربط الآيات', 'الرؤية المستفادة', 'حدود القراءة'];

  let el = null;              // the panel
  let tabs = [];              // ids of the open session tabs
  let activeId = null;
  let confirmConvert = false;
  const drafts = {};          // new sessions not yet asked (not in QB.state.sessions until the first question)
  const model = { key: '', url: '', name: '' };   // «إعدادات النموذج», kept on this device only

  /* ---------------- Arabic counting ---------------- */
  const count = (k, one, two, few, many) => (k === 1 ? one : k === 2 ? two : k <= 10 ? `${n(k)} ${few}` : `${n(k)} ${many}`);
  const ayat = (k) => count(k, 'آية واحدة', 'آيتان', 'آيات', 'آية');
  const ayatShort = (k) => (k === 1 ? `${n(1)} آية` : k === 2 ? `${n(2)} آيتان` : k <= 10 ? `${n(k)} آيات` : `${n(k)} آية`);
  const msgs = (k) => (k === 0 ? 'لا رسائل بعد' : count(k, 'رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'));
  const surahsTxt = (k) => count(k, 'سورة واحدة', 'سورتين', 'سور', 'سورة');

  /* ---------------- Verses (real data only) ---------------- */
  const verseText = (s, a) => {
    const x = QB.ayah(s, a); if (x) return x.text;
    for (const r of QB.searchRoots()) { const v = ((QB.search(r) || {}).verses || []).find((v) => v.s === s && v.a === a); if (v) return v.text; }
    return null;
  };
  const words = (s, a) => QB.words(verseText(s, a) || '');
  const quote = (s, a, from, to) => words(s, a).slice(from - 1, to || from).join(' ');
  const ref = (s, a) => `سورة ${QB.surah(s).name}: ${n(a)}`;
  const hlText = (s, a, hl) => words(s, a).map((w, i) => (hl.includes(i + 1) ? `<mark class="hit">${w}</mark>` : w)).join(' ');

  // Body strings: {s:a} quotes a whole verse, {s:a:i} one word, {s:a:i-j} a run (exact Mushaf text);
  // [k] is an inline citation of evidence k.
  const TOKEN = /\{(\d+):(\d+)(?::(\d+)(?:-(\d+))?)?\}/g;
  const tokenText = (s, a, f, t) => (f ? quote(+s, +a, +f, t ? +t : +f) : verseText(+s, +a));
  const rich = (str, mid) => esc(str)
    .replace(TOKEN, (m, s, a, f, t) => `<span class="st-qt q">﴿${tokenText(s, a, f, t)}﴾</span>`)
    .replace(/\[(\d+)\]/g, (m, k) => `<button type="button" class="st-ref" data-act="ref" data-msg="${mid}" data-k="${k}" aria-label="الدليل ${n(k)}">${n(k)}</button>`);
  const plain = (str) => str.replace(TOKEN, (m, s, a, f, t) => `﴿${tokenText(s, a, f, t)}﴾`).replace(/\[(\d+)\]/g, (m, k) => `[${n(k)}]`);

  /* ---------------- Seeded sessions (real verses, careful wording) ---------------- */
  const user = (text, focus) => ({ id: QB.uid('m'), role: 'user', text, focus });
  const answer = (o) => Object.assign({ id: QB.uid('m'), role: 'agent', kind: 'answer' }, o);
  const SEEDS = {
    s1: () => [
      user('من هم بنو إسرائيل في القرآن؟'),
      answer({ mode: 'strict', body: [
        'يذكرهم القرآن قوماً آتاهم الله الكتاب والحكم والنبوة، ورزقهم من الطيبات، وفضّلهم على العالمين [1]. ويخاطبهم بالنعمة نفسها في سورة البقرة: {2:47:3-11} [2].',
        'وتذكر الآيات أنهم أُوتوا بيّنات من الأمر، ثم اختلفوا من بعد ما جاءهم العلم بغياً بينهم، وأن الله يقضي بينهم يوم القيامة [3]. ومن خبرهم كذلك الميثاق الذي أُخذ عليهم ألّا يعبدوا إلا الله وأن يُحسنوا بالوالدين وذي القربى [4].',
        'فالصورة التي تجتمع من هذه الآيات: نعمةٌ وتكليف، ثم اختلافٌ بعد العلم. ولا تتجاوز الآيات المذكورة هنا ذلك إلى تفصيل نسبهم أو تاريخهم.',
      ], evidence: [{ s: 45, a: 16, hl: [3, 4] }, { s: 2, a: 47, hl: [1, 2] }, { s: 45, a: 17, hl: [6, 12] }, { s: 2, a: 83, hl: [4, 5] }] }),
      user('وما الذي اختلفوا فيه بعد أن جاءهم العلم؟'),
      answer({ mode: 'strict', body: [
        'لا تسمّي الآية موضوع الخلاف بعينه؛ إنما تصف توقيته وسببه: {45:17:5-14} [1]. فالخلاف لم يكن عن جهلٍ، بل جاء بعد البيان، والفصل فيه مُرجأٌ إلى يوم القيامة [1].',
        'وتأتي الآية التالية خطاباً للنبي: {45:18} [2]. فيُقرأ السياق هكذا: قومٌ أُوتوا البيّنات فاختلفوا، ثم شريعةٌ يُؤمر النبي باتباعها دون أهواء الذين لا يعلمون.',
        'وليس الحديث عنهم ذمّاً كلّه؛ ففي سورة الأعراف أن كلمة ربك الحسنى تمّت على بني إسرائيل {7:137:19-20} [3].',
        'إن أردت تفصيلاً أدق، فاسأل عن آية بعينها لأقرأها مع ما قبلها وما بعدها.',
      ], evidence: [{ s: 45, a: 17, hl: [6, 12, 24] }, { s: 45, a: 18, hl: [4] }, { s: 7, a: 137, hl: [17, 18, 20] }] }),
    ],
    s2: () => [
      user('ما الفرق بين البصر والبصيرة؟'),
      answer({ mode: 'tafsir', root: 'بصر', sections: [
        ['الخلاصة', 'في الآيات المستدَلّ بها يأتي «البصر» لحاسّة الرؤية التي قد تُحجب [2] [3]، وتأتي «البصائر» لما يأتي من الربّ فيُبصَر به الطريق [1] [4]. فيُقرأ الفرق هنا فرقاً بين رؤية العين وإدراكٍ يهتدي به صاحبه، مع أن الجذر واحد.'],
        ['التحليل اللغوي', 'الجذر «ب ص ر». منه {2:7:8} جمعُ بَصَر [2]، و{2:17:17} فعلاً مضارعاً [3]، و{6:104:3} جمعُ بصيرة [4]، و{12:108:7-8} [5]. واختلاف الصيغة يقابله اختلاف في المتعلَّق: الأبصار تُغشّى، والبصائر تُؤتى من الربّ.'],
        ['ربط الآيات', 'في الجاثية: {45:20} [1]. وفي الأنعام: {6:104:1-11} [4]؛ فالبصائر تُعرض، والإبصار بها اختيارٌ تقع تبعته على صاحبه. ويقابل ذلك في البقرة من جُعل على أبصارهم غشاوة [2]، ومن تُركوا {2:17:14-17} [3].'],
        ['الرؤية المستفادة', 'قد يُستفاد، في حدود هذه الآيات، أن البصيرة ليست زيادةً في حدّة النظر، بل قبولٌ لما جاء من الله يُبصَر به، وأن الدعوة تكون {12:108:7-8} [5].'],
        ['حدود القراءة', 'هذه قراءة لخمس آيات من ١٣٩ آية ورد فيها الجذر، ولا تستوعب استعمالاته الأخرى، كوصف الله بأنه بصير. وهي اجتهادٌ في الربط، لا حكمٌ ولا تفسيرٌ معتمَد.'],
      ], evidence: [{ s: 45, a: 20, hl: [2] }, { s: 2, a: 7, hl: [8] }, { s: 2, a: 17, hl: [17] }, { s: 6, a: 104, hl: [3, 7] }, { s: 12, a: 108, hl: [8] }] }),
    ],
    s3: () => [
      user('الهدى في سورة البقرة'),
      answer({ mode: 'strict', root: 'هدي', body: [
        'تفتتح سورة البقرة بوصف الكتاب: {2:2} [1]، ثم تصف المتقين بأنهم {2:5:2-5} [2]. فالهدى في مطلع السورة صفةٌ للكتاب، وحالٌ لمن قبله.',
        'وتعود السورة إلى اللفظ في مواضع أخرى: فمن تبع هدى الله {2:38:9-17} [3]، وفي المقابل {2:16:2-5} [4]. ويوصف القرآن في آية الصيام بأنه {2:185:7-12} [5].',
        'تُظهر هذه الآيات الهدى عطاءً من الله يُقبَل أو يُستبدَل به غيره. وفي البقرة مواضع أخرى للجذر لم تُذكر هنا؛ تجدها كاملةً في لوحة المطابقة.',
      ], evidence: [{ s: 2, a: 2, hl: [6] }, { s: 2, a: 5, hl: [3] }, { s: 2, a: 38, hl: [8, 11] }, { s: 2, a: 16, hl: [5, 11] }, { s: 2, a: 185, hl: [7, 11, 42] }] }),
    ],
  };
  const seed = () => QB.state.sessions.forEach((s) => {
    if (!s.messages) { s.messages = SEEDS[s.id] ? SEEDS[s.id]() : []; if (s.messages.length) s.count = s.messages.length; }
    s.depth = s.depth || 'balanced';
  });

  /* ---------------- Sessions and tabs ---------------- */
  const getS = (id) => QB.state.sessions.find((s) => s.id === id) || drafts[id] || null;
  const active = () => getS(activeId);
  const isDraft = (s) => !!drafts[s.id];
  function newSession(mode) {
    const id = QB.uid('s');
    drafts[id] = { id, title: 'جلسة جديدة', mode: mode || 'strict', at: QB.today.toISOString(), count: 0, messages: [], depth: 'balanced', draft: '' };
    tabs.push(id); activeId = id; confirmConvert = false;
    return drafts[id];
  }
  function openSession(id) {
    if (!getS(id)) return false;
    if (!tabs.includes(id)) tabs.push(id);
    activeId = id; confirmConvert = false;
    return true;
  }
  function closeTab(id) {
    const i = tabs.indexOf(id);
    if (i < 0) return;
    tabs.splice(i, 1);
    const s = getS(id);
    if (s && isDraft(s) && !s.messages.length && !s.draft) delete drafts[id];
    if (activeId === id) { activeId = tabs[Math.min(i, tabs.length - 1)] || null; if (!activeId) newSession(); }
    confirmConvert = false;
  }
  function commit(s) {
    if (!isDraft(s)) return;
    delete drafts[s.id];
    QB.state.sessions.unshift(s);
    QB.emit('sessions');
  }
  const shortTitle = (t) => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > 46 ? x.slice(0, 44).trim() + '…' : x; };

  /* ---------------- Question → root (simulated understanding) ---------------- */
  const norm = (s) => QB.strip(s).replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي]/g, '');
  const SYN_RAW = {
    'بصر': 'بصر بصيرة بصائر أبصار ابصار يبصرون إبصار بصير مبصرة',
    'هدي': 'هدى هداية يهدي اهتداء مهتدين المهتدين هادي يهتدون',
    'رحم': 'رحمة رحيم رحمن الرحمن رحمات الرحماء',
    'صبر': 'صبر صابر صابرين صابرون صبروا اصبر',
    'نور': 'نور أنوار منير',
    'قلب': 'قلب قلوب',
    'علم': 'علم عالم علماء يعلمون عليم العالمين',
    'يقن': 'يقين يوقنون موقنين موقنون',
    'أنس': 'ناس إنسان انسان',
    'قوم': 'قوم أقوام',
    'بني': 'بنو بني',
  };
  const SYN = {};
  Object.entries(SYN_RAW).forEach(([r, ws]) => ws.split(' ').forEach((w) => (SYN[norm(w)] = r)));
  const WEAK = new Set(['أله', 'قول', 'كون', 'أتي', 'شيأ', 'بعض', 'جعل', 'بين', 'بعد', 'قبل', 'دون', 'غير', 'كلل', 'عمل', 'يوم']);
  const PRE = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل'];
  const variants = (t) => { const out = [t]; PRE.forEach((p) => { if (t.startsWith(p) && t.length - p.length >= 3) out.push(t.slice(p.length)); }); return out; };
  let wordRoot = null;   // normalised word on the loaded pages → its root (from the morphology)
  const buildWordRoot = () => {
    wordRoot = {};
    QB.pageNumbers.forEach((pn) => (QB.page(pn) || { ayahs: [] }).ayahs.forEach((v) => (QB.morph(v.s, v.a) || []).forEach((w) => {
      if (!w.root) return; variants(norm(w.text)).forEach((k) => { if (!wordRoot[k]) wordRoot[k] = w.root; });
    })));
  };
  function matchRoot(q) {
    const toks = q.split(/[\s،,.؟?!«»"()\-:؛]+/).map(norm).filter((t) => t.length >= 2);
    for (const t of toks) for (const v of variants(t)) if (SYN[v]) return SYN[v];
    const spaced = QB.strip(q).match(/(?:^|\s)([ء-ي])\s([ء-ي])\s([ء-ي])(?=\s|$|[؟?.،])/);
    if (spaced) { const r = QB.findRoot(spaced[1] + spaced[2] + spaced[3]); if (r) return r; }
    for (const t of toks) { const r = QB.findRoot(t); if (r && !WEAK.has(r)) return r; }
    if (!wordRoot) buildWordRoot();
    for (const t of toks) for (const v of variants(t)) { const r = wordRoot[v]; if (r && !WEAK.has(r)) return r; }
    return null;
  }
  const rootInVerse = (s, a) => {
    const m = QB.morph(s, a) || [];
    const good = m.filter((w) => w.root && !WEAK.has(w.root));
    return (good.find((w) => QB.search(w.root)) || good.find((w) => QB.spread(w.root)) || good[0] || {}).root || null;
  };
  // Candidate verses for a root: its search list when loaded, otherwise the loaded pages' morphology.
  function candidates(root) {
    const sr = QB.search(root);
    if (sr) return { pool: sr.verses.map((v) => ({ s: v.s, a: v.a, hl: v.hl })), total: sr.total, verses: sr.verses_total, surahs: sr.surahs, partial: false };
    const pool = [];
    QB.pageNumbers.forEach((pn) => (QB.page(pn) || { ayahs: [] }).ayahs.forEach((v) => {
      const hl = (QB.morph(v.s, v.a) || []).map((w, i) => (w.root === root ? i + 1 : 0)).filter(Boolean);
      if (hl.length) pool.push({ s: v.s, a: v.a, hl });
    }));
    const sp = QB.spread(root);
    return { pool, total: sp ? sp.total : pool.reduce((t, v) => t + v.hl.length, 0), verses: sp ? null : pool.length, surahs: sp ? sp.surahs : new Set(pool.map((v) => v.s)).size, partial: true };
  }
  const order = (a, b) => a.s - b.s || a.a - b.a;
  function pick(pool, k, skip) {
    const out = [], seen = new Set(), key = (v) => `${v.s}:${v.a}`;
    (skip || []).forEach((v) => seen.add(key(v)));
    for (const v of pool) { if (out.length >= k) break; if (!seen.has(key(v)) && !out.some((o) => o.s === v.s)) { out.push(v); seen.add(key(v)); } }
    for (const v of pool) { if (out.length >= k) break; if (!seen.has(key(v))) { out.push(v); seen.add(key(v)); } }
    return out.sort(order);
  }

  /* ---------------- Composing a grounded answer ---------------- */
  function plan(q, focus, forcedRoot, mode, depth) {
    const root = forcedRoot || matchRoot(q) || (focus ? rootInVerse(focus.s, focus.a) : null);
    if (!root) return { clarify: true };
    const c = candidates(root);
    if (!c.pool.length && !focus) return { clarify: true };
    const k = mode === 'tafsir' ? { quick: 3, balanced: 4, deep: 5 }[depth || 'balanced'] : 4;
    let ctx = [];
    if (focus) {
      const fhl = ((QB.morph(focus.s, focus.a) || []).map((w, i) => (w.root === root ? i + 1 : 0)).filter(Boolean));
      ctx = [{ s: focus.s, a: focus.a - 1, hl: [] }, { s: focus.s, a: focus.a, hl: fhl, focus: true }, { s: focus.s, a: focus.a + 1, hl: [] }].filter((v) => v.a > 0 && verseText(v.s, v.a));
    }
    const rest = pick(c.pool, focus ? Math.max(2, 5 - ctx.length) : k, ctx);
    const evidence = [...ctx, ...rest].filter((v) => verseText(v.s, v.a));
    if (!evidence.length) return { clarify: true };
    return { root, c, ctx, evidence };
  }
  const firstWord = (v) => (v.hl && v.hl.length ? `{${v.s}:${v.a}:${v.hl[0]}}` : '');
  function compose(p, mode) {
    const L = `«${QB.letters(p.root)}»`, ev = p.evidence, off = p.ctx.length;
    const rest = ev.slice(off);
    const where = rest.map((v, i) => `${i ? 'وفي' : 'ففي'} سورة ${QB.surah(v.s).name} ${firstWord(v) ? `بلفظ ${firstWord(v)} ` : ''}[${off + i + 1}]`).join('، ');
    const stats = `عدد مواضع الجذر ${L} في القرآن ${n(p.c.total)}، في ${surahsTxt(p.c.surahs)}.`;
    const focusLine = off ? (() => {
      const fi = p.ctx.findIndex((v) => v.focus), f = p.ctx[fi];
      return `قرأتُ الآية ${n(f.a)} من سورة ${QB.surah(f.s).name} مع ما قبلها وما بعدها ${p.ctx.map((_, i) => `[${i + 1}]`).join(' ')}${firstWord(f) ? `، وفيها ${firstWord(f)} من الجذر ${L}` : ''}.`;
    })() : '';
    const note = p.c.partial
      ? `في هذا النموذج لا قائمة نتائج محمّلة لهذا الجذر، فالأدلة من الصفحات المحمّلة (١، ٢، ٤٩٩–٥٠١) وحدها، ولا يُستدعى نموذج لغوي.`
      : `في هذا النموذج يُركَّب الجواب من نتائج الجذر ${L} المحمّلة، ولا يُستدعى نموذج لغوي.`;
    if (mode === 'tafsir') {
      const names = [...new Set(ev.map((v) => QB.surah(v.s).name))];
      return { mode, root: p.root, evidence: ev, note, sections: [
        ['الخلاصة', `${focusLine ? focusLine + ' ' : ''}يجتمع في هذه الآيات الجذر ${L}${where ? `: ${where}` : ''}. ويُقرأ اختلاف الصيغ مع اختلاف السياق، دون أن يُحمَّل اللفظ أكثر مما في آياته.`],
        ['التحليل اللغوي', `الصيغ الواردة هنا ${rest.filter(firstWord).map((v) => `${firstWord(v)} [${ev.indexOf(v) + 1}]`).join('، ') || 'من جذر واحد'}. وكلها من جذر واحد؛ والفرق بينها فرق صيغةٍ وموقعٍ في الجملة.`],
        ['ربط الآيات', `تقع الآيات في ${names.length === 1 ? `سورة ${names[0]}` : `سور ${names.join('، ')}`}. وأولها في ترتيب المصحف ${ref(ev[0].s, ev[0].a)} [1]؛ وتُقرأ كل آية في سياق سورتها قبل أن تُقارَن بغيرها.`],
        ['الرؤية المستفادة', 'قد يُستفاد من جمعها أن المعنى يتّضح بسياقه أكثر مما يتّضح باللفظ منفرداً. هذا اجتهادٌ في القراءة، لا حكم.'],
        ['حدود القراءة', `قراءة ${ayat(ev.length)} من ${p.c.verses ? `${n(p.c.verses)} آية` : 'الآيات'} ورد فيها الجذر، ركّبها النموذج آلياً من النتائج المحمّلة، فلا يُعتمد عليها.`],
      ] };
    }
    return { mode, root: p.root, evidence: ev, note, body: [
      focusLine,
      rest.length ? `${stats} وهذه ${ayat(rest.length)} منها من سور مختلفة، تُقرأ كلٌّ في موضعها: ${where}.` : stats,
      'لا يتجاوز هذا الجواب ظاهر الألفاظ في مواضعها؛ ولقراءة أدق اسأل عن آية بعينها، أو افتح المواضع كلها في لوحة المطابقة.',
    ].filter(Boolean) };
  }

  /* ---------------- Asking (simulated agent) ---------------- */
  function send(text, opts = {}) {
    const s = active(); if (!s) return;
    text = (text != null ? text : s.draft || '').trim();
    if (!text) { el.querySelector('#st-input')?.focus(); return; }
    if (s.working) return;
    if (!QB.signedIn()) { s.draft = text; renderAll(); QB.requireAccount('الدراسة'); return; }
    const focus = opts.focus || s.draftFocus || null;
    commit(s);
    s.messages.push(user(text, focus));
    if (s.title === 'جلسة جديدة') s.title = shortTitle(text);
    s.draft = ''; s.draftFocus = null; s.at = QB.today.toISOString(); s.count = s.messages.length;
    s.working = { step: 0, info: [], mode: s.mode, depth: s.depth };
    renderAll();
    scrollToLast();
    run(s, text, focus, opts.root);
  }
  function run(s, q, focus, forcedRoot) {
    const w = s.working;
    const p = plan(q, focus, forcedRoot, w.mode, w.depth);
    const broken = model.url && !/^https?:\/\//i.test(model.url);
    const dt = { quick: 420, balanced: 640, deep: 900 }[w.mode === 'tafsir' ? w.depth : 'balanced'];
    const info = p.clarify ? ['لم يتبيّن لفظ قرآني في السؤال'] : [
      focus ? `الآية المقصودة وسياقها، والجذر «${QB.letters(p.root)}»` : `الجذر «${QB.letters(p.root)}»`,
      `${n(p.c.verses || p.c.pool.length)} آية مرشّحة`,
      'بحسب قرب اللفظ وتنوّع السور',
      `${ayat(p.evidence.length)} للاستدلال`,
    ];
    const finish = (msg) => {
      delete s.working;
      s.messages.push(Object.assign({ id: QB.uid('m'), role: 'agent' }, msg));
      s.count = s.messages.length; s.at = QB.today.toISOString();
      QB.emit('sessions');
      if (QB.current() === 'study' && activeId === s.id) { renderAll(); scrollToLast(); }
    };
    const tick = () => {
      if (!s.working) return;
      w.info[w.step] = info[w.step];
      if (broken && w.step === 0) { finish({ kind: 'error', q, focus, root: forcedRoot }); return; }
      if (p.clarify) { finish({ kind: 'clarify', roots: ['بصر', 'هدي', 'صبر'] }); return; }
      w.step += 1;
      paintWork(s);
      if (w.step >= STEPS.length) { setTimeout(() => finish(Object.assign({ kind: 'answer' }, compose(p, w.mode))), 300); return; }
      setTimeout(tick, dt);
    };
    setTimeout(tick, dt);
  }
  const paintWork = (s) => {
    if (QB.current() !== 'study' || activeId !== s.id || !el) return;
    const box = el.querySelector('#st-work'); if (box) box.outerHTML = workHtml(s.working);
  };
  const toTop = () => { const sc = el.closest('.room-panel'); if (sc) sc.scrollTop = 0; QB.$('#main').scrollTop = 0; };
  const scrollToLast = () => requestAnimationFrame(() => {
    const items = el.querySelectorAll('.st-msg, #st-work');
    const last = items[items.length - 1];
    if (last) last.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  /* ---------------- Rendering ---------------- */
  const focusNote = (f) => `<p class="st-focus">${QB.ico('book', 'sm')}<span>الآية المقصودة: <button type="button" class="link" data-act="verse" data-s="${f.s}" data-a="${f.a}">سورة ${QB.surah(f.s).name}، الآية ${n(f.a)}</button>، تُقرأ مع ما قبلها وما بعدها وسياق السورة.</span></p>`;

  function evidenceHtml(m) {
    const ev = m.evidence || [];
    if (!ev.length) return '';
    const counts = Array(114).fill(0); ev.forEach((v) => (counts[v.s - 1] += 1));
    return `<section class="st-ev" aria-label="الدليل القرآني">
      <h4 class="st-ev-h">الدليل القرآني (${ayatShort(ev.length)})</h4>
      <ol class="st-ev-list">${ev.map((v, i) => `<li id="st-ev-${m.id}-${i + 1}">
        <button type="button" class="st-cite" data-act="verse" data-s="${v.s}" data-a="${v.a}"><span class="st-num">[${n(i + 1)}]</span><span>${ref(v.s, v.a)}</span>${v.focus ? '<span class="pill gold">الآية المقصودة</span>' : ''}<span class="st-open">${QB.ico('book', 'sm')}<span>افتح في المصحف</span></span></button>
        <p class="st-vt q" lang="ar" data-act="verse" data-s="${v.s}" data-a="${v.a}">${hlText(v.s, v.a, v.hl || [])}</p></li>`).join('')}</ol>
      <div class="st-spread" data-msg="${m.id}">
        ${QB.ribbon(counts, { id: `st-rib-${m.id}`, label: 'مواضع الأدلة في المصحف' })}
        <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="st-rd-${m.id}"></span><span>${QB.data.names[113]}</span></div>
      </div>
    </section>`;
  }
  function answerHtml(m) {
    if (m.kind === 'clarify') return `<article class="st-msg st-ans" id="st-${m.id}">
        <div class="st-ans-h">${QB.ico('spark', 'sm')}<span>سؤال للتوضيح</span></div>
        <p class="st-p">لم أجد في سؤالك لفظاً قرآنياً أستند إليه. أيّ هذه الجذور تقصد؟ أو أعد صياغة السؤال بكلمة من القرآن.</p>
        <div class="chips">${m.roots.map((r) => { const sr = QB.search(r); return `<button type="button" class="chip st-root" data-act="root" data-root="${r}"><b class="letters">${QB.letters(r)}</b>${sr ? `<small>${n(sr.total)} موضعاً</small>` : ''}</button>`; }).join('')}</div>
      </article>`;
    if (m.kind === 'error') return `<article class="st-msg st-ans st-err" id="st-${m.id}" role="alert">
        <p class="st-p">${QB.ico('info', 'sm')} تعذّر الاتصال بخدمة الباحث الذكي. راجِع «عنوان الخدمة» في إعدادات النموذج، ثم أعد المحاولة.</p>
        <div class="chips"><button type="button" class="ghost sm" data-act="retry" data-msg="${m.id}">أعد المحاولة</button><button type="button" class="quiet" data-act="settings">${QB.ico('gear', 'sm')}إعدادات النموذج</button></div>
      </article>`;
    const tafsir = m.mode === 'tafsir';
    const head = tafsir
      ? `<div class="st-ans-h tafsir"><span class="pill tafsir">${DISC_T}</span><span class="st-ans-sub">ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم.</span></div>`
      : `<div class="st-ans-h">${QB.ico('spark', 'sm')}<span>جواب — مستند على القرآن وحدَه</span></div>`;
    const body = tafsir
      ? m.sections.map(([h, p]) => `<section class="st-sec"><h3 class="st-sec-h">${h}</h3><p class="st-p">${rich(p, m.id)}</p></section>`).join('')
      : m.body.map((p) => `<p class="st-p">${rich(p, m.id)}</p>`).join('');
    return `<article class="st-msg st-ans${tafsir ? ' is-tafsir' : ''}" id="st-${m.id}">${head}<div class="st-body">${body}</div>${evidenceHtml(m)}
      ${m.root || m.note ? `<div class="st-foot">${m.note ? `<p class="st-note">${QB.ico('info', 'sm')}<span>${m.note}</span></p>` : ''}${m.root ? `<button type="button" class="link" data-act="concord" data-root="${m.root}">افتح مواضع الجذر «${QB.letters(m.root)}» في المطابقة ${QB.ico('chevL', 'sm')}</button>` : ''}</div>` : ''}
    </article>`;
  }
  const workHtml = (w) => `<div class="st-work" id="st-work" role="status" aria-live="polite">
      <div class="st-work-h"><span class="st-pulse" aria-hidden="true"></span>يجري تحليل الآيات…</div>
      <ol class="st-steps">${STEPS.map((t, i) => `<li class="${i < w.step ? 'done' : i === w.step ? 'cur' : ''}"><span class="st-dot" aria-hidden="true">${i < w.step ? QB.ico('check', 'sm') : ''}</span><span>${t}${w.info[i] ? `<small>${esc(w.info[i])}</small>` : ''}</span></li>`).join('')}</ol>
    </div>`;
  function threadHtml(s) {
    if (!s.messages.length && !s.working) return `<div class="st-empty">
        ${QB.girih('st-girih')}
        <h2 class="h3">ابدأ من سؤال</h2>
        <p class="lede">${EMPTY}</p>
        <div class="chips st-examples">${EXAMPLES.map((q) => `<button type="button" class="chip" data-act="example" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      </div>`;
    return s.messages.map((m) => (m.role === 'user'
      ? `<div class="st-msg st-user" id="st-${m.id}"><div class="label">السؤال</div>${m.focus ? focusNote(m.focus) : ''}<p class="st-qtext">${esc(m.text)}</p></div>`
      : answerHtml(m))).join('') + (s.working ? workHtml(s.working) : '');
  }
  function renderAll() {
    if (!el) return;
    let s = active();
    if (!s) { tabs = tabs.filter(getS); activeId = tabs[0] || null; s = active() || newSession(); }
    const tafsir = s.mode === 'tafsir';
    const hasMsgs = s.messages.length > 0;
    el.innerHTML = `<div class="st" data-mode="${s.mode}">
      <div class="st-top">
        <div class="st-tabbar"><div class="st-tabs" role="tablist" aria-label="الجلسات المفتوحة">
          ${tabs.map((id) => { const t = getS(id); if (!t) return ''; const on = id === activeId; return `<div class="st-tab${on ? ' on' : ''}${t.mode === 'tafsir' ? ' tafsir' : ''}">
            <button type="button" role="tab" aria-selected="${on}" data-act="tab" data-id="${id}" title="${esc(t.title)}"><span class="st-star" aria-hidden="true">✦</span><span class="st-tab-t">${esc(t.title)}</span></button>
            <button type="button" class="st-tab-x" data-act="close-tab" data-id="${id}" aria-label="أغلق «${esc(t.title)}»">${QB.ico('x', 'sm')}</button></div>`; }).join('')}
        </div><button type="button" class="st-tab-new" data-act="new" aria-label="جلسة جديدة" title="جلسة جديدة">${QB.ico('plus', 'sm')}</button></div>
        <header class="st-head">
          <div class="st-id">
            <div class="kicker">جلسة الدراسة</div>
            <button type="button" class="st-title" data-act="sessions" aria-haspopup="dialog" aria-label="الجلسات: ${esc(s.title)}"><span>${esc(s.title)}</span>${QB.ico('chevD', 'sm')}</button>
            <div class="label">${msgs(s.messages.length)}، ${MODE[s.mode]}</div>
          </div>
          <div class="st-tools">
            <button type="button" class="icon-btn" data-act="convert" aria-label="حوّل إلى بحث" title="حوّل إلى بحث" ${hasMsgs ? '' : 'disabled'}>${QB.ico('doc', 'sm')}</button>
            <button type="button" class="icon-btn" data-act="export" aria-label="تصدير الجلسة" title="تصدير الجلسة" ${hasMsgs ? '' : 'disabled'}>${QB.ico('download', 'sm')}</button>
            <button type="button" class="icon-btn" data-act="settings" aria-label="إعدادات النموذج" title="إعدادات النموذج">${QB.ico('gear', 'sm')}</button>
            ${QB.room.toggleButton()}
            <button type="button" class="icon-btn" data-act="close" aria-label="أغلق الدراسة" title="أغلق الدراسة">${QB.ico('x', 'sm')}</button>
          </div>
        </header>
      </div>
      ${confirmConvert ? `<div class="st-banner" role="alertdialog" aria-labelledby="st-cv-t">
          <p id="st-cv-t">حوّل هذه الجلسة إلى بحث قابل للتحرير؟ تبقى الجلسة كما هي.</p>
          <div class="st-banner-acts"><button type="button" class="cta sm" data-act="convert-yes">حوّل</button><button type="button" class="ghost sm" data-act="convert-no">إلغاء</button></div>
        </div>` : ''}
      <div class="st-modebar">
        <div class="tabs st-modes" role="tablist" aria-label="وضع الجواب">
          <button type="button" role="tab" data-act="mode" data-mode="strict" aria-selected="${!tafsir}">القرآن وحدَه</button>
          <button type="button" role="tab" data-act="mode" data-mode="tafsir" aria-selected="${tafsir}">قراءة تفسيرية</button>
        </div>
        ${tafsir ? `<div class="st-disc" role="note"><b>${DISC_T}</b><p>${DISC}</p></div>`
          : '<p class="st-mode-line">يُجيب من الآيات وحدها، ويذكر دليل كل جملة.</p>'}
      </div>
      <div class="st-thread" id="st-thread">${threadHtml(s)}</div>
      <form class="st-comp" id="st-comp" autocomplete="off">
        ${s.draftFocus ? `<div class="st-dfocus">${focusNote(s.draftFocus)}<button type="button" class="icon-btn" data-act="drop-focus" aria-label="أزل الآية المقصودة">${QB.ico('x', 'sm')}</button></div>` : ''}
        ${tafsir ? `<div class="st-depth" role="group" aria-labelledby="st-depth-l"><span class="label" id="st-depth-l">العمق</span>${DEPTHS.map(([k, l]) => `<button type="button" class="chip" data-act="depth" data-depth="${k}" aria-pressed="${s.depth === k}">${l}</button>`).join('')}</div>` : ''}
        <div class="st-box">
          <label for="st-input" class="sr">سؤالك</label>
          <textarea id="st-input" class="st-input" rows="1" placeholder="${PLACEHOLDER}" enterkeyhint="send">${esc(s.draft || '')}</textarea>
          <button type="submit" class="cta sm st-ask" ${s.working ? 'disabled' : ''}>${QB.ico('send', 'sm')}اسأل</button>
        </div>
        <p class="st-hint"><kbd>Enter</kbd> للإرسال، <kbd>Shift</kbd> + <kbd>Enter</kbd> لسطر جديد${QB.signedIn() ? '' : '. الدراسة تتطلّب حساباً، ومسودتك تبقى هنا.'}</p>
      </form>
    </div>`;
    el.querySelectorAll('.st-spread').forEach((sp) => {
      const m = s.messages.find((x) => x.id === sp.dataset.msg); if (!m) return;
      const counts = Array(114).fill(0); m.evidence.forEach((v) => (counts[v.s - 1] += 1));
      const names = [...new Set(m.evidence.map((v) => v.s))].sort((a, b) => a - b).map((x) => QB.surah(x).name);
      QB.wireRibbon(sp.querySelector('.ribbon'), sp.querySelector('.readout'),
        (i) => (counts[i] ? `${QB.data.names[i]}: ${ayat(counts[i])} من الأدلة` : `${QB.data.names[i]}: لا دليل منها هنا`),
        null, () => `الأدلة من ${names.length === 1 ? `سورة ${names[0]}` : `${surahsTxt(names.length)}: ${names.join('، ')}`}`);
    });
    const on = el.querySelector('.st-tab.on'), strip = el.querySelector('.st-tabs');
    if (on && strip) { const a = on.getBoundingClientRect(), b = strip.getBoundingClientRect(); if (a.left < b.left || a.right > b.right) strip.scrollLeft += a.left < b.left ? a.left - b.left - 8 : a.right - b.right + 8; }
    autosize();
    QB.setTitle();
  }
  const autosize = () => { const t = el && el.querySelector('#st-input'); if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight + 2) + 'px'; };

  /* ---------------- Sheets and dialogs ---------------- */
  function sessionsSheet() {
    QB.sheet({ title: 'الجلسات', render: (b, close) => {
      const draw = () => {
        const list = [...Object.values(drafts), ...QB.state.sessions];
        b.innerHTML = `<button type="button" class="cta" data-new>${QB.ico('plus', 'sm')}جلسة جديدة</button>
          ${list.length ? `<ul class="list st-slist">${list.map((s) => { const open = tabs.includes(s.id), cur = s.id === activeId; return `<li class="st-srow">
            <button type="button" class="row" data-open="${s.id}" ${cur ? 'aria-current="true"' : ''}>
              <span class="st-star${s.mode === 'tafsir' ? ' tafsir' : ''}" aria-hidden="true">✦</span>
              <span class="t">${esc(s.title)}<small><span class="pill ${s.mode === 'tafsir' ? 'tafsir' : 'gold'}">${MODE[s.mode]}</span> ${msgs(s.messages ? s.messages.length : s.count || 0)}، ${QB.age(s.at)}</small></span>
              ${cur ? '<span class="pill gold">الحالية</span>' : open ? '<span class="pill mute">مفتوحة</span>' : ''}
            </button>
            ${open ? `<button type="button" class="icon-btn" data-close-tab="${s.id}" aria-label="أغلق تبويب «${esc(s.title)}»">${QB.ico('x', 'sm')}</button>` : ''}
          </li>`; }).join('')}</ul>` : '<p class="empty">لا توجد جلسات محفوظة بعد. اطرح سؤالاً لتبدأ أول جلسة.</p>'}
          <button type="button" class="link" data-nb>كل الجلسات في الدفتر ${QB.ico('chevL', 'sm')}</button>`;
        b.querySelector('[data-new]').addEventListener('click', () => { close(); newSession(); renderAll(); el.querySelector('#st-input')?.focus(); });
        b.querySelectorAll('[data-open]').forEach((x) => x.addEventListener('click', () => { close(); openSession(x.dataset.open); renderAll(); toTop(); }));
        b.querySelectorAll('[data-close-tab]').forEach((x) => x.addEventListener('click', () => { closeTab(x.dataset.closeTab); renderAll(); draw(); }));
        b.querySelector('[data-nb]').addEventListener('click', () => { close(); QB.go('notebook', { tab: 'sessions' }); });
      };
      draw();
    } });
  }

  function modelSheet() {
    QB.sheet({ title: 'إعدادات النموذج', render: (b, close) => {
      b.innerHTML = `<p class="lede">يعمل الباحث بخدمة بصائر افتراضياً. إن كان لديك نموذج خاص، أدخل بياناته هنا.</p>
        <label class="field" for="st-m-key"><span>مفتاح الوصول</span><input class="input" id="st-m-key" type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="اتركه فارغاً لاستعمال خدمة بصائر"></label>
        <label class="field" for="st-m-url"><span>عنوان الخدمة</span><input class="input" id="st-m-url" type="url" dir="ltr" spellcheck="false" placeholder="https://"></label>
        <label class="field" for="st-m-name"><span>نموذج المحادثة</span><input class="input" id="st-m-name" dir="ltr" spellcheck="false" placeholder="الافتراضي"></label>
        <p class="st-local">${QB.ico('lock', 'sm')}<span>تبقى هذه الإعدادات على هذا الجهاز وحده، ولا تُرفع إلى حسابك.</span></p>
        <p class="label">في هذا النموذج لا يُتّصل بأي خدمة. عنوانٌ لا يبدأ بـ https يُظهر حالة «تعذّر الاتصال» لتجرّبها.</p>
        <div class="st-sheet-acts"><button type="button" class="cta" data-save>احفظ</button><button type="button" class="quiet" data-reset>أعد الافتراضي</button></div>`;
      const f = { key: b.querySelector('#st-m-key'), url: b.querySelector('#st-m-url'), name: b.querySelector('#st-m-name') };
      Object.keys(f).forEach((k) => (f[k].value = model[k]));
      b.querySelector('[data-save]').addEventListener('click', () => { Object.keys(f).forEach((k) => (model[k] = f[k].value.trim())); close(); QB.toast('حُفظت إعدادات النموذج على هذا الجهاز.'); });
      b.querySelector('[data-reset]').addEventListener('click', () => { Object.keys(f).forEach((k) => { model[k] = ''; f[k].value = ''; }); QB.toast('عادت الدراسة إلى خدمة بصائر.'); });
    } });
  }

  function toMarkdown(s, o) {
    const out = [`# ${s.title}`, '', `الوضع: ${MODE[s.mode]}، ${msgs(s.messages.length)}، ${QB.age(s.at)}`, ''];
    const hasTafsir = s.messages.some((m) => m.mode === 'tafsir');
    if (hasTafsir && o.disc) out.push(`> **${DISC_T}**`, `> ${DISC}`, '');
    s.messages.forEach((m) => {
      if (m.role === 'user') { out.push('## السؤال', '', m.text, ''); if (m.focus) out.push(`> الآية المقصودة: سورة ${QB.surah(m.focus.s).name}، الآية ${n(m.focus.a)}، تُقرأ مع ما قبلها وما بعدها وسياق السورة.`, ''); return; }
      if (m.kind === 'clarify') { out.push('## سؤال للتوضيح', '', `أيّ هذه الجذور تقصد؟ ${m.roots.map((r) => `«${QB.letters(r)}»`).join('، ')}`, ''); return; }
      if (m.kind === 'error') { out.push('> تعذّر الاتصال بخدمة الباحث الذكي.', ''); return; }
      if (m.mode === 'tafsir') { out.push(`## ${DISC_T}`, ''); m.sections.forEach(([h, p]) => out.push(`### ${h}`, '', plain(p), '')); }
      else { out.push('## جواب — مستند على القرآن وحدَه', ''); m.body.forEach((p) => out.push(plain(p), '')); }
      if (o.ev && m.evidence && m.evidence.length) {
        out.push(`### الدليل القرآني (${ayatShort(m.evidence.length)})`, '');
        m.evidence.forEach((v, i) => out.push(`${i + 1}. ${ref(v.s, v.a)}: ﴿${verseText(v.s, v.a)}﴾`));
        out.push('');
      }
    });
    out.push('---', `صُدّرت من بصائر، ${QB.age(QB.today.toISOString())}.`);
    return out.join('\n');
  }
  function toJSON(s, o) {
    const hasTafsir = s.messages.some((m) => m.mode === 'tafsir');
    return JSON.stringify({
      title: s.title, mode: s.mode, exportedAt: QB.today.toISOString(),
      disclaimer: hasTafsir && o.disc ? DISC : undefined,
      messages: s.messages.map((m) => (m.role === 'user' ? { role: 'user', text: m.text, focus: m.focus || undefined } : {
        role: 'assistant', kind: m.kind, mode: m.mode,
        body: m.body ? m.body.map(plain) : undefined,
        sections: m.sections ? m.sections.map(([h, p]) => ({ title: h, text: plain(p) })) : undefined,
        evidence: o.ev && m.evidence ? m.evidence.map((v) => ({ surah: v.s, ayah: v.a, text: verseText(v.s, v.a) })) : undefined,
      })),
    }, null, 2);
  }
  function exportModal() {
    const s = active(); if (!s) return;
    const hasTafsir = s.messages.some((m) => m.mode === 'tafsir');
    const o = { fmt: 'md', ev: true, disc: hasTafsir, preview: true };
    QB.modal({ render: (b, close) => {
      const draw = () => {
        const text = o.fmt === 'md' ? toMarkdown(s, o) : toJSON(s, o);
        b.innerHTML = `<div class="st-mhead"><h2 class="h2">تصدير الجلسة</h2><button type="button" class="icon-btn" data-x="no" aria-label="إغلاق">${QB.ico('x', 'sm')}</button></div>
          <p class="label">${esc(s.title)}</p>
          <div class="field"><span id="st-fmt-l">الصيغة</span>
            <div class="seg-ctl st-fmt" role="group" aria-labelledby="st-fmt-l">
              <button type="button" data-f="md" aria-pressed="${o.fmt === 'md'}">Markdown</button>
              <button type="button" data-f="json" aria-pressed="${o.fmt === 'json'}">JSON</button>
              <button type="button" disabled aria-disabled="true">PDF <small>قريباً</small></button>
              <button type="button" disabled aria-disabled="true">DOCX <small>قريباً</small></button>
            </div></div>
          <div class="st-opt"><label for="st-x-ev">تضمين الآيات المُستدَل بها</label><button type="button" class="switch" role="switch" id="st-x-ev" aria-checked="${o.ev}"></button></div>
          <div class="st-opt"><label for="st-x-disc">تضمين تنبيه الوضع التفسيري<small>${hasTafsir ? 'في الجلسة قراءة تفسيرية، فيُضمَّن التنبيه دائماً.' : 'لا قراءة تفسيرية في هذه الجلسة.'}</small></label><button type="button" class="switch" role="switch" id="st-x-disc" aria-checked="${o.disc}" disabled aria-disabled="true"></button></div>
          ${o.preview ? `<pre class="st-pre" dir="rtl" tabindex="0" aria-label="معاينة الملف">${esc(text)}</pre>` : ''}
          <div class="st-mfoot"><button type="button" class="cta sm" data-x="go">${QB.ico('download', 'sm')}تصدير</button><button type="button" class="ghost sm" data-x="pv" aria-pressed="${o.preview}">معاينة</button><button type="button" class="quiet" data-x="no">إلغاء</button></div>`;
        b.querySelectorAll('[data-f]').forEach((x) => x.addEventListener('click', () => { o.fmt = x.dataset.f; draw(); }));
        b.querySelector('#st-x-ev').addEventListener('click', () => { o.ev = !o.ev; draw(); b.querySelector('#st-x-ev').focus(); });
        b.querySelector('[data-x=pv]').addEventListener('click', () => { o.preview = !o.preview; draw(); b.querySelector('[data-x=pv]').focus(); });
        b.querySelectorAll('[data-x=no]').forEach((x) => x.addEventListener('click', close));
        b.querySelector('[data-x=go]').addEventListener('click', () => {
          close();
          const file = `${s.title.replace(/[؟?\\/:*"<>|]/g, '').trim().replace(/\s+/g, '-') || 'جلسة'}.${o.fmt === 'md' ? 'md' : 'json'}`;
          QB.toast(`جُهّز الملف «${file}». التنزيل الفعلي خارج هذا النموذج.`);
        });
      };
      draw();
    } });
  }

  function convert() {
    const s = active(); if (!s) return;
    // Sections follow document.js: question → machine answer (tagged, with its mode) → the cited verses.
    const sec = (kind, o) => Object.assign({ id: QB.uid('sec'), kind, title: '', body: '', verses: [] }, o);
    const cite = (str, ev) => plain(str.replace(/\[(\d+)\]/g, (m, k) => { const v = ev[+k - 1]; return v ? `(${QB.surah(v.s).name} ${n(v.a)})` : ''; }));
    const sections = [];
    s.messages.forEach((m) => {
      if (m.role === 'user') { sections.push(sec('question', { body: m.text })); return; }
      if (m.kind !== 'answer') return;
      const ev = m.evidence || [];
      const body = m.sections ? m.sections.map(([h, p]) => `${h}: ${cite(p, ev)}`).join('\n\n') : m.body.map((p) => cite(p, ev)).join('\n\n');
      sections.push(sec('machine', { origin: 'machine', mode: m.mode, sessionId: s.id, body }));
      if (ev.length) sections.push(sec('ayat', { title: 'الدليل القرآني', verses: ev.map((v) => ({ s: v.s, a: v.a, text: verseText(v.s, v.a) || '' })) }));
    });
    const d = { id: QB.uid('d'), title: s.title, from: 'studio', sessionId: s.id, at: QB.today.toISOString(), status: 'draft', mode: s.mode, summary: '', version: 1, sections, refs: [] };
    QB.state.documents.unshift(d);
    confirmConvert = false;
    QB.emit('documents');
    QB.toast('حُوّلت الجلسة إلى بحث قابل للتحرير. بقيت الجلسة كما هي.');
    QB.go('document', { id: d.id });
    if (QB.current() === 'study') renderAll();
  }

  /* ---------------- Screen ---------------- */
  QB.screen('study', {
    room: 'panel', panelWidth: 600, world: 'research',
    title: () => ['الدراسة', active() ? active().title : ''],
    mount(panel) {
      el = panel;
      panel.addEventListener('click', (e) => {
        const bar = e.target.closest('.st-spread .ribbon .bar');
        if (bar) {
          const m = (active() || { messages: [] }).messages.find((x) => x.id === bar.closest('.st-spread').dataset.msg);
          const v = m && m.evidence.find((x) => x.s === +bar.dataset.i + 1);
          if (v) QB.openVerse(v.s, v.a);
          return;
        }
        const t = e.target.closest('[data-act]');
        if (!t || t.disabled) return;
        const s = active();
        switch (t.dataset.act) {
          case 'tab': if (t.dataset.id !== activeId) { openSession(t.dataset.id); renderAll(); toTop(); } break;
          case 'close-tab': closeTab(t.dataset.id); renderAll(); break;
          case 'new': newSession(); renderAll(); el.querySelector('#st-input')?.focus(); break;
          case 'sessions': sessionsSheet(); break;
          case 'convert': confirmConvert = !confirmConvert; renderAll(); if (confirmConvert) el.querySelector('[data-act=convert-yes]')?.focus(); break;
          case 'convert-yes': convert(); break;
          case 'convert-no': confirmConvert = false; renderAll(); break;
          case 'export': exportModal(); break;
          case 'settings': modelSheet(); break;
          case 'close': QB.go('reader'); break;
          case 'mode': if (s && s.mode !== t.dataset.mode) { s.mode = t.dataset.mode; renderAll(); QB.emit('sessions'); } break;
          case 'depth': if (s) { s.depth = t.dataset.depth; renderAll(); } break;
          case 'verse': QB.openVerse(+t.dataset.s, +t.dataset.a); break;
          case 'ref': {
            const li = el.querySelector(`#st-ev-${t.dataset.msg}-${t.dataset.k}`);
            if (!li) break;
            li.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
            break;
          }
          case 'concord': QB.go('search', { q: t.dataset.root, mode: 'root' }); break;
          case 'example': send(t.dataset.q); break;
          case 'root': send(`أقصد الجذر «${QB.letters(t.dataset.root)}».`, { root: t.dataset.root }); break;
          case 'retry': {
            const m = s.messages.find((x) => x.id === t.dataset.msg);
            const q = [...s.messages].reverse().find((x) => x.role === 'user');
            if (!m || !q || s.working) break;
            s.messages.splice(s.messages.indexOf(m), 1);
            s.working = { step: 0, info: [], mode: s.mode, depth: s.depth };
            renderAll(); scrollToLast(); run(s, q.text, q.focus, m.root);
            break;
          }
          case 'drop-focus': if (s) { s.draftFocus = null; renderAll(); } break;
        }
      });
      panel.addEventListener('submit', (e) => { e.preventDefault(); send(); });
      panel.addEventListener('input', (e) => { if (e.target.id === 'st-input') { const s = active(); if (s) s.draft = e.target.value; autosize(); } });
      panel.addEventListener('keydown', (e) => {
        if (e.target.id === 'st-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      });
      QB.on('state', ({ key }) => { if (key === 'user' && QB.current() === 'study') renderAll(); });
      QB.on('sessions', () => { if (QB.current() === 'study' && !active()) renderAll(); });
    },
    show(panel, p = {}) {
      el = panel;
      seed();
      if (!tabs.length) { tabs = ['s1', 's2'].filter(getS); activeId = tabs[0] || null; }
      tabs = tabs.filter(getS);
      if (!p.keepScroll) {
        if (p.session && openSession(p.session)) { /* opened */ }
        else if (p.ask) {
          const q = p.ask, focus = p.focus || null;
          delete p.ask; delete p.focus;   // consumed: a re-render must not ask twice
          const s = newSession();
          s.draftFocus = focus;
          renderAll();
          send(q, { focus });
          return;
        } else if (p.new) { delete p.new; newSession(); }
      }
      if (!active()) { activeId = tabs[0] || null; if (!activeId) newSession(); }
      renderAll();
    },
  });
})();
