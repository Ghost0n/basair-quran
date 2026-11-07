/* Research document (البحث): an editorial reading column you write in, an outline and readiness
   audit beside it, the ayah picker, references, the share studio and the publish flow.
   Params {id}; with no id it opens d1. Everything is in memory; saving is simulated. */
(() => {
  const { n, esc } = QB;

  QB.icons.arrowUp = '<path d="M12 19V5M6 11l6-6 6 6"/>';
  QB.icons.arrowDown = '<path d="M12 5v14M6 13l6 6 6-6"/>';
  QB.icons.alert = '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>';
  QB.icons.question = '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8h.01"/>';
  QB.icons.printer = '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>';
  QB.icons.slides = '<rect x="3.5" y="5" width="13" height="10" rx="1.5"/><path d="M19.5 8v10h-13"/>';
  QB.icons.card = '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 15h7M8.5 18h4"/>';
  QB.icons.link2 = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';

  const KINDS = { text: 'نص', ayat: 'آيات', note: 'ملاحظة', question: 'سؤال', machine: 'جواب آلي' };
  const PH = { text: 'اكتب هنا…', ayat: 'تعليق على الآيات (اختياري)…', note: 'ملاحظة…', question: 'ما السؤال الذي يطرحه هذا القسم؟', machine: 'نص الجواب…' };
  const REF_TYPES = { book: 'كتاب', tafsir: 'تفسير', ayah: 'آية', link: 'رابط' };
  const STATUS = { draft: ['مسودّة', 'mute'], review: ['قيد المراجعة', 'info'], published: ['منشور', 'ok'], changes: ['مطلوب تعديل', 'warn'] };
  const LOADED_NOTE = 'في هذا النموذج حُمّلت صفحات ١، ٢، ٤٩٩–٥٠١، وقوائم بحث لعشرة جذور؛ تُضاف الآيات المحمّل نصّها فقط.';

  /* ---------------- Verse text: the Mushaf as the prototype knows it ---------------- */
  let searchIdx = null;
  const searchIndex = () => {
    if (searchIdx) return searchIdx;
    searchIdx = new Map();
    QB.searchRoots().forEach((r) => (QB.search(r)?.verses || []).forEach((v) => { const k = `${v.s}:${v.a}`; if (!searchIdx.has(k)) searchIdx.set(k, v); }));
    return searchIdx;
  };
  const mushafText = (s, a) => (QB.ayah(s, a) || searchIndex().get(`${s}:${a}`) || {}).text || null;
  const validRef = (s, a) => Number.isInteger(s) && Number.isInteger(a) && s >= 1 && s <= 114 && a >= 1 && a <= (QB.surah(s).ayahs || 0);
  const verseProblem = (v) => {
    if (!validRef(v.s, v.a)) return 'missing';
    const m = mushafText(v.s, v.a);
    if (m && QB.strip(m).replace(/\s+/g, ' ').trim() !== QB.strip(v.text || '').replace(/\s+/g, ' ').trim()) return 'mismatch';
    return null;
  };
  const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const parseRef = (txt) => {
    const t = toLatin(txt).trim();
    let m = t.match(/(\d{1,3})\s*[:：]\s*(\d{1,3})/);
    if (m) return { s: +m[1], a: +m[2] };
    m = t.match(/^(.+?)\s+(\d{1,3})$/);
    if (m) { const k = QB.strip(m[1]).replace(/^(سورة|سوره)\s*/, '').replace(/^ال/, '').trim(); const sur = QB.data.index.find((x) => QB.strip(x.name).replace(/^ال/, '') === k); if (sur) return { s: sur.id, a: +m[2] }; }
    return null;
  };
  const refName = (s, a) => `${QB.surah(s).name || `سورة ${n(s)}`} ${n(a)}`;

  /* ---------------- Seeds ---------------- */
  const sec = (kind, o = {}) => Object.assign({ id: QB.uid('sec'), kind, title: '', body: '', verses: [] }, o);
  const V = (s, a, text) => ({ s, a, text: text || mushafText(s, a) || '' });
  function seed(doc) {
    if (doc.sections) return;
    if (doc.id === 'd1') {
      const basar = QB.search('بصر');
      doc.summary = 'تتبّعٌ لجذر «ب ص ر» من إبصار العين إلى بصيرة القلب، انطلاقاً من قوله تعالى في الجاثية: هذا بصائر للناس.';
      doc.version = 3;
      doc.sections = [
        sec('text', { title: 'مدخل', body: `يرد جذر «ب ص ر» في القرآن ${n(basar ? basar.total : 148)} مرة. يبدأ بالبصر الحسّي، ثم يتّسع ليصف الوحي نفسه بأنه «بصائر»: أدلّةٌ تُبصِّر من أخذ بها. يجمع هذا البحث الآيات التي تصل بين المعنيين.` }),
        // The first quote ends in «يؤمنون» instead of «يوقنون» (a common slip from الأعراف ٢٠٣); the audit catches it.
        sec('ayat', { title: 'الوحي بصائر', body: 'تتكرّر كلمة «بصائر» وصفاً لما جاء من الله، ويُقرن بها الهدى والرحمة.', verses: [V(45, 20, 'هَٰذَا بَصَٰٓئِرُ لِلنَّاسِ وَهُدٗى وَرَحۡمَةٌ لِّقَوۡمٖ يُؤۡمِنُونَ'), V(6, 104), V(7, 203)] }),
        sec('note', { body: 'في الأنعام ١٠٤ يُجعل الإبصار اختياراً: «فمن أبصر فلنفسه ومن عمي فعليها». البصيرة إذن فعلٌ يُنسب إلى الإنسان، لا حاسّةٌ فحسب.' }),
        sec('ayat', { title: 'حين يُغشّى البصر', body: 'الختم والغشاوة يقابلان البصائر: الآيتان تصفان من عُطّلت عنده أدوات الإدراك.', verses: [V(2, 7), V(45, 23)] }),
        sec('question', { body: 'هل البصيرة في القرآن ثمرةُ الهدى أم شرطٌ له؟' }),
        sec('machine', { origin: 'machine', mode: 'tafsir', sessionId: 's2', body: 'تُقرأ الآيات المجموعة هنا على أن البصيرة تسبق الهدى وتتبعه معاً: فالبصائر تُعرض على الناس جميعاً (الجاثية ٢٠)، ثم يُنسب الإبصار إلى من اختاره (الأنعام ١٠٤)، فيكون الهدى والرحمة لقومٍ يوقنون. هذه قراءة تفسيرية تحتمل غيرها.' }),
      ];
      doc.refs = [
        { id: QB.uid('r'), type: 'book', name: 'المفردات في غريب القرآن، الراغب الأصفهاني', locus: 'مادة «بصر»' },
        { id: QB.uid('r'), type: 'ayah', name: '٧:٢٠٣', locus: 'الأعراف' },
      ];
    } else if (doc.id === 'd2') {
      doc.summary = 'ما آتاه الله بني إسرائيل في سورة الجاثية، وكيف جاء اختلافهم بعد العلم لا قبله.';
      doc.version = 5;
      doc.sections = [
        sec('text', { title: 'مدخل', body: 'سؤالٌ بدأ في جلسة دراسة: من هم بنو إسرائيل في القرآن؟ تحصر هذه الورقة الجواب في آيتين متتاليتين من سورة الجاثية.' }),
        sec('ayat', { title: 'ما أُوتوه', body: 'الكتاب والحكم والنبوّة، ثم الرزق من الطيبات والتفضيل على العالمين.', verses: [V(45, 16)] }),
        sec('ayat', { title: 'متى اختلفوا', body: '«فما اختلفوا إلا من بعد ما جاءهم العلم بغياً بينهم»: الاختلاف هنا ليس جهلاً، بل بغيٌ بعد البيّنة.', verses: [V(45, 17)] }),
        sec('note', { body: 'الآية التالية (الجاثية ١٨) تنتقل إلى الخطاب مباشرة: «ثم جعلناك على شريعة من الأمر». فالسياق يعرض التجربة ليحذّر من تكرارها.' }),
        sec('machine', { origin: 'machine', mode: 'strict', sessionId: 's1', body: 'تذكر الآيتان أربع نِعَم: الكتاب والحكم والنبوّة والرزق، ثم البيّنات من الأمر، وتجعل سبب الاختلاف «بغياً بينهم» بعد مجيء العلم (الجاثية ١٦، ١٧).' }),
      ];
      doc.refs = [{ id: QB.uid('r'), type: 'ayah', name: '٤٥:١٨', locus: 'الجاثية' }];
    } else {
      doc.summary = doc.summary || '';
      doc.version = doc.version || 1;
      doc.sections = [sec('text')];
      doc.refs = doc.refs || [];
    }
  }

  /* ---------------- Derived facts ---------------- */
  const allVerses = (doc) => doc.sections.filter((s) => s.kind === 'ayat').flatMap((s) => s.verses.map((v, i) => ({ v, i, sec: s })));
  const session = (doc) => (doc.sessionId ? QB.state.sessions.find((x) => x.id === doc.sessionId) : null);
  const hasTafsir = (doc) => (session(doc)?.mode === 'tafsir') || doc.sections.some((s) => s.origin === 'machine' && s.mode === 'tafsir');
  const hasMachine = (doc) => doc.sections.some((s) => s.origin === 'machine');
  const board = (doc) => (doc.boardId ? QB.state.boards.find((b) => b.id === doc.boardId) : null);
  const hasContent = (doc) => doc.sections.some((s) => (s.body || '').trim() || (s.title || '').trim() || s.verses.length);

  function audit(doc) {
    const vs = allVerses(doc).map((x) => Object.assign(x, { p: verseProblem(x.v) }));
    const mism = vs.filter((x) => x.p === 'mismatch');
    const miss = vs.filter((x) => x.p === 'missing');
    const unverified = vs.filter((x) => !x.p && !mushafText(x.v.s, x.v.a));
    const badRefs = doc.refs.filter((r) => r.type === 'ayah' && (() => { const p = parseRef(r.name); return !p || !validRef(p.s, p.a); })());
    const untagged = doc.sections.filter((s) => s.origin === 'machine' && s.kind !== 'machine');
    const tafsir = hasTafsir(doc);
    const checks = [
      { key: 'text', label: 'نصوص الآيات مطابقة للمصحف', ok: !mism.length,
        detail: mism.length ? `${n(mism.length)} اقتباس لا يطابق نص المصحف.` : unverified.length ? `${n(vs.length - unverified.length)} من ${n(vs.length)} آية طوبقت؛ الباقي لم يُحمَّل نصّه في النموذج.` : `${n(vs.length)} آية طوبقت حرفاً حرفاً.`,
        go: mism[0]?.sec.id },
      { key: 'content', label: 'للبحث عنوان ومحتوى', ok: !!(doc.title || '').trim() && hasContent(doc),
        detail: !(doc.title || '').trim() ? 'أضف عنواناً للبحث.' : !hasContent(doc) ? 'أضف قسماً فيه نص أو آيات.' : `${n(doc.sections.length)} قسم بعنوان «${esc(doc.title)}».`, go: !(doc.title || '').trim() ? 'title' : null },
      { key: 'machine', label: 'الأقسام المولَّدة آلياً موسومة', ok: !untagged.length,
        detail: untagged.length ? 'قسم مولَّد من الدراسة فقد وسم «جواب آلي».' : hasMachine(doc) ? 'كل جواب آلي يحمل وسمه.' : 'لا أقسام مولَّدة في البحث.', go: untagged[0]?.id, fix: untagged[0] ? 'retag' : null },
      { key: 'tafsir', label: 'القراءة التفسيرية تحمل التنبيه', ok: true,
        detail: tafsir ? 'التنبيه مثبّت أعلى البحث وفي القسم التفسيري.' : 'لا قراءة تفسيرية في البحث.' },
      { key: 'refs', label: 'مراجع الآيات صحيحة', ok: !miss.length && !badRefs.length,
        detail: miss.length ? `${n(miss.length)} آية خارج حدود السورة.` : badRefs.length ? `مرجع «${esc(badRefs[0].name)}» لا يدلّ على آية.` : 'كل الإحالات داخل حدود سورها.', go: miss[0]?.sec.id || (badRefs.length ? 'refs' : null) },
    ];
    return { checks, problems: checks.filter((c) => !c.ok), mism, miss };
  }

  /* ---------------- Screen ---------------- */
  let el, doc, saveT, saveState = 'saved', io;

  QB.screen('document', {
    world: 'research',
    title: () => ['الأبحاث', 'الدفتر'],
    mount(root) {
      el = root;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onChange);
      el.addEventListener('keydown', (e) => {
        if (e.target.matches('[data-f="title"], [data-f="sec-title"]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
      el.addEventListener('paste', (e) => {
        if (!e.target.closest('[contenteditable]')) return;
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
      });
    },
    show(root, params) {
      el = root;
      const id = params.id || 'd1';
      doc = QB.state.documents.find((d) => d.id === id);
      clearTimeout(saveT); saveState = 'saved';
      if (!doc) {
        el.innerHTML = `<div class="wrap narrow dc-missing"><div class="empty-state"><h2 class="h3">هذا البحث غير موجود.</h2><p>ربما حُذف. أبحاثك كلها في الدفتر.</p><button class="ghost sm" data-act="back">${QB.ico('chevR', 'sm')}الأبحاث في الدفتر</button></div></div>`;
        return;
      }
      seed(doc);
      render();
    },
    hide() { clearTimeout(saveT); if (io) io.disconnect(); },
  });

  /* ---------------- Rendering ---------------- */
  function render() {
    const keep = QB.$('#main').scrollTop;
    const b = board(doc);
    const st = STATUS[doc.status] || STATUS.draft;
    el.innerHTML = `
      <div class="wrap dc-wrap">
        <header class="dc-bar">
          <button class="icon-btn" data-act="back" aria-label="العودة إلى الأبحاث في الدفتر" title="الأبحاث">${QB.ico('chevR', 'sm')}</button>
          <div class="dc-head">
            <div class="dc-kick"><span class="kicker">بحث${doc.from === 'studio' ? '، من الدراسة' : doc.from === 'board' ? '، من لوحة موضوع' : ''}</span><span class="pill ${st[1]}">${st[0]}</span><span class="dc-save" id="dc-save" role="status"></span></div>
            <h1 class="dc-title" contenteditable="plaintext-only" role="textbox" aria-label="عنوان البحث" data-ph="عنوان البحث" data-f="title" spellcheck="false">${esc(doc.title || '')}</h1>
          </div>
          <div class="dc-acts">
            <button class="ghost sm" data-act="share">${QB.ico('share')}مشاركة</button>
            <button class="ghost sm" data-act="readiness" id="dc-ready-btn">${QB.ico('check')}جاهزية النشر<span id="dc-ready-n"></span></button>
            <button class="cta sm" data-act="publish">${QB.ico('send', 'sm')}نشر</button>
          </div>
        </header>

        <div class="dc-grid">
          <article class="dc-paper" aria-label="نص البحث">
            <p class="dc-summary" contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="ملخّص البحث" data-ph="ملخّص قصير للبحث…" data-f="summary">${esc(doc.summary || '')}</p>
            <div class="dc-meta" id="dc-meta"></div>
            <div id="dc-flags"></div>
            ${b ? boardPreview(b) : ''}
            <div class="dc-sections" id="dc-sections">${doc.sections.map(sectionHTML).join('')}</div>
            <div class="dc-add" role="group" aria-label="أضف قسماً">
              <span class="label">أضف:</span>
              <button class="chip" data-act="add" data-kind="ayat">${QB.ico('book', 'sm')}آيات</button>
              <button class="chip" data-act="add" data-kind="text">${QB.ico('text', 'sm')}نص</button>
              <button class="chip" data-act="add" data-kind="note">${QB.ico('note', 'sm')}ملاحظة</button>
              <button class="chip" data-act="add" data-kind="question">${QB.ico('question', 'sm')}سؤال</button>
            </div>
            <section class="dc-refs" id="dc-refs" aria-labelledby="dc-refs-t">${refsHTML()}</section>
            <div class="dc-end"><button class="quiet danger" data-act="del-doc">${QB.ico('trash', 'sm')}حذف البحث</button></div>
          </article>

          <aside class="dc-side" aria-label="مخطّط البحث وجاهزيته">
            <nav class="dc-toc" aria-labelledby="dc-toc-t"><h2 class="label" id="dc-toc-t">المخطّط</h2><ol id="dc-toc"></ol></nav>
            <section class="dc-audit" id="dc-audit" tabindex="-1" aria-live="polite"></section>
          </aside>
        </div>
      </div>`;
    QB.$('#main').scrollTop = keep;
    refreshDerived();
    paintSave();
    watchToc();
  }

  // Everything that depends on the content but is not being typed into.
  function refreshDerived() {
    if (!doc || !el.querySelector('#dc-meta')) return;
    const vs = allVerses(doc);
    el.querySelector('#dc-meta').innerHTML = `<span>${n(doc.sections.length)} قسم، ${n(vs.length)} آية، الإصدار ${n(doc.version || 1)}</span><span>عُدّل ${QB.age(doc.at)}</span>`;
    const A = audit(doc);
    const tafsir = hasTafsir(doc);
    el.querySelector('#dc-flags').innerHTML = `
      ${tafsir ? `<div class="dc-tafsir" role="note"><span class="pill tafsir">${QB.ico('spark', 'sm')}قراءة تفسيرية تجريبية</span><p>تنبيه: في هذا البحث قراءة تفسيرية بشرية مُولَّدة من نموذج لغوي. ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم. الدليل الوحيد المُعتَمَد هنا هو القرآن الكريم.</p></div>` : ''}
      ${A.mism.length ? `<div class="dc-warn" role="alert">${QB.ico('alert', 'sm')}<span>بعض النصوص المقتبسة لا تطابق نص المصحف — راجِعها في الأقسام المعلَّمة.</span><button class="link" data-act="goto" data-sec="${A.mism[0].sec.id}">اذهب إليها</button></div>` : ''}`;
    // audit box
    const ok = !A.problems.length;
    el.querySelector('#dc-audit').innerHTML = `
      <h2 class="dc-audit-t ${ok ? 'ok' : ''}">${ok ? `${QB.ico('check', 'sm')}البحث جاهز للنشر` : 'قبل النشر:'}</h2>
      <ul class="dc-checks">${A.checks.map((c) => `<li class="${c.ok ? 'ok' : 'warn'}">
        <span class="pill ${c.ok ? 'ok' : 'warn'}">${c.ok ? QB.ico('check', 'sm') : QB.ico('alert', 'sm')}${c.ok ? 'تمّ' : 'راجِع'}</span>
        <div><b>${c.label}</b><small>${c.detail}</small>
        ${!c.ok && c.fix === 'retag' ? `<button class="link" data-act="retag" data-sec="${c.go}">أعِد وسم «جواب آلي»</button>` : !c.ok && c.go ? `<button class="link" data-act="goto" data-sec="${c.go}">اذهب إليه</button>` : ''}</div></li>`).join('')}</ul>
      <p class="dc-audit-note">يُعاد الفحص عند النشر، وتُرسل الأقسام الآلية والتفسيرية إلى المشرفين.</p>`;
    const rn = el.querySelector('#dc-ready-n');
    rn.className = A.problems.length ? 'dc-count' : '';
    rn.textContent = A.problems.length ? n(A.problems.length) : '';
    el.querySelector('#dc-ready-btn').setAttribute('aria-label', A.problems.length ? `جاهزية النشر: ${n(A.problems.length)} ملاحظات` : 'جاهزية النشر: جاهز');
    // outline
    el.querySelector('#dc-toc').innerHTML = doc.sections.map((s, i) => {
      const t = (s.title || '').trim() || (s.body || '').trim().split(/\s+/).slice(0, 5).join(' ') || KINDS[s.kind];
      const bad = s.verses.some((v) => verseProblem(v)) || (s.origin === 'machine' && s.kind !== 'machine');
      return `<li><button data-act="goto" data-sec="${s.id}" data-toc="${s.id}"><span class="dc-toc-k">${KINDS[s.kind]}</span><span class="dc-toc-t">${esc(t)}</span>${bad ? `<span class="dc-dot" aria-label="فيه ملاحظة"></span>` : ''}</button></li>`;
    }).join('') + `<li><button data-act="goto" data-sec="refs" data-toc="refs"><span class="dc-toc-k">المراجع</span><span class="dc-toc-t">${doc.refs.length ? `${n(doc.refs.length)} مرجع` : 'لا مراجع بعد.'}</span></button></li>`;
  }

  function watchToc() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const seen = new Map();
    io = new IntersectionObserver((ents) => {
      ents.forEach((e) => seen.set(e.target.dataset.secId || e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
      const first = [...seen.entries()].filter(([, t]) => t != null).sort((a, b) => a[1] - b[1])[0];
      if (!first) return;
      el.querySelectorAll('[data-toc]').forEach((x) => x.classList.toggle('on', x.dataset.toc === (first[0] === 'dc-refs' ? 'refs' : first[0])));
    }, { root: QB.$('#main'), rootMargin: '-90px 0px -55% 0px' });
    el.querySelectorAll('.dc-sec, #dc-refs').forEach((x) => io.observe(x));
  }

  function verseHTML(s, v, i) {
    const p = verseProblem(v);
    const m = mushafText(v.s, v.a);
    let words = QB.words(v.text || '');
    if (p === 'mismatch' && m) {
      const a = QB.words(QB.strip(v.text)), b = QB.words(QB.strip(m));
      if (a.length === b.length) words = words.map((w, k) => (a[k] !== b[k] ? `<mark class="dc-wrong" title="في المصحف: ${esc(QB.words(m)[k])}">${w}</mark>` : w));
    }
    const sur = QB.surah(v.s);
    const loaded = !!QB.pageOf(v.s, v.a);
    return `<li class="dc-verse ${p ? 'has-p' : ''}">
      <blockquote class="dc-q" lang="ar">﴿${words.join(' ')}<span class="marker"><i>${n(v.a)}</i></span>﴾</blockquote>
      <div class="dc-vref">
        <button class="dc-vname" data-act="open-verse" data-s="${v.s}" data-a="${v.a}" title="${loaded ? 'افتح في المصحف' : 'خارج الصفحات المحمّلة'}">سورة ${sur.name || n(v.s)}، الآية ${n(v.a)}</button>
        <span class="dc-vtools">
          <button class="quiet" data-act="verse-card" data-sec="${s.id}" data-i="${i}">${QB.ico('card', 'sm')}بطاقة</button>
          <button class="icon-btn dc-ib" data-act="verse-remove" data-sec="${s.id}" data-i="${i}" aria-label="إزالة الآية من القسم" title="إزالة الآية من القسم">${QB.ico('x', 'sm')}</button>
        </span>
      </div>
      ${p ? `<div class="dc-prob" role="alert">${QB.ico('alert', 'sm')}<span>${p === 'missing' ? 'هذه الآية غير موجودة في المصحف.' : 'النص المقتبس لا يطابق المصحف.'}</span>${p === 'mismatch' ? `<button class="ghost sm" data-act="verse-fix" data-sec="${s.id}" data-i="${i}">استبدل بنص المصحف</button>` : ''}</div>` : ''}
    </li>`;
  }

  function sectionHTML(s, idx) {
    const first = idx === 0, last = idx === doc.sections.length - 1;
    const machine = s.kind === 'machine';
    const src = s.sessionId ? QB.state.sessions.find((x) => x.id === s.sessionId) : null;
    const kinds = Object.entries(KINDS).filter(([k]) => k !== 'machine' || s.origin === 'machine');
    return `<section class="dc-sec k-${s.kind}" id="dc-s-${s.id}" data-sec-id="${s.id}" aria-label="${KINDS[s.kind]}">
      <div class="dc-sec-bar">
        <label class="dc-kind"><span class="sr">نوع القسم</span>
          <select data-f="kind" data-sec="${s.id}">${kinds.map(([k, l]) => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>${QB.ico('chevD', 'sm')}</label>
        ${machine ? `<span class="pill info">${QB.ico('spark', 'sm')}مولَّد آلياً</span>${s.mode === 'tafsir' ? '<span class="pill tafsir">قراءة تفسيرية تجريبية</span>' : '<span class="pill mute">القرآن وحدَه</span>'}` : ''}
        ${s.origin === 'machine' && !machine ? `<span class="pill warn">${QB.ico('alert', 'sm')}مولَّد آلياً بلا وسم</span>` : ''}
        <span class="dc-sec-tools">
          <button class="icon-btn dc-ib" data-act="sec-up" data-sec="${s.id}" ${first ? 'disabled' : ''} aria-label="إلى الأعلى" title="إلى الأعلى">${QB.ico('arrowUp', 'sm')}</button>
          <button class="icon-btn dc-ib" data-act="sec-down" data-sec="${s.id}" ${last ? 'disabled' : ''} aria-label="إلى الأسفل" title="إلى الأسفل">${QB.ico('arrowDown', 'sm')}</button>
          <button class="icon-btn dc-ib danger" data-act="sec-del" data-sec="${s.id}" aria-label="حذف القسم" title="حذف القسم">${QB.ico('trash', 'sm')}</button>
        </span>
      </div>
      ${machine && src ? `<p class="dc-src">${QB.ico('study', 'sm')}من جلسة «${esc(src.title)}» في الدراسة${s.mode === 'tafsir' ? '، قراءة تفسيرية' : '، جواب مستند على القرآن وحدَه'}.</p>` : ''}
      <h2 class="dc-sec-title" contenteditable="plaintext-only" role="textbox" aria-label="عنوان القسم (اختياري)" data-ph="${s.kind === 'question' ? 'سؤال' : 'عنوان القسم (اختياري)'}" data-f="sec-title" data-sec="${s.id}">${esc(s.title || '')}</h2>
      ${s.kind === 'ayat' ? `<ol class="dc-verses">${s.verses.map((v, i) => verseHTML(s, v, i)).join('')}</ol>
        ${s.verses.length ? '' : '<p class="empty">لا آيات في هذا القسم بعد.</p>'}
        <button class="link dc-addv" data-act="add-verses" data-sec="${s.id}">${QB.ico('plus', 'sm')}أضف آيات</button>` : ''}
      <div class="dc-body" contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="${KINDS[s.kind]}: النص" data-ph="${PH[s.kind]}" data-f="body" data-sec="${s.id}">${esc(s.body || '')}</div>
      ${machine && s.mode === 'tafsir' ? '<p class="dc-sec-disc">قراءة تفسيرية تجريبية: ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم.</p>' : ''}
    </section>`;
  }

  function boardPreview(b) {
    const verses = QB.state.notebook.filter((x) => x.themes.includes(b.themeId)).slice(0, 4);
    const th = QB.theme(b.themeId);
    // A heading node on top, the theme's verses in a row beneath it, a note between them.
    const W = 640, k = verses.length, step = k > 1 ? Math.min(300, (W - 190) / (k - 1)) : 0, nw = Math.min(184, (step || 300) - 30);
    const nodes = verses.map((v, i) => ({ x: W / 2 + ((k - 1) / 2 - i) * step, y: 138, label: refName(v.s, v.a), q: QB.words(mushafText(v.s, v.a) || '').slice(0, 3).join(' ') }));
    const head = { x: W / 2, y: 34 };
    const rel = ['يقابل', 'يؤكّد', 'يفسّر'];
    return `<figure class="dc-board">
      <figcaption><span><b class="h3">لوحة الموضوع</b><small>${esc(b.name)}${th ? `، موضوع «${esc(th.name)}»` : ''}، ${n(verses.length)} آيات</small></span>
        <button class="ghost sm" data-act="edit-board" data-board="${b.id}">${QB.ico('board', 'sm')}عدّل اللوحة</button></figcaption>
      <svg viewBox="0 0 ${W} 180" role="img" aria-label="مخطّط مصغّر للوحة الموضوع: ${esc(b.name)}">
        <g class="dc-bedges">${nodes.map((m) => `<path d="M${head.x} ${head.y + 18} C${head.x} ${head.y + 60} ${m.x} ${m.y - 70} ${m.x} ${m.y - 28}"/>`).join('')}
          ${nodes.slice(1).map((m, i) => `<path d="M${nodes[i].x - nw / 2} ${m.y} L${m.x + nw / 2} ${m.y}"/>`).join('')}</g>
        <g class="dc-brel">${nodes.slice(1).map((m, i) => `<text x="${(nodes[i].x + m.x) / 2}" y="${m.y - 8}" text-anchor="middle">${rel[i % rel.length]}</text>`).join('')}</g>
        <g class="dc-bhead" transform="translate(${head.x - 110} ${head.y - 18})"><rect width="220" height="36" rx="8"/><text x="110" y="23" text-anchor="middle">${esc(b.name)}</text></g>
        <g class="dc-bnode">${nodes.map((m) => `<g transform="translate(${m.x - nw / 2} ${m.y - 28})"><rect width="${nw}" height="56" rx="10"/><text x="${nw / 2}" y="23" text-anchor="middle" class="q">${esc(k > 2 ? m.q.split(' ').slice(0, 2).join(' ') : m.q)}…</text><text x="${nw / 2}" y="44" text-anchor="middle" class="r">${esc(m.label)}</text></g>`).join('')}</g>
      </svg>
    </figure>`;
  }

  function refsHTML() {
    return `<div class="block-title"><h2 class="h2" id="dc-refs-t">المراجع</h2><span class="label">${n(doc.refs.length)}</span></div>
      ${doc.refs.length ? `<ul class="list dc-reflist">${doc.refs.map((r) => {
        const p = r.type === 'ayah' ? parseRef(r.name) : null;
        const bad = r.type === 'ayah' && (!p || !validRef(p.s, p.a));
        return `<li class="dc-ref"><span class="pill ${bad ? 'warn' : 'mute'}">${REF_TYPES[r.type]}</span>
          <span class="dc-ref-t">${r.type === 'link' ? `<span dir="auto">${esc(r.name)}</span>` : esc(r.name)}${p && !bad ? `<small>سورة ${QB.surah(p.s).name}، الآية ${n(p.a)}</small>` : ''}${bad ? '<small class="dc-bad">لا تدلّ على آية في المصحف؛ اكتبها هكذا: ٤٥:٢٠</small>' : ''}${r.locus ? `<small dir="auto">${esc(r.locus)}</small>` : ''}</span>
          <button class="icon-btn dc-ib" data-act="ref-del" data-ref="${r.id}" aria-label="حذف المرجع" title="حذف المرجع">${QB.ico('trash', 'sm')}</button></li>`;
      }).join('')}</ul>` : '<p class="empty">لا مراجع بعد.</p>'}
      <form class="dc-refform" data-form="ref">
        <div class="seg-ctl" role="group" aria-label="نوع المرجع">${Object.entries(REF_TYPES).map(([k, l], i) => `<button type="button" data-act="ref-type" data-type="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
        <label class="field"><span>اسم المرجع</span><input class="input" id="dc-ref-name" placeholder="مثلاً: المفردات في غريب القرآن" autocomplete="off"></label>
        <label class="field"><span>الموضع (جزء/صفحة/رابط)</span><input class="input" id="dc-ref-locus" placeholder="ج ١، ص ٤٥" autocomplete="off"></label>
        <button class="ghost sm" type="submit">${QB.ico('plus', 'sm')}إضافة</button>
      </form>`;
  }

  /* ---------------- Saving (simulated) ---------------- */
  function paintSave() {
    const s = el.querySelector('#dc-save');
    if (!s) return;
    const st = !(doc.title || '').trim() ? 'need' : saveState;
    s.className = `dc-save ${st}`;
    s.innerHTML = st === 'need' ? `${QB.ico('alert', 'sm')}العنوان مطلوب للحفظ` : st === 'saving' ? 'جارٍ الحفظ…' : `${QB.ico('check', 'sm')}محفوظ`;
  }
  function dirty(structural) {
    clearTimeout(saveT);
    if (!(doc.title || '').trim()) { saveState = 'pending'; paintSave(); refreshDerived(); return; }
    saveState = 'saving'; paintSave();
    if (structural) render(); else refreshDerived();
    saveT = setTimeout(() => {
      saveState = 'saved'; doc.version = (doc.version || 1) + 1; doc.at = QB.today.toISOString();
      paintSave(); refreshDerived(); QB.emit('documents', { id: doc.id });
    }, 700);
  }

  /* ---------------- Events ---------------- */
  const secOf = (id) => doc.sections.find((s) => s.id === id);
  function onInput(e) {
    const t = e.target, f = t.dataset.f;
    if (!f || f === 'kind') return;
    const val = t.innerText.replace(/\n+$/, '');
    if (!val.trim() && t.innerHTML) t.innerHTML = '';
    if (f === 'title') doc.title = val.replace(/\n/g, ' ').trim() ? val.replace(/\n/g, ' ') : '';
    else if (f === 'summary') doc.summary = val;
    else if (f === 'sec-title') secOf(t.dataset.sec).title = val.replace(/\n/g, ' ');
    else if (f === 'body') secOf(t.dataset.sec).body = val;
    dirty(false);
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.f === 'kind') {
      const s = secOf(t.dataset.sec); s.kind = t.value;
      if (s.kind === 'ayat' && !s.verses) s.verses = [];
      dirty(true);
    }
  }
  let refType = 'book';
  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    const s = t.dataset.sec ? secOf(t.dataset.sec) : null;
    const i = t.dataset.i != null ? +t.dataset.i : null;
    if (act === 'back') QB.go('notebook', { tab: 'documents' });
    else if (act === 'share') shareStudio();
    else if (act === 'readiness') { const a = el.querySelector('#dc-audit'); a.scrollIntoView({ behavior: 'smooth', block: 'center' }); a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash'); a.focus({ preventScroll: true }); }
    else if (act === 'publish') publishSheet();
    else if (act === 'del-doc') QB.confirm({ title: 'حذف البحث نهائياً؟', body: `يُحذف «${esc(doc.title || 'بلا عنوان')}» بأقسامه ومراجعه من الدفتر، ولا يمكن التراجع.${doc.postId ? ' يبقى المنشور في المجتمع حتى تسحبه.' : ''}`, confirm: 'احذف البحث', danger: true, onConfirm: () => {
      const id = doc.id; QB.state.documents = QB.state.documents.filter((d) => d.id !== id); QB.emit('documents', { id, removed: true });
      QB.toast('حُذف البحث.'); QB.go('notebook', { tab: 'documents' });
    } });
    else if (act === 'goto') gotoSec(t.dataset.sec);
    else if (act === 'retag') { s.kind = 'machine'; dirty(true); QB.toast('أُعيد وسم القسم «جواب آلي».'); }
    else if (act === 'sec-up' || act === 'sec-down') {
      const k = doc.sections.indexOf(s), j = act === 'sec-up' ? k - 1 : k + 1;
      if (j < 0 || j >= doc.sections.length) return;
      [doc.sections[k], doc.sections[j]] = [doc.sections[j], doc.sections[k]];
      dirty(true);
      requestAnimationFrame(() => el.querySelector(`[data-act="${act}"][data-sec="${s.id}"]:not([disabled])`)?.focus() || el.querySelector(`#dc-s-${s.id} select`)?.focus());
    }
    else if (act === 'sec-del') QB.confirm({ title: 'حذف القسم؟', body: `يُحذف قسم «${esc(s.title || KINDS[s.kind])}»${s.verses.length ? ` وما فيه من آيات (${n(s.verses.length)})` : ''}.`, confirm: 'احذف القسم', danger: true, onConfirm: () => { doc.sections = doc.sections.filter((x) => x !== s); dirty(true); QB.toast('حُذف القسم.'); } });
    else if (act === 'add') {
      if (t.dataset.kind === 'ayat') { ayahPicker(null); return; }
      const ns = sec(t.dataset.kind); doc.sections.push(ns); dirty(true);
      requestAnimationFrame(() => { const b = el.querySelector(`#dc-s-${ns.id} .dc-body`); b?.scrollIntoView({ behavior: 'smooth', block: 'center' }); b?.focus(); });
    }
    else if (act === 'add-verses') ayahPicker(s);
    else if (act === 'verse-remove') { const v = s.verses[i]; s.verses.splice(i, 1); dirty(true); QB.toast(`أُزيلت ${refName(v.s, v.a)} من القسم.`); }
    else if (act === 'verse-fix') { const v = s.verses[i]; v.text = mushafText(v.s, v.a); dirty(true); QB.toast('استُبدل الاقتباس بنص المصحف.'); }
    else if (act === 'verse-card') { const v = s.verses[i]; shareStudio({ art: 'ayah', verse: `${v.s}:${v.a}` }); }
    else if (act === 'open-verse') { const vs = +t.dataset.s, va = +t.dataset.a; if (QB.pageOf(vs, va)) QB.go('reader', { s: vs, a: va }); else QB.toast(`${refName(vs, va)} خارج الصفحات المحمّلة في النموذج (١، ٢، ٤٩٩–٥٠١).`); }
    else if (act === 'edit-board') QB.go('board', { id: t.dataset.board });
    else if (act === 'ref-type') {
      refType = t.dataset.type;
      el.querySelectorAll('[data-act="ref-type"]').forEach((x) => x.setAttribute('aria-pressed', x === t));
      const nm = el.querySelector('#dc-ref-name'), lc = el.querySelector('#dc-ref-locus');
      nm.placeholder = { book: 'مثلاً: المفردات في غريب القرآن', tafsir: 'مثلاً: تفسير الطبري', ayah: 'مثلاً: ٤٥:٢٠', link: 'https://' }[refType];
      nm.dir = refType === 'link' ? 'ltr' : 'rtl';
      lc.placeholder = { book: 'ج ١، ص ٤٥', tafsir: 'ج ٢١، ص ٨٦', ayah: 'سورة الجاثية', link: 'وصف الصفحة' }[refType];
    }
    else if (act === 'ref-del') { doc.refs = doc.refs.filter((r) => r.id !== t.dataset.ref); rerenderRefs(); dirty(false); QB.toast('حُذف المرجع.'); }
  }
  document.addEventListener('submit', (e) => {
    if (!e.target.matches('.dc-refform')) return;
    e.preventDefault();
    const nm = el.querySelector('#dc-ref-name'), lc = el.querySelector('#dc-ref-locus');
    const name = nm.value.trim();
    if (!name) { nm.focus(); QB.toast('اكتب اسم المرجع أولاً.'); return; }
    doc.refs.push({ id: QB.uid('r'), type: refType, name, locus: lc.value.trim() });
    rerenderRefs(); dirty(false);
    el.querySelector('#dc-ref-name')?.focus();
  });
  function rerenderRefs() {
    const keepType = refType;
    el.querySelector('#dc-refs').innerHTML = refsHTML();
    refType = 'book';
    el.querySelector(`[data-act="ref-type"][data-type="${keepType}"]`)?.click();
  }
  function gotoSec(id) {
    if (id === 'title') { const t = el.querySelector('.dc-title'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); return; }
    const target = id === 'refs' ? el.querySelector('#dc-refs') : el.querySelector(`#dc-s-${id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  }

  /* ---------------- Ayah picker «أضف آيات» ---------------- */
  function ayahPicker(target) {
    const picked = new Map();
    const inSec = new Set((target ? target.verses : []).map((v) => `${v.s}:${v.a}`));
    let tab = 'notebook', filter = '', q = '', mode = 'root', sur = 45, from = 14, to = 20;
    QB.sheet({ title: 'أضف آيات', width: 580, render: (b, close) => {
      b.classList.add('dc-sheetb');
      const item = (s, a, text, extra = '') => {
        const k = `${s}:${a}`, there = inSec.has(k), avail = !!text;
        return `<li><label class="dc-pick ${avail ? '' : 'off'}">
          <input type="checkbox" data-k="${k}" ${there || picked.has(k) ? 'checked' : ''} ${there || !avail ? 'disabled' : ''}>
          <span class="dc-pick-b"><span class="dc-pick-r">سورة ${QB.surah(s).name}، الآية ${n(a)}${extra}${there ? '<span class="pill mute">في القسم</span>' : ''}${avail ? '' : '<span class="pill mute">غير محمّلة</span>'}</span>
          ${avail ? `<span class="dc-pick-q q" lang="ar">${QB.words(text).slice(0, 14).join(' ')}${QB.words(text).length > 14 ? '…' : ''}</span>` : ''}</span></label></li>`;
      };
      const results = () => {
        if (tab === 'notebook') {
          const f = QB.strip(filter.trim());
          const rows = QB.state.notebook.filter((x) => {
            if (!f) return true;
            const txt = QB.strip(mushafText(x.s, x.a) || ''), nm = QB.strip(QB.surah(x.s).name), ths = x.themes.map((id) => QB.strip(QB.theme(id)?.name || '')).join(' ');
            return txt.includes(f) || nm.includes(f) || ths.includes(f) || toLatin(filter).trim() === `${x.s}:${x.a}`;
          });
          if (!QB.state.notebook.length) return '<p class="empty">لا آيات في الدفتر بعد. احفظ آية من القراءة أو من نتائج البحث.</p>';
          if (!rows.length) return '<p class="empty">لا آيات في الدفتر تطابق هذه التصفية.</p>';
          return `<ul class="list">${rows.map((x) => item(x.s, x.a, mushafText(x.s, x.a), x.themes.map((id) => { const th = QB.theme(id); return th ? `<span class="th-dot" style="--c:${QB.thColor(th.color)}" title="${esc(th.name)}"></span>` : ''; }).join(''))).join('')}</ul>`;
        }
        if (tab === 'search') {
          const raw = q.trim();
          if (!raw) return `<p class="empty">اكتب جذراً أو لفظاً. جذور لها قوائم في النموذج:</p><div class="chips">${QB.searchRoots().map((r) => `<button class="chip" data-try="${r}"><span class="letters">${QB.letters(r)}</span></button>`).join('')}</div>`;
          const hits = new Map(); let note = '';
          if (mode === 'root') {
            const root = QB.findRoot(raw) || QB.strip(raw.replace(/\s/g, ''));
            const list = QB.search(root);
            if (list) { list.verses.forEach((v) => hits.set(`${v.s}:${v.a}`, v)); note = `${n(list.verses.length)} آية محمّلة من ${n(list.verses_total || list.total)} لجذر «${QB.letters(root)}».`; }
            QB.pageNumbers.forEach((pn) => QB.page(pn).ayahs.forEach((v) => { if ((QB.morph(v.s, v.a) || []).some((w) => w.root && QB.strip(w.root) === QB.strip(root))) hits.set(`${v.s}:${v.a}`, v); }));
            if (!list && hits.size) note = `لهذا الجذر خريطة انتشار فقط في النموذج؛ هذه مواضعه في الصفحات المحمّلة.`;
          } else {
            // Uthmani spelling drops alefs and seats hamzas differently (بصٰٓئر); compare on a loose skeleton.
            const loose = (x) => QB.strip(x).replace(/ا/g, '').replace(/[ئؤء]/g, 'ء').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
            const k = loose(raw);
            QB.pageNumbers.forEach((pn) => QB.page(pn).ayahs.forEach((v) => { if (loose(v.text).includes(k)) hits.set(`${v.s}:${v.a}`, v); }));
            searchIndex().forEach((v, key) => { if (!hits.has(key) && loose(v.text).includes(k)) hits.set(key, v); });
            note = `${n(hits.size)} آية فيها «${esc(raw)}» من النص المحمّل.`;
          }
          if (!hits.size) return '<p class="empty">لا توجد نتائج لهذا البحث في النص المحمّل.</p>';
          const arr = [...hits.values()].sort((x, y) => x.s - y.s || x.a - y.a).slice(0, 60);
          return `<p class="label">${note}${hits.size > 60 ? ` تُعرض أول ${n(60)}.` : ''}</p><ul class="list">${arr.map((v) => item(v.s, v.a, v.text)).join('')}</ul>`;
        }
        // go
        const S = QB.surah(sur), max = S.ayahs || 1;
        const a1 = Math.max(1, Math.min(max, from)), a2 = Math.max(a1, Math.min(max, to, a1 + 39));
        const rows = []; for (let a = a1; a <= a2; a++) rows.push(item(sur, a, mushafText(sur, a)));
        return `<p class="label">سورة ${S.name}: ${n(max)} آية. ${to - a1 > 39 ? `يُعرض ${n(40)} آية على الأكثر في كل مرة. ` : ''}</p><ul class="list">${rows.join('')}</ul>`;
      };
      const draw = (focusSel) => {
        b.innerHTML = `
          <div class="tabs" role="tablist" aria-label="مصدر الآيات">${[['notebook', 'من الدفتر'], ['search', 'بحث'], ['go', 'انتقل']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
          ${target ? `<p class="label">تُضاف إلى قسم «${esc(target.title || KINDS[target.kind])}».</p>` : '<p class="label">تُضاف في قسم آيات جديد آخر البحث.</p>'}
          <div class="dc-pick-ctl">${tab === 'notebook' ? `<label class="field"><span>تصفية</span><input class="input" id="dc-pk-filter" value="${esc(filter)}" placeholder="سورة، أو موضوع، أو كلمة من الآية" autocomplete="off"></label>`
            : tab === 'search' ? `<div class="seg-ctl" role="group" aria-label="نوع البحث"><button data-mode="word" aria-pressed="${mode === 'word'}">لفظ</button><button data-mode="root" aria-pressed="${mode === 'root'}">جذر</button></div>
               <label class="field dc-grow"><span class="sr">${mode === 'root' ? 'الجذر' : 'اللفظ'}</span><input class="input" id="dc-pk-q" value="${esc(q)}" placeholder="${mode === 'root' ? 'جذر، مثلاً: بصر' : 'لفظ، مثلاً: بصائر'}" autocomplete="off" enterkeyhint="search"></label>`
            : `<label class="field dc-grow"><span>السورة</span><select class="select" id="dc-pk-s">${QB.data.index.map((x) => `<option value="${x.id}" ${x.id === sur ? 'selected' : ''}>${n(x.id)}. ${x.name}</option>`).join('')}</select></label>
               <label class="field dc-num"><span>من الآية</span><input class="input" id="dc-pk-from" type="number" min="1" max="${QB.surah(sur).ayahs}" value="${from}" inputmode="numeric"></label>
               <label class="field dc-num"><span>إلى</span><input class="input" id="dc-pk-to" type="number" min="1" max="${QB.surah(sur).ayahs}" value="${to}" inputmode="numeric"></label>`}</div>
          ${tab !== 'notebook' ? `<p class="dc-honest">${QB.ico('info', 'sm')}${LOADED_NOTE}</p>` : ''}
          <div class="dc-pick-list" id="dc-pk-res">${results()}</div>
          <div class="dc-pick-foot"><button class="cta" data-add ${picked.size ? '' : 'disabled'}>أضف إلى البحث${picked.size ? ` (${n(picked.size)})` : ''}</button><button class="quiet" data-cancel>إلغاء</button></div>`;
        b.querySelectorAll('[data-tab]').forEach((x) => x.addEventListener('click', () => { tab = x.dataset.tab; draw(); }));
        b.querySelectorAll('[data-mode]').forEach((x) => x.addEventListener('click', () => { mode = x.dataset.mode; draw('#dc-pk-q'); }));
        b.querySelectorAll('[data-try]').forEach((x) => x.addEventListener('click', () => { q = x.dataset.try; mode = 'root'; draw(); }));
        const live = (id, set) => { const inp = b.querySelector(id); if (!inp) return; inp.addEventListener('input', () => { set(inp.value); refresh(); }); };
        live('#dc-pk-filter', (v) => (filter = v));
        live('#dc-pk-q', (v) => (q = v));
        live('#dc-pk-from', (v) => (from = +toLatin(v) || 1));
        live('#dc-pk-to', (v) => (to = +toLatin(v) || 1));
        const ss = b.querySelector('#dc-pk-s'); if (ss) ss.addEventListener('change', () => { sur = +ss.value; from = 1; to = Math.min(QB.surah(sur).ayahs, 7); draw('#dc-pk-s'); });
        b.querySelector('[data-add]').addEventListener('click', () => {
          if (!picked.size) return;
          const add = [...picked.values()].map((v) => ({ s: v.s, a: v.a, text: v.text }));
          let dest = target;
          if (!dest) { dest = sec('ayat'); doc.sections.push(dest); }
          dest.verses.push(...add);
          close(); dirty(true);
          QB.toast(`أُضيفت ${n(add.length)} آية إلى البحث.`);
          requestAnimationFrame(() => el.querySelector(`#dc-s-${dest.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        });
        b.querySelector('[data-cancel]').addEventListener('click', close);
        wireChecks();
        if (focusSel) b.querySelector(focusSel)?.focus();
      };
      const wireChecks = () => b.querySelectorAll('#dc-pk-res input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
        const [s, a] = c.dataset.k.split(':').map(Number);
        if (c.checked) picked.set(c.dataset.k, { s, a, text: mushafText(s, a) }); else picked.delete(c.dataset.k);
        const add = b.querySelector('[data-add]'); add.disabled = !picked.size; add.textContent = `أضف إلى البحث${picked.size ? ` (${n(picked.size)})` : ''}`;
      }));
      const refresh = () => { b.querySelector('#dc-pk-res').innerHTML = results(); b.querySelectorAll('[data-try]').forEach((x) => x.addEventListener('click', () => { q = x.dataset.try; mode = 'root'; draw(); })); wireChecks(); };
      draw();
    } });
  }

  /* ---------------- Share studio «مشاركة البحث» ---------------- */
  function shareStudio(init = {}) {
    const vs = allVerses(doc).map((x) => x.v);
    const o = Object.assign({ art: 'doc', size: 'post', style: 'night', verse: vs[0] ? `${vs[0].s}:${vs[0].a}` : null, slide: 0, withNote: true }, init);
    const ARTS = [['doc', 'بطاقة البحث', 'card'], ['ayah', 'بطاقة آية', 'book'], ['slides', 'سلسلة شرائح', 'slides'], ['print', 'طباعة', 'printer'], ['pdf', 'PDF', 'doc']];
    const SIZES = [['post', 'منشور ٤:٥', 4 / 5], ['square', 'مربّع', 1], ['story', 'قصّة ٩:١٦', 9 / 16]];
    const slides = () => {
      const out = [{ kind: 'cover' }];
      doc.sections.forEach((s) => s.verses.forEach((v) => out.push({ kind: 'verse', v, s })));
      doc.sections.filter((s) => s.kind === 'question' && s.body.trim()).forEach((s) => out.push({ kind: 'question', s }));
      out.push({ kind: 'end' });
      return out;
    };
    // The card always quotes the Mushaf, never the draft's quotation.
    const verseBlock = (v, cls = '') => { const t = mushafText(v.s, v.a) || v.text; if (QB.words(t).length > 20) cls += ' long'; return `<blockquote class="dc-c-q ${cls}" lang="ar">﴿${t}<span class="marker"><i>${n(v.a)}</i></span>﴾</blockquote><p class="dc-c-ref">سورة ${QB.surah(v.s).name}، الآية ${n(v.a)}</p>`; };
    const brand = `<div class="dc-c-brand">${QB.mark(26)}<span>بصائر</span></div>`;
    const author = QB.signedIn() ? QB.state.user.name : 'باحث في بصائر';
    const cardInner = (list) => {
      if (o.art === 'doc') {
        const v = vs.find((x) => validRef(x.s, x.a)) || vs[0];
        return `${brand}<div class="dc-c-mid"><p class="dc-c-kick">بحث</p><h3 class="dc-c-title">${esc(doc.title || 'بلا عنوان')}</h3>${doc.summary ? `<p class="dc-c-sum">${esc(doc.summary)}</p>` : ''}${v ? verseBlock(v, 'sm') : ''}</div><p class="dc-c-foot">${esc(author)}، ${n(doc.sections.length)} قسم، ${n(vs.length)} آية${hasTafsir(doc) ? '<span class="dc-c-taf">فيه قراءة تفسيرية تجريبية</span>' : ''}</p>`;
      }
      if (o.art === 'ayah') {
        const [s, a] = (o.verse || '').split(':').map(Number);
        const v = vs.find((x) => x.s === s && x.a === a) || vs[0];
        return `${brand}<div class="dc-c-mid">${v ? verseBlock(v, 'lg') : '<p class="dc-c-sum">لا آيات في البحث بعد.</p>'}</div><p class="dc-c-foot">من بحث «${esc(doc.title || 'بلا عنوان')}»</p>`;
      }
      const sl = list[Math.min(o.slide, list.length - 1)];
      if (sl.kind === 'cover') return `${brand}<div class="dc-c-mid"><p class="dc-c-kick">بحث في ${n(list.length - 2)} شريحة</p><h3 class="dc-c-title">${esc(doc.title || 'بلا عنوان')}</h3>${doc.summary ? `<p class="dc-c-sum">${esc(doc.summary)}</p>` : ''}</div><p class="dc-c-foot">${esc(author)}</p>`;
      if (sl.kind === 'verse') return `${brand}<div class="dc-c-mid">${sl.s.title ? `<p class="dc-c-kick">${esc(sl.s.title)}</p>` : ''}${verseBlock(sl.v)}${o.withNote && sl.s.body.trim() ? `<p class="dc-c-note">${esc(sl.s.body.length > 150 ? sl.s.body.slice(0, 150) + '…' : sl.s.body)}</p>` : ''}</div><p class="dc-c-foot">${esc(doc.title)}</p>`;
      if (sl.kind === 'question') return `${brand}<div class="dc-c-mid"><p class="dc-c-kick">سؤال للتدبّر</p><h3 class="dc-c-title">${esc(sl.s.body)}</h3></div><p class="dc-c-foot">${esc(doc.title)}</p>`;
      return `<div class="dc-c-mid dc-c-end">${QB.mark(64)}<h3 class="dc-c-title">اقرأ البحث كاملاً في بصائر</h3><p class="dc-c-sum">${esc(doc.title)}</p></div>`;
    };
    const pagePreview = () => `<div class="dc-page ${o.style}" aria-label="معاينة الصفحة المطبوعة">
        <div class="dc-pg-head">${QB.mark(18)}<span>بصائر</span><span>الإصدار ${n(doc.version || 1)}</span></div>
        <h3 class="dc-pg-title">${esc(doc.title || 'بلا عنوان')}</h3>
        ${doc.summary ? `<p class="dc-pg-sum">${esc(doc.summary)}</p>` : ''}
        ${hasTafsir(doc) ? '<p class="dc-pg-taf">تنبيه: فيه قراءة تفسيرية تجريبية مولَّدة، ليست حُجَّة شرعية.</p>' : ''}
        ${doc.sections.map((s) => `${s.title ? `<h4>${esc(s.title)}</h4>` : ''}${s.verses.map((v) => `<p class="dc-pg-q" lang="ar">﴿${mushafText(v.s, v.a) || v.text}﴾ <small>${refName(v.s, v.a)}</small></p>`).join('')}${s.body ? `<p class="${s.kind === 'machine' ? 'dc-pg-m' : ''}">${s.kind === 'machine' ? '<b>جواب آلي: </b>' : s.kind === 'question' ? '<b>سؤال: </b>' : s.kind === 'note' ? '<b>ملاحظة: </b>' : ''}${esc(s.body)}</p>` : ''}`).join('')}
        ${doc.refs.length ? `<h4>المراجع</h4>${doc.refs.map((r) => `<p class="dc-pg-ref">${REF_TYPES[r.type]}: ${esc(r.name)}${r.locus ? `، ${esc(r.locus)}` : ''}</p>`).join('')}` : ''}
      </div>`;
    QB.sheet({ title: 'مشاركة البحث', width: 620, render: (b, close) => {
      b.classList.add('dc-sheetb');
      const draw = () => {
        const list = slides();
        o.slide = Math.min(o.slide, list.length - 1);
        const paged = o.art === 'print' || o.art === 'pdf';
        const ar = (SIZES.find((x) => x[0] === o.size) || SIZES[0])[2];
        b.innerHTML = `
          <div class="dc-sh-row" role="group" aria-label="ما تشاركه"><div class="chips">${ARTS.map(([k, l, ic]) => `<button class="chip" data-art="${k}" aria-pressed="${o.art === k}">${QB.ico(ic, 'sm')}${l}</button>`).join('')}</div></div>
          <div class="dc-sh-opts">
            ${paged ? '<span class="label">صفحة A4 عمودية</span>' : `<div class="seg-ctl" role="group" aria-label="المقاس">${SIZES.map(([k, l]) => `<button data-size="${k}" aria-pressed="${o.size === k}">${l}</button>`).join('')}</div>`}
            <div class="seg-ctl" role="group" aria-label="النمط">${[['night', 'ليلي'], ['paper', 'ورقي']].map(([k, l]) => `<button data-style="${k}" aria-pressed="${o.style === k}">${l}</button>`).join('')}</div>
            ${o.art === 'ayah' && vs.length ? `<label class="field dc-sh-verse"><span class="sr">الآية</span><select class="select" id="dc-sh-v">${vs.map((v) => `<option value="${v.s}:${v.a}" ${o.verse === `${v.s}:${v.a}` ? 'selected' : ''}>${refName(v.s, v.a)}</option>`).join('')}</select></label>` : ''}
          </div>
          <div class="dc-stage">
            ${paged ? pagePreview() : `<div class="dc-card ${o.style}" style="--arw:${ar}" role="img" aria-label="معاينة ${ARTS.find((x) => x[0] === o.art)[1]}">${QB.girih('dc-c-rose')}${cardInner(list)}</div>`}
          </div>
          ${o.art === 'slides' ? `<div class="dc-slidenav">
              <button class="icon-btn" data-slide="-1" ${o.slide === 0 ? 'disabled' : ''} aria-label="الشريحة السابقة">${QB.ico('chevR', 'sm')}</button>
              <span class="dc-dots" aria-hidden="true">${list.map((_, k) => `<i class="${k === o.slide ? 'on' : ''}"></i>`).join('')}</span>
              <span class="label" role="status">الشريحة ${n(o.slide + 1)} من ${n(list.length)}</span>
              <button class="icon-btn" data-slide="1" ${o.slide >= list.length - 1 ? 'disabled' : ''} aria-label="الشريحة التالية">${QB.ico('chevL', 'sm')}</button>
            </div>
            <label class="dc-check"><button type="button" class="switch" role="switch" id="dc-sh-note" aria-checked="${o.withNote}" aria-label="مع ملاحظة القسم"></button><span>مع ملاحظة القسم</span></label>` : ''}
          ${vs.some((v) => verseProblem(v) === 'mismatch') ? `<p class="dc-honest">${QB.ico('info', 'sm')}تقتبس البطاقات نص المصحف دائماً، لا الاقتباس المعلَّم في البحث.</p>` : ''}
          <div class="dc-sh-acts">
            ${paged ? `<button class="cta" data-do="print">${QB.ico('printer', 'sm')}طباعة / حفظ PDF</button>`
              : `<button class="cta" data-do="share">${QB.ico('share', 'sm')}مشاركة</button>${o.art === 'slides' ? `<button class="ghost" data-do="zip">${QB.ico('download', 'sm')}تنزيل ZIP</button>` : ''}`}
            <button class="quiet" data-do="close">إغلاق</button>
          </div>
          <p class="dc-honest">${QB.ico('info', 'sm')}المعاينة حيّة؛ لا تُنشأ ملفات ولا تُنزَّل في هذا النموذج.</p>`;
        b.querySelectorAll('[data-art]').forEach((x) => x.addEventListener('click', () => { o.art = x.dataset.art; draw(); b.querySelector(`[data-art="${o.art}"]`).focus(); }));
        b.querySelectorAll('[data-size]').forEach((x) => x.addEventListener('click', () => { o.size = x.dataset.size; draw(); b.querySelector(`[data-size="${o.size}"]`).focus(); }));
        b.querySelectorAll('[data-style]').forEach((x) => x.addEventListener('click', () => { o.style = x.dataset.style; draw(); b.querySelector(`[data-style="${o.style}"]`).focus(); }));
        b.querySelectorAll('[data-slide]').forEach((x) => x.addEventListener('click', () => { o.slide += +x.dataset.slide; draw(); (b.querySelector(`[data-slide="${x.dataset.slide}"]:not([disabled])`) || b.querySelector('[data-slide]:not([disabled])'))?.focus(); }));
        const sv = b.querySelector('#dc-sh-v'); if (sv) sv.addEventListener('change', () => { o.verse = sv.value; draw(); b.querySelector('#dc-sh-v').focus(); });
        const sn = b.querySelector('#dc-sh-note'); if (sn) sn.addEventListener('click', () => { o.withNote = !o.withNote; draw(); b.querySelector('#dc-sh-note').focus(); });
        b.querySelectorAll('[data-do]').forEach((x) => x.addEventListener('click', () => {
          const d = x.dataset.do;
          if (d === 'close') close();
          else if (d === 'share') QB.toast(o.art === 'slides' ? `في التطبيق تُشارَك ${n(list.length)} شرائح صوراً؛ هذا النموذج يعرضها فقط.` : 'في التطبيق تُشارَك البطاقة صورةً؛ هذا النموذج يعرضها فقط.');
          else if (d === 'zip') QB.toast(`في التطبيق يُنزَّل ملف ZIP فيه ${n(list.length)} شرائح؛ لا تنزيل في هذا النموذج.`);
          else if (d === 'print') QB.toast('في التطبيق يفتح مربّع الطباعة لتطبع أو تحفظ PDF؛ لا طباعة في هذا النموذج.');
        }));
      };
      draw();
    } });
  }

  /* ---------------- Publish «نشر في المجتمع» ---------------- */
  function publishSheet() {
    QB.sheet({ title: 'نشر في المجتمع', width: 520, render: (b, close) => {
      b.classList.add('dc-sheetb');
      if (!QB.signedIn()) {
        b.innerHTML = `<div class="dc-pub-guest">${QB.mark(48)}<p class="lede">سجّل الدخول لتنشر في المجتمع.</p><p class="label">يبقى البحث في دفترك على هذا الجهاز، ويُضمّ إلى حسابك حين تنشئه.</p><button class="cta" data-g>تسجيل الدخول</button></div>`;
        b.querySelector('[data-g]').addEventListener('click', () => { close(); setTimeout(() => QB.requireAccount('النشر في المجتمع', null, 'يتطلّب'), 240); });
        return;
      }
      let vis = doc.visibility || 'public', agreed = false;
      const machine = hasMachine(doc), tafsir = hasTafsir(doc);
      const form = () => {
        b.innerHTML = `
          <div class="dc-pub-doc"><span class="kicker">بحث</span><b class="h3">${esc(doc.title || 'بلا عنوان')}</b><small class="label">${n(doc.sections.length)} قسم، ${n(allVerses(doc).length)} آية، الإصدار ${n(doc.version || 1)}</small>
            ${doc.postId ? '<p class="dc-honest">نُشر هذا البحث من قبل؛ النشر الآن يحدّث المنشور بالإصدار الحالي.</p>' : ''}</div>
          <fieldset class="dc-vis"><legend class="h3">من يرى البحث</legend>
            ${[['public', 'عامّ', 'يظهر في موجز المجتمع وفي البحث.', 'globe'], ['link', 'برابط فقط', 'لا يظهر في الموجز؛ يراه من معه الرابط.', 'link2']].map(([k, l, d, ic]) => `<label class="dc-radio"><input type="radio" name="dc-vis" value="${k}" ${vis === k ? 'checked' : ''}><span class="dc-radio-i">${QB.ico(ic, 'sm')}</span><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
          </fieldset>
          <div><h3 class="h3">ما يحدث بعد الضغط</h3>
            <ol class="dc-steps">
              <li><b>فحص آلي</b><span>مطابقة نصوص الآيات للمصحف، وصحّة المراجع، والعنوان والمحتوى.</span></li>
              <li><b>مراجعة المشرفين</b><span>${machine || tafsir ? 'في بحثك أقسام مولَّدة آلياً' + (tafsir ? ' وقراءة تفسيرية' : '') + '، فيراجعه مشرف قبل ظهوره.' : 'لا تلزم في بحثك: لا محتوى آلياً ولا قراءة تفسيرية.'}</span></li>
              <li><b>الظهور في المجتمع</b><span>${vis === 'link' ? 'برابط فقط، تشاركه أنت.' : 'في الموجز، مع اسمك وتاريخ النشر.'}</span></li>
            </ol></div>
          <label class="dc-agree"><input type="checkbox" id="dc-agree" ${agreed ? 'checked' : ''}><span>قرأتُ إرشادات المجتمع وألتزم بها، وأتحمّل مسؤولية ما أنشر.</span></label>
          <div class="dc-sh-acts"><button class="cta" data-pub ${agreed ? '' : 'disabled'}>${QB.ico('send', 'sm')}انشر البحث</button><button class="quiet" data-x>إلغاء</button></div>`;
        b.querySelectorAll('input[name=dc-vis]').forEach((r) => r.addEventListener('change', () => { vis = r.value; form(); b.querySelector(`input[value="${vis}"]`).focus(); }));
        b.querySelector('#dc-agree').addEventListener('change', (e) => { agreed = e.target.checked; b.querySelector('[data-pub]').disabled = !agreed; });
        b.querySelector('[data-x]').addEventListener('click', close);
        b.querySelector('[data-pub]').addEventListener('click', () => {
          const btn = b.querySelector('[data-pub]'); btn.disabled = true; btn.innerHTML = '<span class="dc-spin" aria-hidden="true"></span>جارٍ الفحص…';
          b.querySelectorAll('input').forEach((x) => (x.disabled = true));
          setTimeout(() => outcome(vis), 1200);
        });
      };
      const outcome = (vis) => {
        const A = audit(doc);
        if (A.problems.length) {
          b.innerHTML = `<div class="dc-out warn"><span class="dc-out-i">${QB.ico('alert')}</span><h3 class="h2">يحتاج البحث إلى تعديل قبل النشر</h3>
            <ul class="dc-out-list">${A.problems.map((c) => `<li><b>${c.label}</b><small>${c.detail}</small></li>`).join('')}</ul>
            <button class="cta" data-back>عودة إلى البحث</button></div>`;
          b.querySelector('[data-back]').addEventListener('click', () => { close(); const go = A.problems.find((c) => c.go); if (go) gotoSec(go.go); else el.querySelector('[data-act=readiness]').click(); });
          return;
        }
        const review = tafsir || machine;
        const posts = QB.state.posts || (QB.state.posts = []);
        const vsAll = allVerses(doc).map((x) => ({ s: x.v.s, a: x.v.a }));
        const fields = { docId: doc.id, title: doc.title, summary: doc.summary || '', author: QB.state.user.name, at: QB.today.toISOString(), status: review ? 'review' : 'published', visibility: vis, mode: tafsir ? 'tafsir' : 'strict', verses: vsAll, board: !!doc.boardId, mine: true };
        let post = doc.postId ? posts.find((p) => p.id === doc.postId) : null;
        if (post) Object.assign(post, fields);
        else { post = Object.assign({ id: QB.uid('p'), tags: [], likes: 0, comments: [], saved: false }, fields); posts.unshift(post); }
        doc.postId = post.id; doc.status = post.status; doc.visibility = vis;
        QB.emit('posts', { id: post.id }); QB.emit('documents', { id: doc.id });
        b.innerHTML = `<div class="dc-out ${review ? 'info' : 'ok'}"><span class="dc-out-i">${QB.ico(review ? 'clock' : 'check')}</span>
          <h3 class="h2">${review ? 'أُرسل البحث للمراجعة' : 'نُشر البحث'}</h3>
          <p class="lede">${review ? 'يراجع المشرفون بحثك قبل ظهوره في المجتمع، لأن فيه ' + (tafsir ? 'قراءة تفسيرية تجريبية' : 'أقساماً مولَّدة آلياً') + '. ستجده في «منشوراتي» بحالة «قيد المراجعة».' : vis === 'link' ? 'البحث متاح برابط فقط. انسخ الرابط من المنشور وشاركه.' : 'البحث في موجز المجتمع الآن.'}</p>
          <div class="dc-sh-acts"><button class="cta" data-open>افتح المنشور</button><button class="quiet" data-x>عودة إلى البحث</button></div></div>`;
        b.querySelector('[data-open]').addEventListener('click', () => QB.go('post', { id: post.id }));
        b.querySelector('[data-x]').addEventListener('click', () => { close(); render(); });
      };
      form();
    } });
  }
})();
