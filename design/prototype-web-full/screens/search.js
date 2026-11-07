/* Search (لوحة المطابقة) and the root heatmap (خريطة انتشار الجذر).
   Prefixes: sr- (concordance panel), srh- (heatmap). Owner: screens/search.* */
(() => {
  const { n, esc } = QB;
  const PER_PAGE = 10;

  QB.icons.history = '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><path d="M12 8v4.2l2.8 1.8"/>';
  QB.icons.pin = '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>';
  QB.icons.pinOn = '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" fill="currentColor"/><path d="M12 14v6"/>';
  QB.icons.chevR = QB.icons.chevR || '<path d="M10 6l6 6-6 6"/>';

  /* ---------------- Text matching (lexical search) ---------------- */
  // Rasm-level normalisation: dagger alef becomes alef (صِرَٰط → صراط), marks go, ى/ي and ة/ه fold.
  const norm = (s) => QB.strip(String(s || '').replace(/ىٰ/g, 'ى').replace(/ٰ/g, 'ا'))
    .replace(/[ىي]/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء').replace(/[^ء-ي]/g, '');
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = (q) => new RegExp(`^(?:[وف])?(?:[بكل])?(?:ال|ل)?${reEsc(q)}$`);

  // Every verse text the prototype holds: the loaded pages and the loaded search lists.
  let corpus = null;
  const getCorpus = () => {
    if (corpus) return corpus;
    const map = new Map();
    const add = (v) => { const k = `${v.s}:${v.a}`; if (!map.has(k)) map.set(k, { s: v.s, a: v.a, text: v.text.trim(), name: v.name || QB.surah(v.s).name }); };
    QB.pageNumbers.forEach((p) => (QB.page(p)?.ayahs || []).forEach(add));
    QB.searchRoots().forEach((r) => (QB.search(r)?.verses || []).forEach(add));
    corpus = [...map.values()].sort((x, y) => x.s - y.s || x.a - y.a);
    corpus.forEach((v) => { v.toks = QB.words(v.text).map(norm); });
    return corpus;
  };
  const lexGroup = (term, phrase) => {
    const qt = (phrase ? term.split(/\s+/) : [term]).map(norm).filter(Boolean);
    if (!qt.length) return null;
    const res = qt.map(matcher);
    const verses = [], counts = new Array(114).fill(0);
    let total = 0;
    getCorpus().forEach((v) => {
      const hl = [];
      for (let i = 0; i + qt.length <= v.toks.length; i++) {
        if (res.every((re, j) => re.test(v.toks[i + j]))) { for (let j = 0; j < qt.length; j++) hl.push(i + j + 1); total += 1; counts[v.s - 1] += 1; }
      }
      if (hl.length) verses.push({ s: v.s, a: v.a, name: v.name, text: v.text, hl });
    });
    return { key: `lex:${term}`, label: term, kind: 'lex', total, versesTotal: verses.length, surahs: counts.filter(Boolean).length, counts, verses };
  };
  // A root without a loaded list: its occurrences on the loaded pages, from their morphology.
  const morphVerses = (root) => {
    const out = [];
    QB.pageNumbers.forEach((p) => (QB.page(p)?.ayahs || []).forEach((v) => {
      const m = QB.morph(v.s, v.a) || [];
      const hl = m.map((w, i) => (w.root === root ? i + 1 : 0)).filter(Boolean);
      if (hl.length) out.push({ s: v.s, a: v.a, name: QB.surah(v.s).name, text: v.text.trim(), hl });
    }));
    return out.sort((x, y) => x.s - y.s || x.a - y.a);
  };
  const rootGroup = (root) => {
    const sr = QB.search(root), sp = QB.spread(root);
    if (sr) {
      const counts = sp ? sp.counts : (() => { const c = new Array(114).fill(0); sr.verses.forEach((v) => (c[v.s - 1] += v.hl.length)); return c; })();
      return { key: `root:${root}`, label: root, root, kind: 'root', total: sr.total, versesTotal: sr.verses_total, surahs: sr.surahs, counts,
        verses: sr.verses.map((v) => ({ s: v.s, a: v.a, name: v.name, text: v.text.trim(), hl: v.hl })),
        partial: sr.verses.length < sr.verses_total ? { loaded: sr.verses.length, of: sr.verses_total } : null };
    }
    if (sp) return { key: `root:${root}`, label: root, root, kind: 'root', total: sp.total, versesTotal: null, surahs: sp.surahs, counts: sp.counts, verses: morphVerses(root), spreadOnly: true };
    return null;
  };
  // Closest roots by edit distance on the bare letters.
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const suggest = (q) => {
    const k = norm(q.replace(/\s/g, ''));
    if (!k) return [];
    return QB.allRoots().map((r) => [r, lev(norm(r), k)]).filter(([, d]) => d <= 2).sort((x, y) => x[1] - y[1] || (QB.spread(y[0])?.total || 0) - (QB.spread(x[0])?.total || 0)).slice(0, 4).map(([r]) => r);
  };

  /* ---------------- Concordance state ---------------- */
  const EXAMPLES = [{ q: 'الحمد', mode: 'word' }, { q: 'صراط مستقيم', mode: 'phrase' }, { q: 'كتب', mode: 'root' }];
  const MODES = [['root', 'جذر'], ['word', 'كلمة'], ['phrase', 'عبارة']];
  const modeOf = (m) => (m === 'exact' || m === 'word' ? 'word' : m === 'phrase' ? 'phrase' : 'root');
  const S = { q: '', mode: 'root', status: 'empty', groups: [], note: '', suggest: [], surah: null, form: null, pages: {}, selected: null, token: 0 };
  let panel = null, recNow = null;

  const compute = () => {
    const q = S.q.trim();
    S.groups = []; S.note = ''; S.suggest = [];
    if (S.mode === 'root') {
      const root = QB.findRoot(q);
      const g = root && rootGroup(root);
      if (g) { S.groups = [g]; S.status = 'ready'; return; }
      // Not a root the prototype knows: look for the word itself.
      const words = q.split(/\s+/).filter(Boolean);
      const lex = words.length > 1 ? [lexGroup(q, true)] : [lexGroup(q, false)];
      if (lex[0] && lex[0].total) { S.mode = words.length > 1 ? 'phrase' : 'word'; S.groups = lex; S.note = `«${esc(q)}» ليس جذراً في بيانات هذا النموذج، فبحثنا عنه لفظاً.`; S.status = 'ready'; return; }
    } else if (S.mode === 'phrase') {
      const g = lexGroup(q, true);
      if (g && g.total) { S.groups = [g]; S.status = 'ready'; return; }
    } else {
      const words = [...new Set(q.split(/\s+/).filter(Boolean))];
      S.groups = words.map((w) => lexGroup(w, false)).filter((g) => g && g.total);
      if (S.groups.length) { S.status = 'ready'; return; }
    }
    S.status = 'none'; S.suggest = suggest(q);
  };
  const run = (q, mode) => {
    S.q = String(q || '').trim(); S.mode = modeOf(mode); S.surah = null; S.form = null; S.pages = {}; S.selected = null;
    if (!S.q) { S.status = 'empty'; render(); QB.setTitle(); return; }
    S.status = 'loading'; render(); QB.setTitle();
    const tok = ++S.token;
    setTimeout(() => { if (tok !== S.token) return; compute(); render(); QB.setTitle(); }, 300);
  };
  const reset = () => { S.token++; Object.assign(S, { q: '', status: 'empty', groups: [], note: '', suggest: [], surah: null, form: null, pages: {}, selected: null }); render(); QB.setTitle(); };

  // Combined figures for the summary.
  const sum = () => {
    const g = S.groups;
    const counts = new Array(114).fill(0);
    g.forEach((x) => x.counts.forEach((c, i) => (counts[i] += c)));
    return {
      total: g.reduce((t, x) => t + x.total, 0),
      verses: g.some((x) => x.versesTotal == null) ? null : g.reduce((t, x) => t + x.versesTotal, 0),
      surahs: g.length === 1 ? g[0].surahs : counts.filter(Boolean).length,
      counts,
    };
  };
  const root = () => (S.groups.length === 1 && S.groups[0].kind === 'root' ? S.groups[0].root : null);
  const formKey = (v, k) => norm(QB.words(v.text)[k - 1] || '');
  const filtered = (g, ignoreForm) => g.verses.filter((v) => (S.surah == null || v.s === S.surah + 1) && (ignoreForm || !S.form || v.hl.some((k) => formKey(v, k) === S.form)));

  /* ---------------- Concordance rendering ---------------- */
  const head = () => {
    const r = root(), t = sum();
    const meta = S.status === 'ready'
      ? (t.verses != null ? `${n(t.total)} موضع، ${n(t.verses)} آية` : `${n(t.total)} موضع، ${n(t.surahs)} سورة`)
      : S.status === 'loading' ? 'جارٍ البحث…' : S.status === 'none' ? 'لا نتائج' : 'اكتب جذراً أو كلمة في شريط الأوامر';
    return `<header class="sr-head">
      <div class="sr-head-t">
        <div class="kicker">المطابقة</div>
        <h2 class="h2">${S.q ? (r ? esc(r) : `«${esc(S.q)}»`) : 'البحث'}</h2>
        <div class="label" id="sr-meta">${meta}</div>
      </div>
      <div class="sr-head-acts">
        ${S.q ? `<button class="icon-btn" data-act="reset" aria-label="مسح البحث وبدء بحث جديد" title="بحث جديد">${QB.ico('history', 'sm')}</button>` : ''}
        ${QB.room.toggleButton()}
        <button class="icon-btn" data-act="close" aria-label="إغلاق لوحة المطابقة" title="إغلاق">${QB.ico('x', 'sm')}</button>
      </div>
    </header>
    <form class="sr-ask" id="sr-form" role="search">
      <div class="seg-ctl" role="group" aria-label="نوع البحث">${MODES.map(([k, l]) => `<button type="button" data-act="mode" data-mode="${k}" aria-pressed="${S.mode === k}">${l}</button>`).join('')}</div>
      <label class="sr" for="sr-input">عبارة البحث</label>
      <input class="input" id="sr-input" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search" placeholder="${{ root: 'جذر، مثل: بصر', word: 'كلمة، مثل: الحمد', phrase: 'عبارة، مثل: صراط مستقيم' }[S.mode]}">
      <button class="ghost sm" type="submit">ابحث</button>
    </form>`;
  };

  const emptyState = () => `<div class="sr-empty">
      <div class="sr-water" aria-hidden="true">ب · ص · ر</div>
      <span class="sr-empty-ico">${QB.ico('search')}</span>
      <p class="lede">اكتب جذراً أو كلمة قرآنية في شريط الأوامر بالأعلى ↑ لتبدأ البحث.</p>
      <div class="sr-try"><span class="label">جرّب</span>${EXAMPLES.map((x) => `<button class="chip" data-act="try" data-q="${x.q}" data-mode="${x.mode}">${x.q}</button>`).join('')}</div>
      <p class="label sr-avail">قوائم الآيات الكاملة في هذا النموذج لجذور: ${QB.searchRoots().map((r) => `<button class="link" data-act="try" data-q="${r}" data-mode="root">${r}</button>`).join('، ')}.</p>
    </div>`;

  const skeleton = () => `<div class="sr-skel-sum" aria-hidden="true"></div>${[0, 1, 2].map(() => '<div class="sr-skel" aria-hidden="true"><i></i><i></i><i></i></div>').join('')}<span class="sr" role="status">جارٍ البحث…</span>`;

  const noResults = () => `<div class="sr-none" role="status">
      <p class="lede">لا توجد نتائج لهذا البحث.</p>
      ${S.suggest.length ? `<div class="sr-try"><span class="label">هل تقصد:</span>${S.suggest.map((r) => `<button class="chip" data-act="try" data-q="${r}" data-mode="root"><b class="letters">${QB.letters(r)}</b></button>`).join('')}</div>` : ''}
      <p class="label">في هذا النموذج: البحث بالجذر لـ${n(QB.allRoots().length)} جذراً، والبحث اللفظي في الصفحات المحمّلة (${n(1)}، ${n(2)}، ${n(499)}–${n(501)}) ونتائج الجذور المحمّلة.</p>
    </div>`;

  const summary = () => {
    const r = root(), t = sum();
    const g0 = S.groups[0];
    const followed = r && QB.state.followedRoots.includes(r);
    const lex = g0.kind === 'lex';
    return `<section class="sr-sum" aria-label="ملخّص البحث">
      <div class="sr-sum-id">
        ${r ? `<div class="letters sr-big" aria-label="${esc(r)}">${[...r].map((l, i) => `<span style="--w:${i}">${l}</span>`).join(' ')}</div>` : `<div class="sr-big-q q">${esc(S.q)}</div>`}
        <div class="sr-gloss"><span class="pill teal">${lex ? 'بحث لفظي' : 'جذر قرآني'}</span><span class="label">${S.groups.length === 1 ? 'مجموعة واحدة' : `${n(S.groups.length)} مجموعات`}</span></div>
      </div>
      <div class="figures sr-figs">
        <div><b>${n(t.total)}</b><span>موضع</span></div>
        ${t.verses != null ? `<div><b>${n(t.verses)}</b><span>آية</span></div>` : ''}
        <div><b>${n(t.surahs)}</b><span>سورة</span></div>
      </div>
      ${r ? `<div class="sr-sum-acts">
        <button class="ghost sm" data-act="follow" aria-pressed="${followed}" id="sr-follow">${QB.ico(followed ? 'check' : 'plus', 'sm')}${followed ? 'جذر مُتابَع' : 'تابِع هذا الجذر'}</button>
        <button class="quiet" data-act="heatmap">${QB.ico('grid', 'sm')}خريطة انتشار الجذر</button>
      </div>` : ''}
    </section>
    ${S.note ? `<p class="sr-calm">${S.note}</p>` : ''}
    ${lex ? `<p class="sr-calm">بحث لفظي في الآيات المحمّلة في هذا النموذج: صفحات ${n(1)}، ${n(2)}، ${n(499)}–${n(501)} وقوائم الجذور العشرة. في التطبيق يشمل المصحف كله.</p>` : ''}
    ${g0.partial ? `<p class="sr-calm">حُمّلت أول ${n(g0.partial.loaded)} آية من ${n(g0.partial.of)} في هذا النموذج.</p>` : ''}
    ${g0.spreadOnly ? `<p class="sr-calm">الأرقام والشريط حقيقية لهذا الجذر. قائمة آياته الكاملة غير محمّلة في هذا النموذج، فنعرض مواضعه في الصفحات المحمّلة${g0.verses.length ? '' : '، ولا يرد فيها'}.</p>` : ''}
    <section class="sr-rib" aria-label="الانتشار في السور">
      ${QB.ribbon(t.counts, { live: true, grow: true, id: 'sr-rib', label: 'المس سورة أو اسحب على الشريط لتصفية المواضع' })}
      <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="sr-read" aria-live="polite"></span><span>${QB.data.names[113]}</span></div>
    </section>`;
  };

  const verseRow = (v, g) => {
    const key = `${v.s}:${v.a}`;
    const pinned = !!QB.noteOf(v.s, v.a);
    const playing = recNow && recNow.s === v.s && recNow.a === v.a && QB.player.state.playing;
    const hl = new Set(v.hl);
    const text = QB.words(v.text).map((w, i) => (hl.has(i + 1) ? `<mark class="hit">${w}</mark>` : w)).join(' ');
    return `<li><div class="sr-row${S.selected === key ? ' on' : ''}" role="button" tabindex="0" data-act="verse" data-s="${v.s}" data-a="${v.a}" aria-label="سورة ${QB.surah(v.s).name}، الآية ${n(v.a)}: افتحها في المصحف">
      <div class="sr-vmeta">
        <span class="sr-sname">سورة ${v.name || QB.surah(v.s).name}</span>
        <span class="sr-ref" dir="ltr">${n(v.s)}:${n(v.a)}</span>
        <span class="sr-acts">
          <button class="icon-btn sr-mini${playing ? ' on' : ''}" data-act="play" data-s="${v.s}" data-a="${v.a}" data-g="${esc(g.key)}" aria-pressed="${!!playing}" aria-label="${playing ? 'إيقاف' : 'تلاوة الآية'}" title="تلاوة الآية">${QB.ico(playing ? 'pause' : 'play', 'sm fill')}</button>
          <button class="icon-btn sr-mini${pinned ? ' on' : ''}" data-act="pin" data-s="${v.s}" data-a="${v.a}" aria-pressed="${pinned}" aria-label="${pinned ? 'مثبّت في الدفتر' : 'ثبّت في الدفتر'}" title="${pinned ? 'مثبّت في الدفتر' : 'ثبّت في الدفتر'}">${QB.ico(pinned ? 'pinOn' : 'pin', 'sm')}</button>
        </span>
      </div>
      <p class="sr-vtext" lang="ar">${text}</p>
    </div></li>`;
  };

  const groupBlock = (g) => {
    const list = filtered(g);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const p = Math.min(S.pages[g.key] || 1, pages);
    const slice = list.slice((p - 1) * PER_PAGE, p * PER_PAGE);
    let body;
    if (!list.length) {
      if (S.surah != null) {
        const c = g.counts[S.surah] || 0;
        body = c ? `<p class="empty">${n(c)} موضع في سورة ${QB.data.names[S.surah]}، ولم تُحمَّل آياتها في هذا النموذج. في التطبيق تُحمَّل عند الاختيار.</p>`
          : `<p class="empty">لم يرد ${g.kind === 'root' ? 'الجذر' : 'اللفظ'} في سورة ${QB.data.names[S.surah]}. اختر سورة مضيئة على الشريط.</p>`;
      } else if (S.form) body = '<p class="empty">لا آيات بهذه الصيغة في هذه المجموعة.</p>';
      else body = `<p class="empty">لا يرد ${g.kind === 'root' ? 'هذا الجذر' : 'هذا اللفظ'} في الصفحات المحمّلة. جرّب جذراً بقائمة كاملة: ${QB.searchRoots().slice(0, 5).map((r) => `<button class="link" data-act="try" data-q="${r}" data-mode="root">${r}</button>`).join('، ')}.</p>`;
    } else body = `<ul class="list sr-list">${slice.map((v) => verseRow(v, g)).join('')}</ul>`;
    return `<section class="sr-group" data-gkey="${esc(g.key)}">
      ${S.groups.length > 1 ? `<div class="sr-gk"><span class="kicker">«${esc(g.label)}»</span><span class="label">${n(g.total)} موضع</span></div>` : ''}
      ${body}
      ${pages > 1 ? `<nav class="sr-pager" aria-label="صفحات النتائج">
        <button class="quiet" data-act="page" data-g="${esc(g.key)}" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''}>${QB.ico('chevR', 'sm')}السابق</button>
        <span class="label" dir="ltr">${n(p)} / ${n(pages)}</span>
        <button class="quiet" data-act="page" data-g="${esc(g.key)}" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''}>التالي${QB.ico('chevL', 'sm')}</button>
      </nav>` : ''}
    </section>`;
  };

  const facet = () => {
    const forms = new Map();
    S.groups.forEach((g) => filtered(g, true).forEach((v) => v.hl.forEach((k) => {
      const w = QB.words(v.text)[k - 1]; if (!w) return;
      const f = norm(w); if (!f) return;
      const o = forms.get(f) || { n: 0, shown: w.replace(/[ۖ-ۭ]/g, '') }; o.n += 1; forms.set(f, o);
    })));
    if (S.form && !forms.has(S.form)) forms.set(S.form, { n: 0, shown: S.form });
    const list = [...forms.entries()].sort((a, b) => b[1].n - a[1].n);
    const loaded = S.groups.reduce((t, g) => t + g.verses.length, 0);
    if (list.length < 2 && !S.form) return '';
    return `<h3 class="sr-fh">الصيغ في النتائج المحمّلة</h3>
      <ul class="sr-forms${S.formsAll ? ' all' : ''}">${list.map(([f, o]) => `<li><button data-act="form" data-form="${esc(f)}" aria-pressed="${S.form === f}"><bdi class="q">${o.shown}</bdi><span>${n(o.n)}</span></button></li>`).join('')}</ul>
      ${list.length > 8 ? `<button class="link sr-fmore" data-act="forms-all" aria-expanded="${!!S.formsAll}">${S.formsAll ? 'أقلّ' : `كل الصيغ (${n(list.length)})`}</button>` : ''}
      <p class="sr-fnote">محسوبة من الكلمات المظلَّلة في ${n(loaded)} آية محمّلة${S.surah != null ? `، داخل سورة ${QB.data.names[S.surah]}` : ''}.</p>`;
  };

  const filterBar = () => {
    const shown = S.groups.reduce((t, g) => t + filtered(g).length, 0);
    const chips = [];
    if (S.surah != null) chips.push(`<button class="chip" aria-pressed="true" data-act="clear-surah" aria-label="أزل تصفية سورة ${QB.data.names[S.surah]}">سورة ${QB.data.names[S.surah]}${QB.ico('x', 'sm')}</button>`);
    if (S.form) chips.push(`<button class="chip" aria-pressed="true" data-act="clear-form" aria-label="أزل تصفية الصيغة">صيغة <bdi class="q">${esc(S.formLabel || S.form)}</bdi>${QB.ico('x', 'sm')}</button>`);
    return `<div class="sr-fbar">${chips.length ? `<div class="chips">${chips.join('')}</div>` : '<span class="label">كل المواضع المحمّلة، بترتيب المصحف</span>'}<span class="label">${n(shown)} آية</span></div>`;
  };

  function render() {
    if (!panel) return;
    let body = '';
    if (S.status === 'empty') body = emptyState();
    else if (S.status === 'loading') body = skeleton();
    else if (S.status === 'none') body = noResults();
    else body = `${summary()}<div class="sr-body"><aside class="sr-facet" id="sr-facet" aria-label="الصيغ"></aside><div class="sr-res"><div id="sr-fbar"></div><div id="sr-groups"></div></div></div>`;
    panel.innerHTML = `<div class="sr-wrap"><div class="sr-screen">${head()}<div class="sr-main">${body}</div></div></div>`;
    if (S.status === 'ready') {
      const t = sum();
      QB.wireRibbon(panel.querySelector('#sr-rib'), panel.querySelector('#sr-read'),
        (i) => `${QB.data.names[i]}: ${n(t.counts[i])} موضع`,
        (i) => { if (i === S.surah) return; S.surah = i; S.pages = {}; paint(); },
        () => (S.surah == null ? 'المس سورة أو اسحب على الشريط لتصفية المواضع' : `${QB.data.names[S.surah]}: ${n(t.counts[S.surah])} موضع`));
      paint();
    }
  }
  // Repaint everything that depends on filters, without touching the ribbon (keeps a drag alive).
  function paint() {
    if (!panel || S.status !== 'ready') return;
    // Keep keyboard focus on the same control across the repaint.
    const fa = document.activeElement, keep = fa && panel.contains(fa) && fa.dataset ? { act: fa.dataset.act, s: fa.dataset.s, a: fa.dataset.a, f: fa.dataset.form } : null;
    const rib = panel.querySelector('#sr-rib');
    if (rib) rib.querySelectorAll('.bar').forEach((b, k) => b.classList.toggle('dim', S.surah != null && k !== S.surah));
    const read = panel.querySelector('#sr-read');
    if (read && !rib.matches(':hover')) { const t = sum(); read.textContent = S.surah == null ? 'المس سورة أو اسحب على الشريط لتصفية المواضع' : `${QB.data.names[S.surah]}: ${n(t.counts[S.surah])} موضع`; }
    panel.querySelector('#sr-fbar').innerHTML = filterBar();
    panel.querySelector('#sr-facet').innerHTML = facet();
    panel.querySelector('#sr-groups').innerHTML = S.groups.map(groupBlock).join('');
    if (keep && keep.act && !(fa && fa.isConnected)) {
      const sel = keep.act === 'page' ? '.sr-row' : `[data-act="${keep.act}"]${keep.s ? `[data-s="${keep.s}"][data-a="${keep.a}"]` : ''}${keep.f ? `[data-form="${CSS.escape(keep.f)}"]` : ''}`;
      (panel.querySelector(sel) || panel.querySelector('.sr-row'))?.focus({ preventScroll: true });
    }
  }

  QB.on('rec', (p) => {
    const next = p.on ? { s: p.s, a: p.a, playing: QB.player.state.playing } : null;
    const same = (recNow && next && recNow.s === next.s && recNow.a === next.a && recNow.playing === next.playing) || (!recNow && !next);
    recNow = next;
    if (!same && QB.current() === 'search') paint();
  });
  QB.on('notebook', () => { if (QB.current() === 'search') paint(); });

  QB.screen('search', {
    room: 'panel', panelWidth: 560, world: 'research',
    title: () => ['البحث', S.q ? (root() ? `جذر ${QB.letters(root())}` : `«${S.q}»`) : 'لوحة المطابقة'],
    mount(el) {
      panel = el;
      el.addEventListener('submit', (e) => {
        if (!e.target.matches('#sr-form')) return;
        e.preventDefault();
        const v = el.querySelector('#sr-input').value.trim();
        if (v) run(v, S.mode); else el.querySelector('#sr-input').focus();
      });
      el.addEventListener('keydown', (e) => {
        const row = e.target.closest && e.target.closest('.sr-row');
        if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
      });
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t || !el.contains(t)) return;
        const act = t.dataset.act;
        if (act === 'reset') { reset(); setTimeout(() => el.querySelector('#sr-input')?.focus(), 0); }
        else if (act === 'close') QB.go('reader');
        else if (act === 'mode') {
          const m = t.dataset.mode;
          const typed = el.querySelector('#sr-input')?.value.trim() || '';
          if (typed) run(typed, m); else { S.mode = m; render(); el.querySelector('#sr-input')?.focus(); }
        }
        else if (act === 'try') run(t.dataset.q, t.dataset.mode);
        else if (act === 'follow') {
          const r = root(); if (!r) return;
          const on = QB.state.followedRoots.includes(r);
          QB.set('followedRoots', on ? QB.state.followedRoots.filter((x) => x !== r) : [...QB.state.followedRoots, r]);
          t.outerHTML = `<button class="ghost sm" data-act="follow" aria-pressed="${!on}" id="sr-follow">${QB.ico(!on ? 'check' : 'plus', 'sm')}${!on ? 'جذر مُتابَع' : 'تابِع هذا الجذر'}</button>`;
          el.querySelector('#sr-follow')?.focus();
          QB.toast(on ? 'أُلغيت متابعة الجذر.' : 'تُتابِع هذا الجذر الآن. تجده في الدفتر › الجذور.');
        }
        else if (act === 'heatmap') QB.go('heatmap', { root: root() });
        else if (act === 'clear-surah') { S.surah = null; S.pages = {}; paint(); panel.querySelector('#sr-rib')?.focus(); }
        else if (act === 'forms-all') { S.formsAll = !S.formsAll; paint(); }
        else if (act === 'clear-form') { S.form = null; S.pages = {}; paint(); }
        else if (act === 'form') { S.form = S.form === t.dataset.form ? null : t.dataset.form; S.formLabel = t.querySelector('bdi')?.textContent || S.form; S.pages = {}; paint(); }
        else if (act === 'page') {
          S.pages[t.dataset.g] = +t.dataset.p; paint();
          const sec = [...el.querySelectorAll('.sr-group')].find((x) => x.dataset.gkey === t.dataset.g);
          sec?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        else if (act === 'play') {
          const s = +t.dataset.s, a = +t.dataset.a;
          const st = QB.player.state;
          if (st.on && st.list.length && st.list[st.idx].s === s && st.list[st.idx].a === a) { QB.player.toggle(); paint(); return; }
          const g = S.groups.find((x) => x.key === t.dataset.g) || S.groups[0];
          const v = g.verses.find((x) => x.s === s && x.a === a);
          QB.player.start({ ayahs: [{ s, a, text: v ? v.text : (QB.ayah(s, a)?.text || '') }] });
        }
        else if (act === 'pin') {
          const s = +t.dataset.s, a = +t.dataset.a;
          const g = S.groups.find((x) => x.key === t.dataset.g) || S.groups[0];
          const v = g && g.verses.find((x) => x.s === s && x.a === a);
          QB.saveAyah(s, a, v ? v.text : undefined);
        }
        else if (act === 'verse') {
          const s = +t.dataset.s, a = +t.dataset.a;
          S.selected = `${s}:${a}`;
          el.querySelectorAll('.sr-row.on').forEach((x) => x.classList.remove('on'));
          t.classList.add('on');
          QB.openVerse(s, a);
        }
      });
    },
    show(el, params = {}) {
      panel = el;
      if (params.q && (params.q.trim() !== S.q || modeOf(params.mode) !== S.mode || S.status === 'empty')) run(params.q, params.mode);
      else render();
    },
  });

  /* =====================================================================
     Heatmap: where a root lives across the whole Quran.
     ===================================================================== */
  const LEVELS = [0, 14, 26, 40, 56, 72, 88];   // % of --gold mixed over --bg-elev-1
  const H = { root: null, status: 'pick', tab: 'grid', sel: null, back: null, token: 0 };
  let lastRoute = null, hmEl = null;
  QB.on('route', ({ name, params }) => { if (name !== 'heatmap') lastRoute = { name, params }; });

  const level = (c, peak) => (c <= 0 ? 0 : Math.min(6, Math.ceil((c / peak) * 6)));
  const shortName = (i) => QB.strip(QB.surah(i + 1).name || QB.data.names[i] || '');

  const hmPicker = (msg) => {
    const fr = QB.state.followedRoots.filter((r) => QB.spread(r));
    return `<div class="srh-pick">
      <p class="lede">${msg || 'اختر جذراً من لوحة المطابقة لعرض انتشاره عبر المصحف.'}</p>
      ${fr.length ? `<div><div class="label srh-pl">الجذور التي تتابعها</div><div class="srh-chips">${fr.map((r) => { const sp = QB.spread(r); return `<button class="srh-chip" data-act="hm-root" data-root="${r}"><span><b class="letters">${QB.letters(r)}</b><small>${n(sp.total)} موضع في ${n(sp.surahs)} سورة</small></span>${QB.miniRibbon(sp.counts)}</button>`; }).join('')}</div></div>` : ''}
      <form class="srh-form" id="srh-form">
        <div class="field"><label for="srh-input">أو اكتب جذراً</label>
          <div class="srh-row"><input class="input" id="srh-input" placeholder="مثلاً: رحم" autocomplete="off"><button class="cta sm" type="submit">اعرض الانتشار</button></div>
        </div>
        <div id="srh-hint"></div>
      </form>
    </div>`;
  };

  const hmBody = () => {
    const sp = QB.spread(H.root);
    if (!sp || !sp.total) return `<p class="lede srh-state">لا توجد مواضع لهذا الجذر.</p>`;
    const peak = Math.max(1, ...sp.counts);
    const top = sp.counts.map((c, i) => [i, c]).filter(([, c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const grid = `<div class="srh-grid" role="list" aria-label="السور الـ١١٤ مظلَّلة بعدد المواضع">${sp.counts.map((c, i) => {
      const lv = level(c, peak);
      return `<button class="srh-cell" role="listitem" data-act="hm-open" data-i="${i}" data-lv="${lv}" style="background:color-mix(in srgb, var(--gold) ${LEVELS[lv]}%, var(--bg-elev-1))" aria-label="سورة ${QB.data.names[i]}: ${n(c)} موضع. افتحها في المصحف"><b>${n(i + 1)}</b><span>${shortName(i)}</span></button>`;
    }).join('')}</div>
      <div class="srh-legend" aria-hidden="true"><span>أقلّ</span>${LEVELS.map((p) => `<i style="background:color-mix(in srgb, var(--gold) ${p}%, var(--bg-elev-1))"></i>`).join('')}<span>أكثر</span></div>`;
    const rib = `<div class="srh-rib">${QB.ribbon(sp.counts, { live: true, grow: true, id: 'srh-rib', here: H.sel ?? undefined, label: 'انتشار الجذر في السور، المس سورة لتختارها' })}
        <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="srh-rread" aria-live="polite"></span><span>${QB.data.names[113]}</span></div>
        <div class="srh-ribact" id="srh-ribact">${H.sel != null ? ribAct(H.sel) : ''}</div></div>`;
    return `<div class="srh-lens">
        <div class="tabs" role="tablist" aria-label="طريقة العرض">
          <button role="tab" id="srh-tab-grid" aria-controls="srh-panel" aria-selected="${H.tab === 'grid'}" data-act="hm-tab" data-tab="grid">شبكة</button>
          <button role="tab" id="srh-tab-rib" aria-controls="srh-panel" aria-selected="${H.tab === 'rib'}" data-act="hm-tab" data-tab="rib">شريط</button>
        </div>
        <span class="readout srh-read" id="srh-read" aria-live="polite">${H.tab === 'grid' ? 'مرّر على سورة لترى عدد مواضعها، والمسها لتفتحها' : ''}</span>
      </div>
      <div id="srh-panel" role="tabpanel" aria-labelledby="srh-tab-${H.tab}">${H.tab === 'grid' ? grid : rib}</div>
      <section class="srh-top">
        <h2 class="h3">السُّوَر الأعلى ذِكراً</h2>
        <ul class="list">${top.map(([i, c]) => `<li><button class="row" data-act="hm-open" data-i="${i}"><span class="glyph">${n(i + 1)}</span><span class="t">سورة ${QB.data.names[i]}<small>${n(c)} موضع، ${n(Math.round((c / sp.total) * 100))}٪ من المواضع</small></span><span class="srh-share" aria-hidden="true"><i style="width:${(c / peak) * 100}%"></i></span><span class="chev">${QB.ico('chevL')}</span></button></li>`).join('')}</ul>
      </section>`;
  };
  const ribAct = (i) => {
    const c = QB.spread(H.root)?.counts[i] || 0;
    return `<span class="label">سورة ${QB.data.names[i]}: ${n(c)} موضع</span><button class="ghost sm" data-act="hm-open" data-i="${i}">${QB.ico('book', 'sm')}افتح سورة ${QB.data.names[i]} في المصحف</button>`;
  };

  function hmRender() {
    const el = hmEl; if (!el) return;
    const sp = H.root ? QB.spread(H.root) : null;
    const sub = H.status === 'loading' ? 'جارٍ حساب الانتشار…' : '';
    el.innerHTML = `<div class="wrap srh">
      <header class="srh-head">
        <button class="icon-btn" data-act="hm-back" aria-label="رجوع">${QB.ico('chevR')}</button>
        <div class="srh-id">
          <div class="kicker">خريطة انتشار الجذر</div>
          ${H.root ? `<h1 class="letters srh-root" aria-label="${esc(H.root)}">${QB.letters(H.root)}</h1>` : '<h1 class="h2 srh-h">اختر جذراً</h1>'}
          ${sub ? `<div class="label" role="status">${sub}</div>` : ''}
        </div>
        ${H.status === 'ready' && sp && sp.total ? `<div class="figures srh-figs"><div><b>${n(sp.total)}</b><span>موضع</span></div><div><b>${n(sp.surahs)}</b><span>سورة</span></div></div>` : ''}
      </header>
      ${H.status === 'ready' && sp && sp.total ? `<div class="srh-links"><button class="quiet" data-act="hm-search">${QB.ico('search', 'sm')}افتح الجذر في لوحة المطابقة</button><button class="quiet" data-act="hm-change">${QB.ico('history', 'sm')}جذر آخر</button></div>` : ''}
      <div class="srh-main">${H.status === 'pick' ? hmPicker(H.pickMsg) : H.status === 'loading' ? '<div class="srh-skel" aria-hidden="true"></div>' : hmBody()}</div>
    </div>`;
    hmWire();
  }
  function hmWire() {
    const el = hmEl, sp = H.root ? QB.spread(H.root) : null;
    const form = el.querySelector('#srh-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = el.querySelector('#srh-input').value.trim();
      const r = QB.findRoot(v);
      if (r && QB.spread(r)) { hmLoad(r); return; }
      const sg = suggest(v);
      el.querySelector('#srh-hint').innerHTML = v ? `<p class="empty">لا يوجد جذر «${esc(v)}» في بيانات هذا النموذج.</p>${sg.length ? `<div class="sr-try"><span class="label">هل تقصد:</span>${sg.map((r2) => `<button type="button" class="chip" data-act="hm-root" data-root="${r2}"><b class="letters">${QB.letters(r2)}</b></button>`).join('')}</div>` : ''}` : '';
      el.querySelector('#srh-input').focus();
    });
    if (!sp || H.status !== 'ready') return;
    const read = el.querySelector('#srh-read');
    const say = (i) => `سورة ${QB.data.names[i]}: ${n(sp.counts[i])} موضع`;
    const grid = el.querySelector('.srh-grid');
    if (grid) {
      const idle = 'مرّر على سورة لترى عدد مواضعها، والمسها لتفتحها';
      const on = (e) => { const c = e.target.closest('.srh-cell'); if (c) read.textContent = say(+c.dataset.i); };
      grid.addEventListener('pointerover', on);
      grid.addEventListener('focusin', on);
      grid.addEventListener('pointerleave', () => { read.textContent = idle; });
    }
    const rib = el.querySelector('#srh-rib');
    if (rib) QB.wireRibbon(rib, el.querySelector('#srh-rread'), say, (i) => {
      H.sel = i;
      rib.querySelectorAll('.bar').forEach((b, k) => b.classList.toggle('here', k === i));
      el.querySelector('#srh-ribact').innerHTML = i == null ? '' : ribAct(i);
    }, () => (H.sel == null ? 'المس سورة أو اسحب على الشريط لتختارها' : say(H.sel)));
  }
  function hmLoad(r) {
    H.root = r; H.sel = null; H.status = 'loading'; hmRender(); QB.setTitle();
    const tok = ++H.token;
    setTimeout(() => { if (tok !== H.token) return; H.status = 'ready'; hmRender(); QB.setTitle(); }, 300);
  }

  QB.screen('heatmap', {
    world: 'research',
    title: () => ['خريطة انتشار الجذر', H.root ? `جذر ${QB.letters(H.root)}` : 'اختر جذراً'],
    mount(el) {
      hmEl = el;
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t || !el.contains(t)) return;
        const act = t.dataset.act;
        if (act === 'hm-back') { const b = H.back; if (b && b.name) QB.go(b.name, b.name === 'search' ? {} : (b.params || {})); else QB.go('search', H.root ? { q: H.root, mode: 'root' } : {}); }
        else if (act === 'hm-tab') { H.tab = t.dataset.tab; hmRender(); el.querySelector(`[data-tab="${H.tab}"]`)?.focus(); }
        else if (act === 'hm-open') { const i = +t.dataset.i; QB.go('reader', { page: QB.surah(i + 1).page }); }
        else if (act === 'hm-root') hmLoad(t.dataset.root);
        else if (act === 'hm-search') QB.go('search', { q: H.root, mode: 'root' });
        else if (act === 'hm-change') { H.token++; H.status = 'pick'; H.pickMsg = null; H.root = null; hmRender(); QB.setTitle(); el.querySelector('#srh-input')?.focus(); }
      });
    },
    show(el, params = {}) {
      hmEl = el;
      H.back = lastRoute;
      const r = params.root ? (QB.findRoot(params.root) || params.root) : null;
      if (!r) { if (H.status === 'ready' && H.root) hmRender(); else { H.status = 'pick'; H.root = null; hmRender(); } return; }
      if (r === H.root && H.status === 'ready') { hmRender(); return; }
      if (!QB.spread(r)) { H.root = r; H.status = 'ready'; hmRender(); return; }
      hmLoad(r);
    },
  });
})();
