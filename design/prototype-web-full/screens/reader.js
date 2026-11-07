/* Reader (المصحف): the shared Mushaf stage (QB.mushaf) and the `reader` screen.
   QB.mushaf.el is one element; core moves it into whichever room is active (reader, search,
   study, notebook…). The reader screen adds the study panel beside it. Prefix rd-. */
(() => {
  const { n, esc } = QB;
  const LOADED = QB.pageNumbers;
  const TOTAL = QB.data.stats.pages || 604;
  const BASMALA = (QB.page(1) && QB.page(1).ayahs[0].text) || 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
  const SOURCE = 'Noor International Center (QuranEnc)';
  const LOADED_LINE = 'في هذا النموذج حُمّلت صفحات ١، ٢، ٤٩٩–٥٠١ فقط.';
  const LOCK = 'الأدوات متوقفة أثناء التلاوة';
  const TOOL_HINT = {
    read: '',
    select: 'اضغط كلمة لتحليلها، أو كلمة ثم أخرى، أو رقم الآية لتحديدها كاملة',
    hl: 'اضغط آية: احفظها وظلِّلها بموضوع',
  };

  Object.assign(QB.icons, {
    cursor: '<path d="M6 4l12 7.2-5.4 1.3L10 18.5z"/>',
    pen: '<path d="M4 20h6"/><path d="M14.5 4.5l5 5L11 18H6v-5z"/>',
    expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h3M11 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
    stats: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V9"/>',
  });

  /* ---------------- Data helpers ---------------- */
  // Every loaded word, in Mushaf order; IDX maps "s:a:p" → position.
  const ALL = [], IDX = {};
  LOADED.forEach((pn) => {
    const pg = QB.page(pn);
    if (!pg) return;
    pg.ayahs.forEach((v) => QB.words(v.text).forEach((w, i) => { IDX[`${v.s}:${v.a}:${i + 1}`] = ALL.length; ALL.push({ s: v.s, a: v.a, p: i + 1, w, page: pn }); }));
  });
  const clamp = (x) => Math.max(1, Math.min(TOTAL, x));
  const surahAt = (pg) => { let s = 1; QB.data.index.forEach((x) => { if (x.page <= pg) s = x.id; }); return s; };
  const juzAt = (pg) => { let j = 1; QB.data.juz.forEach((x) => { if (x.page <= pg) j = x.n; }); return j; };
  const info = (pn) => { const p = QB.page(pn); const s = p ? p.ayahs[0].s : surahAt(pn); return { s, name: QB.surah(s).name, juz: p ? p.juz : juzAt(pn) }; };
  const typeOf = (s) => (QB.surah(s).type === 'medinan' ? 'مدنيّة' : 'مكّيّة');
  const nearest = (pn) => LOADED.reduce((b, x) => (Math.abs(x - pn) < Math.abs(b - pn) ? x : b), LOADED[0]);
  const isSaved = (pn) => QB.state.savedPages.some((x) => x.page === pn);
  const words = (k) => (k === 1 ? 'كلمة واحدة' : k === 2 ? 'كلمتان' : k <= 10 ? `${n(k)} كلمات` : `${n(k)} كلمة`);
  const ayahsWord = (k) => (k === 1 ? 'آية واحدة' : k === 2 ? 'آيتان' : k <= 10 ? `${n(k)} آيات` : `${n(k)} آية`);
  const trKind = (k) => (/english/i.test(k) ? 'english' : /french/i.test(k) ? 'french' : null);
  const trLabel = { english: 'English', french: 'Français' };
  const cleanTr = (t) => esc(String(t || '').replace(/^\d+\.\s*/, '')).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wideScreen = () => window.matchMedia('(min-width: 1001px)').matches;

  /* ---------------- State ---------------- */
  const R = {
    page: (QB.state.lastRead && QB.state.lastRead.page) || 500,
    tool: 'select',         // 'read' | 'select' | 'hl'
    sel: null,              // { from, to, kind: 'word'|'range'|'verse' } over ALL
    anchor: null,           // first tapped word, waiting for a second tap
    strip: false,           // «العرض» open
    focus: false,
    panelOpen: true,
    lang: 'english',
    rec: null,              // { s, a, word } while reciting
    width: 0,
    spread: false,
    started: false,
    roving: null,
  };

  /* ---------------- The stage element ---------------- */
  const el = document.createElement('div');
  el.className = 'rd-stage';
  el.setAttribute('lang', 'ar');
  el.innerHTML = `
    <div class="rd-top">
      <div class="rd-bar" role="toolbar" aria-label="شريط القارئ"></div>
      <div class="rd-progress" role="progressbar" aria-label="موضعك في المصحف" aria-valuemin="1" aria-valuemax="${TOTAL}"><i></i></div>
    </div>
    <div class="rd-strip" id="rd-strip" hidden></div>
    <p class="rd-hint" aria-live="polite"></p>
    <div class="rd-body">
      <button class="rd-edge rd-edge-prev" data-act="prev" aria-label="الصفحة السابقة" tabindex="-1">${QB.ico('chevR')}</button>
      <div class="rd-pages" id="rd-pages"></div>
      <button class="rd-edge rd-edge-next" data-act="next" aria-label="الصفحة التالية" tabindex="-1">${QB.ico('chevL')}</button>
      <div class="rd-travel" aria-hidden="true"><b class="gold-num"></b><span></span></div>
      <div class="rd-loading" role="status">جارٍ تحميل المصحف</div>
    </div>
    <div class="rd-selbar" role="region" aria-label="التحديد" hidden></div>
    <button class="rd-focus-pill" data-act="focus" aria-label="إنهاء وضع التركيز" hidden></button>`;
  const $ = (s) => el.querySelector(s);
  const bar = $('.rd-bar'), strip = $('.rd-strip'), pagesEl = $('.rd-pages'), selbar = $('.rd-selbar'), hint = $('.rd-hint');
  let panelEl = null;

  const host = () => QB.current();
  const visible = () => el.isConnected && el.offsetParent !== null;
  const room = () => (panelEl ? panelEl.parentElement : null);
  const panelShown = () => host() === 'reader' && R.panelOpen && !R.focus && wideScreen();
  const pageW = () => QB.state.quranSize * 21 + 64;
  const canSpread = () => QB.state.readingMode === 'page' && wideScreen() && (host() === 'reader' || !host()) && !panelShown() && R.width >= 2 * pageW() + 96;
  const pairStart = (pn) => (pn % 2 ? pn : pn - 1);
  const shown = () => (R.spread ? [pairStart(R.page), pairStart(R.page) + 1].filter((x) => x <= TOTAL) : [R.page]);

  /* ---------------- Rendering: bar, strip, hint ---------------- */
  const TOOLS = [['read', 'قراءة', 'book', '0'], ['select', 'تحديد', 'cursor', '1'], ['hl', 'تظليل', 'pen', '2']];
  function renderBar() {
    const inf = info(R.page), locked = !!R.rec, reader = host() === 'reader', saved = isSaved(R.page);
    bar.innerHTML = `
      <button class="rd-id" data-act="nav" aria-haspopup="dialog" title="انتقل"><b>سورة ${inf.name}</b><span>الجزء ${n(inf.juz)}، صفحة ${n(R.page)} من ${n(TOTAL)}</span>${QB.ico('chevD', 'sm')}</button>
      <div class="rd-tools seg-ctl" role="radiogroup" aria-label="أداة القراءة"${locked ? ` aria-describedby="rd-lock"` : ''}>
        ${TOOLS.map(([id, label, ic, key]) => `<button role="radio" aria-checked="${R.tool === id}" aria-pressed="${R.tool === id}" data-act="tool" data-tool="${id}" ${locked ? 'aria-disabled="true"' : ''} title="${label} (${key})">${QB.ico(ic, 'sm')}<span class="rd-lbl">${label}</span></button>`).join('')}
      </div>
      <span class="rd-sp"></span>
      <div class="rd-acts">
        <button class="icon-btn" data-act="search" aria-label="البحث" title="البحث">${QB.ico('search', 'sm')}</button>
        <button class="quiet" data-act="nav" aria-haspopup="dialog">${QB.ico('compass', 'sm')}<span class="rd-lbl">انتقل</span></button>
        <button class="quiet" data-act="strip" aria-expanded="${R.strip}" aria-controls="rd-strip">${QB.ico('sliders', 'sm')}<span class="rd-lbl">العرض</span></button>
        <button class="quiet rd-play" data-act="play" aria-pressed="${locked}" ${QB.page(R.page) ? '' : 'disabled'}>${QB.ico(locked ? 'pause' : 'play', 'sm fill')}<span class="rd-lbl">${locked ? 'إيقاف التلاوة' : 'تلاوة الصفحة'}</span></button>
        ${QB.state.readingMode === 'ayahs' ? `<button class="icon-btn rd-bm" data-act="savepage" data-n="${R.page}" aria-pressed="${saved}" aria-label="${saved ? 'إزالة الصفحة من المحفوظات' : 'احفظ هذه الصفحة'}" title="${saved ? 'إزالة الصفحة من المحفوظات' : 'احفظ هذه الصفحة'}">${QB.ico('bookmark', 'sm')}</button>` : ''}
        ${reader ? `<button class="icon-btn" data-act="focus" aria-label="وضع التركيز (F)" title="وضع التركيز (F)">${QB.ico('expand', 'sm')}</button>` : ''}
        ${reader && wideScreen() ? `<button class="icon-btn rd-pt" data-act="panel" aria-pressed="${R.panelOpen}" aria-label="${R.panelOpen ? 'إخفاء لوحة الدراسة' : 'إظهار لوحة الدراسة'}" title="${R.panelOpen ? 'إخفاء لوحة الدراسة' : 'إظهار لوحة الدراسة'}">${QB.ico('panel', 'sm')}</button>` : ''}
      </div>
      <div class="rd-arrows">
        <button class="icon-btn" data-act="prev" aria-label="الصفحة السابقة (PageUp)" title="الصفحة السابقة (PageUp)" ${R.page <= 1 ? 'disabled' : ''}>${QB.ico('chevR', 'sm')}</button>
        <button class="icon-btn" data-act="next" aria-label="الصفحة التالية (PageDown)" title="الصفحة التالية (PageDown)" ${R.page >= TOTAL ? 'disabled' : ''}>${QB.ico('chevL', 'sm')}</button>
      </div>`;
    el.classList.toggle('with-panel', panelShown());
    const pr = $('.rd-progress');
    pr.setAttribute('aria-valuenow', R.page);
    pr.setAttribute('aria-valuetext', `صفحة ${n(R.page)} من ${n(TOTAL)}`);
    pr.querySelector('i').style.width = `${(R.page / TOTAL) * 100}%`;
    const pill = $('.rd-focus-pill');
    pill.hidden = !R.focus;
    pill.innerHTML = `صفحة ${n(R.page)} <span aria-hidden="true">⤡</span>`;
    renderHint();
  }
  function renderHint() {
    const txt = R.rec ? LOCK : R.sel ? '' : TOOL_HINT[R.tool];
    hint.id = R.rec ? 'rd-lock' : '';
    hint.textContent = txt;
    hint.hidden = !txt || R.focus;
    hint.classList.toggle('lock', !!R.rec);
  }
  function renderStrip() {
    strip.hidden = !R.strip;
    if (!R.strip) return;
    const mode = QB.state.readingMode, tr = QB.state.translations || [];
    strip.innerHTML = `
      <div class="rd-opt">
        <span class="label" id="rd-mode-l">طريقة القراءة (Shift+M)</span>
        <div class="seg-ctl rd-modes" role="radiogroup" aria-labelledby="rd-mode-l">
          <button role="radio" data-act="mode" data-mode="page" aria-checked="${mode === 'page'}" aria-pressed="${mode === 'page'}">صفحات<small>صفحة المصحف كما طُبعت</small></button>
          <button role="radio" data-act="mode" data-mode="ayahs" aria-checked="${mode === 'ayahs'}" aria-pressed="${mode === 'ayahs'}">آية آية<small>كل آية في سطر</small></button>
        </div>
      </div>
      <div class="rd-opt rd-size">
        <label class="label" for="rd-size">حجم النص</label>
        <div class="rd-size-row"><span class="q" aria-hidden="true">ب</span><input class="range" type="range" id="rd-size" min="18" max="48" step="1" value="${QB.state.quranSize}"><span class="q rd-size-big" aria-hidden="true">ب</span><output for="rd-size" id="rd-size-o">${n(QB.state.quranSize)}</output></div>
      </div>
      <div class="rd-opt">
        <span class="label" id="rd-thl-l">تظليل المواضيع</span>
        <div class="rd-sw-row"><button class="switch" role="switch" data-act="themes" aria-checked="${!!QB.state.themeHighlight}" aria-labelledby="rd-thl-l"></button><small class="muted">الآيات المحفوظة بألوان مواضيعها</small></div>
      </div>
      <div class="rd-opt">
        <span class="label">ترجمة المعاني</span>
        <div class="chips">${['english', 'french'].map((k) => { const on = tr.some((x) => trKind(x) === k); return `<button class="chip" data-act="tr" data-tr="${k}" aria-pressed="${on}">${trLabel[k]}</button>`; }).join('')}
          <button class="link" data-act="settings">ترجمات أخرى</button></div>
        ${mode === 'page' && tr.length ? '<small class="muted">اقرأ «آية آية» لترى الترجمة</small>' : ''}
      </div>
      <div class="rd-opt rd-ed">
        <span class="label">المصحف</span>
        <span>مصحف المدينة النبوية<small>رواية حفص عن عاصم، صفحات مجمّع الملك فهد</small></span>
      </div>`;
    const range = strip.querySelector('#rd-size');
    range.addEventListener('input', () => { QB.set('quranSize', +range.value); strip.querySelector('#rd-size-o').textContent = n(range.value); });
  }

  /* ---------------- Rendering: pages ---------------- */
  const wordSpans = (v) => QB.words(v.text).map((w, i) => `<span class="rd-w" data-k="${v.s}:${v.a}:${i + 1}" tabindex="-1">${w}</span>`).join(' ');
  const verseSpan = (v) => `<span class="rd-ay" data-ay="${v.s}:${v.a}">${wordSpans(v)}</span>`;
  const marker = (v) => `<button class="marker rd-mk" data-ay="${v.s}:${v.a}" aria-label="الآية ${n(v.a)}"><i>${n(v.a)}</i></button>`;
  const frame = (s) => {
    const x = QB.surah(s);
    return `<div class="rd-sframe"><span>${ayahsWord(x.ayahs)}</span><h3>سورة ${x.name}</h3><span>${typeOf(s)}</span></div>
      ${s !== 1 && s !== 9 ? `<p class="rd-basmala">${BASMALA}</p>` : ''}`;
  };
  function pageText(pg) {
    let out = '', run = '';
    const flush = () => { if (run) out += `<p class="rd-run">${run}</p>`; run = ''; };
    pg.ayahs.forEach((v) => { if (v.a === 1) { flush(); out += frame(v.s); } run += `${verseSpan(v)}&nbsp;${marker(v)} `; });
    flush();
    return out;
  }
  const ribbonBtn = (pn) => {
    const s = isSaved(pn), l = s ? 'إزالة الصفحة من المحفوظات' : 'احفظ هذه الصفحة';
    return `<button class="rd-ribbon" data-act="savepage" data-n="${pn}" aria-pressed="${s}" aria-label="${l}" title="${l}">${QB.ico('bookmark')}</button>`;
  };
  function pageHTML(pn) {
    const pg = QB.page(pn), inf = info(pn);
    return `<article class="rd-page" data-n="${pn}" aria-label="صفحة ${n(pn)}">
      ${ribbonBtn(pn)}
      <header class="rd-page-head"><span>سورة ${inf.name}</span><span>الجزء ${n(inf.juz)}</span></header>
      <div class="rd-text">${pageText(pg)}</div>
      <footer class="rd-page-foot"><span>${n(pn)}</span></footer>
    </article>`;
  }
  function missingHTML(pn) {
    const inf = info(pn), near = nearest(pn);
    return `<article class="rd-page rd-missing" data-n="${pn}" aria-label="صفحة ${n(pn)}">
      <header class="rd-page-head"><span>سورة ${inf.name}</span><span>الجزء ${n(inf.juz)}</span></header>
      <div class="rd-miss">
        <h3 class="h3">صفحة ${n(pn)} ليست في هذا النموذج</h3>
        <p class="lede">${LOADED_LINE} في التطبيق تُفتح صفحات المصحف كلها.</p>
        <button class="ghost sm" data-act="page" data-n="${near}">افتح أقرب صفحة محمّلة، صفحة ${n(near)}</button>
        <div class="chips">${LOADED.map((p) => `<button class="chip" data-act="page" data-n="${p}">صفحة ${n(p)}</button>`).join('')}</div>
      </div>
      <footer class="rd-page-foot"><span>${n(pn)}</span></footer>
    </article>`;
  }
  function translations(v) {
    const keys = (QB.state.translations || []).slice(0, 3);
    if (!keys.length) return '';
    const t = QB.trans(v.s, v.a) || {};
    return `<div class="rd-trs">${keys.map((k) => {
      const kind = trKind(k), txt = kind && t[kind];
      if (!txt) {
        const cat = QB.data.translations.find((x) => x.key === k);
        return `<div class="rd-tr"><p class="muted">${esc(cat ? cat.name : String(k))}: النص غير محمّل في النموذج.</p></div>`;
      }
      const notes = /\[\d+\]/.test(txt);
      return `<div class="rd-tr" lang="${kind === 'english' ? 'en' : 'fr'}" dir="ltr"><p>${cleanTr(txt)}</p>
        <div class="rd-src">${trLabel[kind]}, ${SOURCE}</div>
        ${notes ? `<details class="rd-fn" lang="ar"><summary>حواشٍ</summary><p class="muted" dir="rtl">نصوص حواشي المترجم لا تُحمَّل في هذا النموذج؛ في التطبيق تظهر هنا عند الأرقام المعلَّمة.</p></details>` : ''}
      </div>`;
    }).join('')}</div>`;
  }
  function flowHTML(pn) {
    const pg = QB.page(pn);
    if (!pg) return missingHTML(pn);
    return `<section class="rd-flow" data-n="${pn}" aria-label="صفحة ${n(pn)}">
      <div class="rd-pmark"><span>صفحة ${n(pn)}</span></div>
      ${pg.ayahs.map((v) => `${v.a === 1 ? frame(v.s) : ''}
        <div class="rd-row" data-row="${v.s}:${v.a}">
          <button class="rd-num rd-mk" data-ay="${v.s}:${v.a}" aria-label="الآية ${n(v.a)}">${n(v.a)}</button>
          <div class="rd-row-main"><p class="rd-row-text">${verseSpan(v)}</p>${translations(v)}</div>
        </div>`).join('')}
    </section>`;
  }
  function renderBody() {
    R.spread = canSpread();
    const list = shown(), ayahs = QB.state.readingMode === 'ayahs';
    pagesEl.className = `rd-pages${ayahs ? ' ayahs' : ''}${R.spread ? ' spread' : ''}`;
    pagesEl.innerHTML = list.map((pn) => (ayahs ? flowHTML(pn) : QB.page(pn) ? pageHTML(pn) : missingHTML(pn))).join('');
    paintTints();
    paintSel();
    paintRec(false);
    setRoving();
  }
  function setRoving(k) {
    const ws = pagesEl.querySelectorAll('.rd-w');
    if (!ws.length) return;
    const target = (k && pagesEl.querySelector(`.rd-w[data-k="${k}"]`)) || (R.sel && pagesEl.querySelector(`.rd-w[data-k="${keyOf(ALL[R.sel.from])}"]`)) || ws[0];
    ws.forEach((w) => (w.tabIndex = -1));
    target.tabIndex = 0;
    R.roving = target.dataset.k;
  }
  const keyOf = (x) => `${x.s}:${x.a}:${x.p}`;

  /* Saved verses (الدفتر) carry their theme colours as stacked underlines and a soft tint. */
  function paintTints() {
    el.classList.toggle('th-on', !!QB.state.themeHighlight);
    pagesEl.querySelectorAll('.rd-ay').forEach((sp) => {
      const [s, a] = sp.dataset.ay.split(':').map(Number);
      const note = QB.noteOf(s, a);
      sp.classList.toggle('rd-saved', !!note);
      if (!note) { sp.style.removeProperty('--rd-u'); sp.style.removeProperty('--rd-t'); return; }
      const cols = (note.themes.length ? note.themes.map((id) => (QB.theme(id) || {}).color) : ['gray']).slice(0, 3).map(QB.thColor);
      sp.style.setProperty('--rd-u', cols.map((c, i) => `linear-gradient(${c}, ${c}) 0 calc(100% - ${i * 4}px) / 100% 2px no-repeat`).join(', '));
      sp.style.setProperty('--rd-t', cols[0]);
      sp.title = note.themes.length ? `في الدفتر: ${note.themes.map((id) => (QB.theme(id) || {}).name).filter(Boolean).join('، ')}` : 'في الدفتر، بلا موضوع';
    });
  }

  /* ---------------- Selection ---------------- */
  const selWords = () => (R.sel ? ALL.slice(R.sel.from, R.sel.to + 1) : []);
  const selText = () => selWords().map((x) => x.w).join(' ');
  function selRef(ws = selWords()) {
    if (!ws.length) return '';
    const a = ws[0], b = ws[ws.length - 1];
    if (a.s !== b.s) return `${QB.surah(a.s).name} ${n(a.a)} إلى ${QB.surah(b.s).name} ${n(b.a)}`;
    return a.a === b.a ? `${QB.surah(a.s).name} ${n(a.a)}` : `${QB.surah(a.s).name} ${n(a.a)}–${n(b.a)}`;
  }
  const verseIdx = (s, a) => { const f = IDX[`${s}:${a}:1`]; if (f == null) return null; let t = f; while (ALL[t + 1] && ALL[t + 1].s === s && ALL[t + 1].a === a) t++; return [f, t]; };
  function setSel(from, to) {
    if (from == null) { R.sel = null; R.anchor = null; }
    else {
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const v = verseIdx(ALL[lo].s, ALL[lo].a);
      const kind = lo === hi ? 'word' : v && v[0] === lo && v[1] === hi ? 'verse' : 'range';
      R.sel = { from: lo, to: hi, kind };
    }
    paintSel(); renderSelBar(); renderHint(); renderPanel();
    emitCurrent();
  }
  const clearSel = () => setSel(null);
  function paintSel() {
    const on = new Set(selWords().map(keyOf));
    const one = R.sel && R.sel.kind === 'word';
    pagesEl.querySelectorAll('.rd-w').forEach((w) => {
      const hit = on.has(w.dataset.k);
      w.classList.toggle('sel', hit && !one);
      w.classList.toggle('pick', hit && one);
    });
    const whole = R.sel && R.sel.kind === 'verse' ? `${ALL[R.sel.from].s}:${ALL[R.sel.from].a}` : null;
    pagesEl.querySelectorAll('.rd-mk').forEach((m) => m.classList.toggle('on', m.dataset.ay === whole));
  }
  function lockToast() { QB.toast(`${LOCK}. أوقف التلاوة لتستعمل أدوات القراءة.`); }
  function onWord(k) {
    if (R.rec) return lockToast();
    const [s, a] = k.split(':').map(Number);
    if (R.tool === 'read') return;
    if (R.tool === 'hl') { QB.saveAyah(s, a); return; }
    const i = IDX[k];
    if (R.sel && R.sel.kind === 'word' && R.anchor != null) {
      if (i === R.anchor) { clearSel(); return; }
      const a0 = R.anchor; R.anchor = null; setSel(a0, i);
    } else { R.anchor = i; setSel(i, i); }
  }
  function onMarker(key) {
    const [s, a] = key.split(':').map(Number);
    if (R.rec) return lockToast();
    if (R.tool === 'hl') { QB.saveAyah(s, a); return; }
    if (R.tool === 'read') { setTool('select'); }
    const v = verseIdx(s, a);
    if (v) { R.anchor = null; setSel(v[0], v[1]); }
  }
  function setTool(t) {
    if (R.rec) return lockToast();
    if (t === R.tool) return;
    R.tool = t; el.dataset.tool = t;
    if (t !== 'select') clearSel();
    renderBar();
    renderPanel();
  }

  // Selection bar: lives in the stage, so it works in any room.
  function renderSelBar() {
    if (!R.sel) { selbar.hidden = true; selbar.innerHTML = ''; return; }
    const ws = selWords(), text = selText(), one = R.sel.kind === 'word';
    const m = one ? (QB.morph(ws[0].s, ws[0].a) || [])[ws[0].p - 1] : null;
    selbar.hidden = false;
    selbar.innerHTML = `
      <div class="rd-sb-main">
        <span class="rd-sb-text" title="${esc(text)}">«${text}»</span>
        <span class="label">${words(ws.length)}، ${selRef(ws)}</span>
      </div>
      ${one ? `<div class="rd-sb-ana">${anaGrid(m)}</div>` : ''}
      <div class="rd-sb-acts">
        ${[['exact', 'search', 'بحث بالعبارة'], one && m && m.root ? ['root', 'layers', 'مواضع الجذر'] : null, ['ask', 'study', 'اسأل الدراسة'], ['stats', 'stats', 'إحصاء'], ['copy', 'copy', 'نسخ مع المرجع']].filter(Boolean)
          .map(([act, ic, l]) => `<button class="quiet" data-act="${act}" ${act === 'root' ? `data-root="${m.root}"` : ''} aria-label="${l}" title="${l}">${QB.ico(ic, 'sm')}<span class="rd-sb-l" aria-hidden="true">${l}</span></button>`).join('')}
      </div>
      <button class="icon-btn" data-act="clear" aria-label="إلغاء التحديد (Esc)" title="إلغاء التحديد (Esc)">${QB.ico('x', 'sm')}</button>`;
  }
  function anaGrid(m) {
    if (!m) return '<p class="empty">لا يتوفّر تحليل صرفي لهذه الكلمة.</p>';
    const cell = (k, v, cls = '') => `<div><dt>${k}</dt><dd class="${cls}">${v || '<span class="muted">—</span>'}</dd></div>`;
    return `<dl class="rd-ana">${cell('الجذر', m.root ? QB.letters(m.root) : '', m.root ? 'letters' : '')}${cell('الأصل', m.lemma ? esc(m.lemma) : '', 'q')}${cell('القسم', esc(m.pos_label || ''))}${cell('الإعراب', esc(m.case_label || ''))}</dl>
      ${(m.features || []).length ? `<div class="facts">${m.features.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}`;
  }

  /* ---------------- Selection actions ---------------- */
  function ask() {
    const ws = selWords(); if (!ws.length) return;
    const a = ws[0], b = ws[ws.length - 1];
    const ayah = a.s === b.s && a.a !== b.a ? `${n(a.a)}–${n(b.a)}` : n(a.a);
    QB.go('study', { ask: `ما دلالة «${selText()}» في سورة ${QB.surah(a.s).name} (الآية ${ayah})؟`, focus: { s: a.s, a: a.a } });
  }
  async function copy(btn) {
    const ws = selWords(); if (!ws.length) return;
    const a = ws[0], b = ws[ws.length - 1];
    const ref = a.s === b.s ? `${QB.surah(a.s).name}: ${n(a.a)}${a.a !== b.a ? `–${n(b.a)}` : ''}` : selRef(ws);
    const txt = `﴿${selText()}﴾ [${ref}]`;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.setAttribute('readonly', ''); ta.className = 'sr';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (_) { ok = false; }
    }
    if (ok) {
      const lbl = btn && btn.querySelector('.rd-sb-l');
      if (lbl) { lbl.textContent = 'نُسخ'; setTimeout(() => { if (lbl.isConnected) lbl.textContent = 'نسخ مع المرجع'; }, 1600); }
      QB.toast('نُسخ النص مع المرجع.');
    } else QB.toast('تعذّر النسخ من المتصفح. حدّد النص وانسخه يدوياً.');
  }
  // «إحصاء»: the phrase and each of its letters, on the page, in the surah and in the Quran.
  function stats() {
    const ws = selWords(); if (!ws.length) return;
    const first = ws[0], sur = QB.surah(first.s);
    const phrase = ws.map((x) => QB.strip(x.w));
    const pageWs = ALL.filter((x) => x.page === first.page).map((x) => QB.strip(x.w));
    const surWs = ALL.filter((x) => x.s === first.s);
    const loadedAyahs = new Set(surWs.map((x) => x.a));
    const fullSurah = loadedAyahs.size === sur.ayahs;
    const surStr = surWs.map((x) => QB.strip(x.w));
    const seq = (list) => { let c = 0; for (let i = 0; i + phrase.length <= list.length; i++) if (phrase.every((p, k) => list[i + k] === p)) c++; return c; };
    const letters = [...new Set([...phrase.join('')].filter((ch) => /[ء-ي]/.test(ch)))];
    const cnt = (list, L) => list.join('').split(L).length - 1;
    const na = '<span class="rd-na" title="غير متاح في هذا النموذج">—</span>';
    const m = ws.length === 1 ? (QB.morph(first.s, first.a) || [])[first.p - 1] : null;
    const sp = m && m.root ? QB.spread(m.root) : null;
    const rootOnPage = sp ? ALL.filter((x) => x.page === first.page && ((QB.morph(x.s, x.a) || [])[x.p - 1] || {}).root === m.root).length : 0;
    const rows = [[`«${selText()}»`, 'q', seq(pageWs), fullSurah ? seq(surStr) : null, null],
      ...letters.map((L) => [L, 'rd-st-l', cnt(pageWs, L), fullSurah ? cnt(surStr, L) : null, null])];
    QB.modal({ render: (b, close) => {
      b.innerHTML = `<div><h2 class="h2">إحصاء</h2><p class="label">${selRef(ws)}، صفحة ${n(first.page)}</p></div>
        <table class="rd-stat">
          <thead><tr><th scope="col"><span class="sr">اللفظ</span></th><th scope="col">الصفحة</th><th scope="col">السورة</th><th scope="col">القرآن</th></tr></thead>
          <tbody>${rows.map(([k, cls, p, s, q]) => `<tr><th scope="row" class="${cls}">${k}</th><td>${n(p)}</td><td>${s == null ? na : n(s)}</td><td>${q == null ? na : n(q)}</td></tr>`).join('')}
          ${sp ? `<tr class="rd-st-root"><th scope="row">مواضع الجذر <b class="letters">${QB.letters(sp.root)}</b></th><td>${n(rootOnPage)}</td><td>${n(sp.counts[first.s - 1])}</td><td>${n(sp.total)}</td></tr>` : ''}</tbody>
        </table>
        <p class="rd-st-note">${fullSurah ? `سورة ${sur.name} محمّلة كاملة، فأرقامها محسوبة من نصّها.` : `«—» غير متاح في هذا النموذج: حُمّل من سورة ${sur.name} ${ayahsWord(loadedAyahs.size)} من ${n(sur.ayahs)}، ولا يُحمَّل نص القرآن كاملاً.`}
          ${sp ? ` أرقام الجذر من بيانات الانتشار الحقيقية (${n(sp.total)} موضعاً في ${n(sp.surahs)} سورة).` : ''} الحروف تُعدّ بلا تشكيل، والألف بصورها حرفٌ واحد.</p>
        <button class="ghost sm" data-x style="align-self:flex-start">إغلاق</button>`;
      b.querySelector('[data-x]').addEventListener('click', close);
    } });
  }

  /* ---------------- Recitation follow ---------------- */
  let litVerse = null;
  function paintRec(scroll) {
    const on = !!R.rec;
    pagesEl.classList.toggle('reciting', on);
    const key = on ? `${R.rec.s}:${R.rec.a}` : null;
    if (litVerse !== key || !on) {
      pagesEl.querySelectorAll('.rd-ay.now, .rd-row.now').forEach((x) => x.classList.remove('now'));
      pagesEl.querySelectorAll('.rd-w.speak, .rd-w.said').forEach((w) => w.classList.remove('speak', 'said'));
    }
    litVerse = key;
    if (!on) return;
    const sp = pagesEl.querySelector(`.rd-ay[data-ay="${key}"]`);
    if (!sp) return;
    sp.classList.add('now');
    const row = sp.closest('.rd-row'); if (row) row.classList.add('now');
    sp.querySelectorAll('.rd-w').forEach((w, k) => { w.classList.toggle('speak', k === R.rec.word); w.classList.toggle('said', k < R.rec.word); });
    if (scroll && visible()) {
      const box = sp.getBoundingClientRect(), sc = scroller().getBoundingClientRect();
      if (box.top < sc.top + 90 || box.bottom > sc.bottom - 90) sp.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
  const scroller = () => { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; p = p.parentElement; } return document.documentElement; };
  QB.on('rec', (r) => {
    if (!r || !r.on) { const was = !!R.rec; R.rec = null; paintRec(false); if (was) { renderBar(); renderPanel(); } return; }
    const wasOff = !R.rec;
    const changed = wasOff || R.rec.s !== r.s || R.rec.a !== r.a;
    R.rec = { s: r.s, a: r.a, word: r.word };
    if (changed) {
      const pn = QB.pageOf(r.s, r.a);
      if (pn && !shown().includes(pn)) { R.page = pn; renderBody(); afterPage(); }
    }
    if (wasOff) { renderBar(); renderPanel(); }
    paintRec(changed);
    if (changed) emitCurrent();
  });
  function playPage() {
    if (R.rec) { QB.player.stop(); return; }
    const ayahs = shown().map(QB.page).filter(Boolean).flatMap((p) => p.ayahs);
    if (!ayahs.length) { QB.toast(`${LOADED_LINE} اختر صفحة محمّلة لتسمعها.`); return; }
    let idx = 0;
    const w = selWords()[0];
    if (w) idx = Math.max(0, ayahs.findIndex((x) => x.s === w.s && x.a === w.a));
    QB.player.start({ ayahs, idx });
  }

  /* ---------------- Navigation ---------------- */
  let turnT;
  function afterPage() {
    const pg = QB.page(R.page);
    if (pg) QB.set('lastRead', { page: R.page, s: pg.ayahs[0].s, a: pg.ayahs[0].a, at: QB.today.toISOString() });
    renderBar();
    if (host() === 'reader') QB.setTitle();
    renderPanel();
    emitCurrent();
  }
  const emitCurrent = () => { if (QB.mushaf) QB.emit('mushaf', QB.mushaf.current()); };
  function goPage(pn, o = {}) {
    pn = clamp(pn);
    const from = R.page;
    const keepSel = o.keepSel && R.sel;
    const done = () => {
      R.page = pn;
      if (!keepSel) { R.sel = null; R.anchor = null; renderSelBar(); }
      renderBody();
      if (o.dir && !reduced()) {
        pagesEl.classList.remove('turn-next', 'turn-prev'); void pagesEl.offsetWidth;
        pagesEl.classList.add(o.dir > 0 ? 'turn-next' : 'turn-prev');
        clearTimeout(turnT); turnT = setTimeout(() => pagesEl.classList.remove('turn-next', 'turn-prev'), 400);
      }
      if (!o.flash && !o.keepScroll) { const sc = scroller(); if (sc && el.contains(pagesEl) && sc !== document.documentElement) { const top = el.offsetTop; if (sc.scrollTop > top) sc.scrollTop = top; } }
      afterPage();
      if (o.flash) flash(o.flash);
    };
    if (Math.abs(pn - from) > 3 && visible() && !reduced() && o.travel !== false) travel(from, pn, done);
    else done();
  }
  function travel(from, to, done) {
    const t = $('.rd-travel'), b = t.querySelector('b');
    t.querySelector('span').textContent = `إلى سورة ${info(to).name}`;
    t.classList.add('on');
    const st = performance.now(), D = 720;
    let finished = false;
    const end = () => { if (finished) return; finished = true; b.textContent = n(to); done(); setTimeout(() => t.classList.remove('on'), 160); };
    const step = (now) => {
      const k = Math.min(1, (now - st) / D), e = 1 - Math.pow(1 - k, 3);
      b.textContent = n(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
    setTimeout(end, D + 400);   // background tabs throttle rAF
  }
  function flash({ s, a }) {
    setTimeout(() => {
      const sp = pagesEl.querySelector(`.rd-ay[data-ay="${s}:${a}"]`);
      if (!sp) return;
      const tgt = sp.closest('.rd-row') || sp;
      tgt.classList.remove('flash'); void tgt.offsetWidth; tgt.classList.add('flash');
      setTimeout(() => tgt.classList.remove('flash'), 2000);
      if (visible()) sp.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }, 30);
  }
  function turn(dir) {
    const base = R.spread ? pairStart(R.page) : R.page;
    const to = clamp(base + dir * (R.spread ? 2 : 1));
    if (to === R.page || (R.spread && pairStart(to) === pairStart(R.page))) return;
    goPage(to, { dir, travel: false });
  }
  function goTo(target, o = {}) {
    if (!target) return;
    if (target.page) { goPage(+target.page, { flash: null }); return; }
    if (target.s) {
      const a = target.a || 1;
      const pn = QB.pageOf(target.s, a);
      if (pn) { goPage(pn, { flash: o.flash !== false ? { s: target.s, a } : null }); return; }
      const sur = QB.surah(target.s);
      if (sur.page) { goPage(sur.page); QB.toast(`الآية ${n(a)} من سورة ${sur.name} خارج الصفحات المحمّلة؛ فُتحت بداية السورة.`); }
    }
  }
  function openNavigator() {
    QB.sheet({ title: 'انتقل', render(body, close) {
      const onPick = (target) => { close(); if (host() === 'reader' || visible()) goTo(target, { flash: true }); else QB.go('reader', target); };
      if (QB.navigator) QB.navigator(body, { tab: 'surahs', onPick });
      else fallbackNavigator(body, onPick);
    } });
  }
  // Minimal stand-in until screens/navigate.js provides QB.navigator.
  function fallbackNavigator(body, onPick) {
    const cur = info(R.page).s;
    body.innerHTML = `
      <div class="field"><label for="rd-nav-q">اسم السورة أو رقمها، أو صفحة</label><input class="input" id="rd-nav-q" placeholder="اسم السورة أو رقمها · ٢:٢٥٥ · صفحة ٥٠" autocomplete="off"></div>
      <form class="rd-nav-page" id="rd-nav-pf"><div class="field"><label for="rd-nav-p">رقم الصفحة (١–${n(TOTAL)})</label><input class="input" id="rd-nav-p" inputmode="numeric" value="${R.page}"></div><button class="ghost sm" type="submit">انتقال</button></form>
      <p class="label">${LOADED_LINE}</p>
      <ul class="list rd-nav-list" id="rd-nav-l"></ul>`;
    const q = body.querySelector('#rd-nav-q'), list = body.querySelector('#rd-nav-l');
    const digits = (s) => s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    const draw = () => {
      const v = QB.strip(digits(q.value.trim()));
      const hits = QB.data.index.filter((x) => !v || String(x.id) === v || QB.strip(x.name).includes(v) || x.en.toLowerCase().includes(v.toLowerCase()));
      list.innerHTML = hits.length ? hits.map((x) => `<li><button class="row" data-s="${x.id}" ${x.id === cur ? 'aria-current="true"' : ''}>
          <span class="rd-nav-n">${n(x.id)}</span><span class="t">${x.name}<small>${x.type === 'medinan' ? 'مدنيّة' : 'مكّيّة'}، ${ayahsWord(x.ayahs)}، صفحة ${n(x.page)}</small></span>${LOADED.includes(x.page) ? '<span class="pill gold">محمّلة</span>' : ''}</button></li>`).join('')
        : '<li><p class="empty">لا توجد سورة بهذا الاسم.</p></li>';
    };
    draw();
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = digits(q.value.trim());
      const ref = v.match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/), pg = v.match(/^صفحة\s*(\d{1,3})$/);
      if (ref) return onPick({ s: +ref[1], a: +ref[2] });
      if (pg) return onPick({ page: +pg[1] });
      const first = list.querySelector('[data-s]'); if (first) first.click();
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) onPick({ page: QB.surah(+b.dataset.s).page }); });
    body.querySelector('#rd-nav-pf').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = +digits(body.querySelector('#rd-nav-p').value.trim());
      if (p >= 1 && p <= TOTAL) onPick({ page: p }); else QB.toast(`اكتب رقم صفحة بين ١ و${n(TOTAL)}.`);
    });
  }
  function toggleSavePage(pn) {
    pn = +pn;
    if (isSaved(pn)) { QB.set('savedPages', QB.state.savedPages.filter((x) => x.page !== pn)); QB.toast('أُزيلت الصفحة من المحفوظات.'); }
    else { QB.set('savedPages', [{ page: pn, at: QB.today.toISOString() }, ...QB.state.savedPages]); QB.toast(`حُفظت صفحة ${n(pn)} في «المحفوظة».`); }
  }
  function setFocus(on) {
    R.focus = on;
    const app = QB.$('#app');
    if (app) app.classList.toggle('rd-focus', on);
    el.classList.toggle('focus', on);
    R.width = el.clientWidth;
    renderBar();
    if (canSpread() !== R.spread) renderBody();
    if (on) QB.toast('وضع التركيز: اضغط F أو Esc للخروج.');
  }
  function setPanel(open) {
    R.panelOpen = open;
    const r = room();
    if (r) r.classList.toggle('solo', !open);
    setTimeout(() => { R.width = el.clientWidth; renderBar(); if (canSpread() !== R.spread) renderBody(); }, 30);
  }
  function setMode(m) { QB.set('readingMode', m); }

  /* ---------------- Events on the stage ---------------- */
  el.addEventListener('click', (e) => {
    const w = e.target.closest('.rd-w');
    if (w && pagesEl.contains(w)) { onWord(w.dataset.k); return; }
    const mk = e.target.closest('.rd-mk');
    if (mk) { onMarker(mk.dataset.ay); return; }
    const t = e.target.closest('[data-act]');
    if (!t || !el.contains(t)) return;
    const act = t.dataset.act;
    if (act === 'nav') openNavigator();
    else if (act === 'tool') { if (t.getAttribute('aria-disabled') === 'true') lockToast(); else setTool(t.dataset.tool); }
    else if (act === 'search') QB.go('search', {});
    else if (act === 'strip') { R.strip = !R.strip; renderBar(); renderStrip(); }
    else if (act === 'play') playPage();
    else if (act === 'savepage') toggleSavePage(t.dataset.n);
    else if (act === 'focus') setFocus(!R.focus);
    else if (act === 'panel') setPanel(!R.panelOpen);
    else if (act === 'prev') turn(-1);
    else if (act === 'next') turn(1);
    else if (act === 'page') goPage(+t.dataset.n);
    else if (act === 'mode') setMode(t.dataset.mode);
    else if (act === 'themes') QB.set('themeHighlight', !QB.state.themeHighlight);
    else if (act === 'tr') {
      const k = t.dataset.tr, cur = QB.state.translations || [];
      const has = cur.some((x) => trKind(x) === k);
      if (!has && cur.length >= 3) { QB.toast('ثلاث ترجمات على الأكثر.'); return; }
      QB.set('translations', has ? cur.filter((x) => trKind(x) !== k) : [...cur, k]);
    }
    else if (act === 'settings') QB.go('settings', { section: 'translations' });
    else if (act === 'clear') clearSel();
    else if (act === 'exact') QB.go('search', { q: selText(), mode: 'exact' });
    else if (act === 'root') QB.go('search', { q: t.dataset.root, mode: 'root' });
    else if (act === 'ask') ask();
    else if (act === 'stats') stats();
    else if (act === 'copy') copy(t);
  });

  /* Keyboard: PageUp/PageDown, Shift+M, F, Esc, 0/1/2, arrows between words, Enter/Space act. */
  document.addEventListener('keydown', (e) => {
    if (!visible() || document.querySelector('.sheet.on, .modal.on')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .ribbon')) return;
    const word = t && t.classList && t.classList.contains('rd-w') ? t : null;
    if (word && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const ws = [...pagesEl.querySelectorAll('.rd-w')];
      const i = ws.indexOf(word) + (e.key === 'ArrowLeft' ? 1 : -1);   // RTL: left is the next word
      const nx = ws[Math.max(0, Math.min(ws.length - 1, i))];
      word.tabIndex = -1; nx.tabIndex = 0; nx.focus();
      if (R.tool === 'select' && !R.rec && R.sel && R.sel.kind === 'word') { R.anchor = IDX[nx.dataset.k]; setSel(R.anchor, R.anchor); }
      return;
    }
    if (word && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onWord(word.dataset.k); return; }
    if (e.key === 'PageDown') { e.preventDefault(); turn(1); }
    else if (e.key === 'PageUp') { e.preventDefault(); turn(-1); }
    else if (e.shiftKey && e.code === 'KeyM') { e.preventDefault(); setMode(QB.state.readingMode === 'page' ? 'ayahs' : 'page'); QB.toast(QB.state.readingMode === 'page' ? 'طريقة القراءة: صفحات' : 'طريقة القراءة: آية آية'); }
    else if (!e.shiftKey && e.code === 'KeyF' && host() === 'reader') { e.preventDefault(); setFocus(!R.focus); }
    else if (!e.shiftKey && /^(Digit|Numpad)[012]$/.test(e.code)) { e.preventDefault(); setTool(TOOLS[+e.code.slice(-1)][0]); }
    else if (e.key === 'Escape') { if (R.sel) clearSel(); else if (R.focus) setFocus(false); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (t === document.body || el.contains(t))) { e.preventDefault(); turn(e.key === 'ArrowLeft' ? 1 : -1); }
  });

  // Spread or single page depends on the room's width.
  try {
    new ResizeObserver(() => {
      const w = el.clientWidth;
      if (!w || w === R.width) return;
      R.width = w;
      if (canSpread() !== R.spread) renderBody();
    }).observe(el);
  } catch (e) {}

  QB.on('state', ({ key }) => {
    if (key === 'quranSize') { el.style.setProperty('--rd-size', `${QB.state.quranSize}px`); if (canSpread() !== R.spread) renderBody(); }
    else if (key === 'readingMode') { renderBar(); renderStrip(); renderBody(); }
    else if (key === 'themeHighlight') { paintTints(); renderStrip(); }
    else if (key === 'translations') { renderStrip(); if (QB.state.readingMode === 'ayahs') renderBody(); renderPanel(); }
    else if (key === 'savedPages') { renderBar(); pagesEl.querySelectorAll('.rd-ribbon').forEach((b) => { b.outerHTML = ribbonBtn(+b.dataset.n); }); }
    else if (key === 'numerals') renderAll();
  });
  QB.on('notebook', () => { paintTints(); renderPanel(); });
  QB.on('route', ({ name }) => {
    el.dataset.host = name;
    if (name !== 'reader' && R.focus) setFocus(false);
    renderBar();
    R.width = el.clientWidth;
    if (canSpread() !== R.spread) renderBody();
  });

  function renderAll() { renderBar(); renderStrip(); renderBody(); renderSelBar(); renderPanel(); }

  /* ---------------- Public API ---------------- */
  QB.mushaf = {
    el,
    goTo,
    current() {
      if (R.rec) return { page: R.page, s: R.rec.s, a: R.rec.a };
      const w = selWords()[0];
      if (w) return { page: R.page, s: w.s, a: w.a };
      const pg = QB.page(R.page);
      return pg ? { page: R.page, s: pg.ayahs[0].s, a: pg.ayahs[0].a } : { page: R.page, s: info(R.page).s, a: null };
    },
  };

  el.dataset.tool = R.tool;
  el.style.setProperty('--rd-size', `${QB.state.quranSize}px`);
  renderAll();
  // «جارٍ تحميل المصحف» until the Quran font is ready.
  const ready = () => el.classList.add('ready');
  try { if (document.fonts && document.fonts.load) { document.fonts.load(`26px "Amiri Quran"`).then(ready, ready); setTimeout(ready, 2500); } else ready(); } catch (e) { ready(); }

  /* ---------------- The reader's study panel ---------------- */
  function panelHead(kicker) {
    return `<div class="rd-pn-head"><span class="kicker">${kicker}</span>${wideScreen() ? `<button class="icon-btn" data-pact="collapse" aria-label="إخفاء لوحة الدراسة" title="إخفاء لوحة الدراسة">${QB.ico('panel', 'sm')}</button>` : ''}</div>`;
  }
  function meaning(verses) {
    const list = verses.slice(0, 3);
    return `<div class="rd-mean">
      <div class="rd-mean-head"><span class="label">${list.length === 1 ? `معنى الآية ${n(list[0].a)}` : 'معاني الآيات'}</span>
        <div class="tabs" role="tablist" aria-label="لغة المعنى">${['english', 'french'].map((k) => `<button role="tab" data-pact="lang" data-l="${k}" aria-selected="${R.lang === k}">${trLabel[k]}</button>`).join('')}</div></div>
      ${list.map((v) => { const t = QB.trans(v.s, v.a) || {}; return `<p class="rd-mean-t" lang="${R.lang === 'english' ? 'en' : 'fr'}" dir="ltr">${list.length > 1 ? `<b>${v.a}.</b> ` : ''}${cleanTr(t[R.lang]) || '<span class="muted">—</span>'}</p>`; }).join('')}
      ${verses.length > 3 ? `<p class="label">وفي التحديد ${ayahsWord(verses.length - 3)} أخرى.</p>` : ''}
      <div class="rd-src" dir="ltr">${SOURCE}</div>
    </div>`;
  }
  function rootBlock(root, s) {
    const sp = QB.spread(root);
    if (!sp) return `<p class="empty">انتشار الجذر ${QB.letters(root)} غير محمّل في هذا النموذج.</p>`;
    return `<div class="rd-root">
      <div class="rd-root-line"><div><div class="label">الجذر</div><div class="letters rd-root-l">${QB.letters(sp.root)}</div></div>
        <div class="figures"><div><b>${n(sp.total)}</b><span>موضعاً</span></div><div><b>${n(sp.surahs)}</b><span>سورة</span></div></div></div>
      ${QB.ribbon(sp.counts, { here: s - 1, live: true, grow: true, id: 'rd-rib', label: `انتشار الجذر ${sp.root} في السور، اضغط سورة لترى المواضع` })}
      <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="rd-rib-r"></span><span>${QB.data.names[113]}</span></div>
    </div>`;
  }
  function panelWord(w) {
    const m = (QB.morph(w.s, w.a) || [])[w.p - 1];
    const v = { s: w.s, a: w.a };
    return `${panelHead('دراسة الكلمة')}
      <div class="rd-word"><div class="rd-big">${w.w}</div><div class="rd-where">${QB.surah(w.s).name} ${n(w.a)}<br>الكلمة ${n(w.p)}</div></div>
      ${anaGrid(m)}
      <hr class="rule">
      ${m && m.root ? rootBlock(m.root, w.s) : m ? `<p class="empty">«${w.w}» بلا جذر: ${esc(m.pos_label || 'أداة')}. اضغط كلمة أخرى لترى جذرها وانتشاره.</p>` : ''}
      <div class="rd-pn-acts">
        ${m && m.root ? `<button class="cta sm" data-pact="root" data-root="${m.root}">كل المواضع</button>` : `<button class="cta sm" data-pact="exact">بحث بالعبارة</button>`}
        <button class="ghost sm" data-pact="save">${QB.ico('bookmark', 'sm')}${QB.noteOf(w.s, w.a) ? 'في الدفتر' : 'احفظ'}</button>
        <button class="ghost sm" data-pact="ask">${QB.ico('study', 'sm')}اسأل الدراسة</button>
      </div>
      <hr class="rule">
      ${meaning([v])}`;
  }
  function panelRange(ws) {
    const verses = [], seen = new Set();
    ws.forEach((x) => { const k = `${x.s}:${x.a}`; if (!seen.has(k)) { seen.add(k); verses.push({ s: x.s, a: x.a }); } });
    const roots = [], rs = new Set();
    ws.forEach((x) => { const m = (QB.morph(x.s, x.a) || [])[x.p - 1]; if (m && m.root && !rs.has(m.root)) { rs.add(m.root); roots.push(m.root); } });
    const whole = R.sel.kind === 'verse';
    return `${panelHead(whole ? 'الآية كاملة' : 'التحديد')}
      <div><p class="rd-pn-q">${selText()}</p><p class="label">${words(ws.length)}، ${selRef(ws)}</p></div>
      <div class="rd-pn-acts">
        <button class="cta sm" data-pact="exact">بحث بالعبارة</button>
        <button class="ghost sm" data-pact="save">${QB.ico('bookmark', 'sm')}${QB.noteOf(verses[0].s, verses[0].a) ? 'في الدفتر' : 'احفظ الآية'}</button>
        <button class="ghost sm" data-pact="ask">${QB.ico('study', 'sm')}اسأل الدراسة</button>
      </div>
      ${roots.length ? `<hr class="rule"><div><div class="block-title"><h3 class="h3">جذور التحديد</h3><span class="label">اضغط جذراً لترى مواضعه</span></div>
        <div class="rd-roots">${roots.map((r) => { const sp = QB.spread(r); return `<button class="rd-rootchip" data-pact="root" data-root="${r}"><span><b class="letters">${QB.letters(r)}</b><small>${sp ? `${n(sp.total)} موضعاً في ${n(sp.surahs)} سورة` : ''}</small></span>${sp ? QB.miniRibbon(sp.counts) : ''}</button>`; }).join('')}</div></div>` : ''}
      <hr class="rule">
      ${meaning(verses)}`;
  }
  function panelPage() {
    const pn = R.page, inf = info(pn), sur = QB.surah(inf.s);
    const pages = shown();
    const notes = QB.state.notebook.filter((x) => pages.includes(QB.pageOf(x.s, x.a))).sort((a, b) => a.s - b.s || a.a - b.a);
    const loaded = pages.some((p) => QB.page(p));
    const toolHint = R.rec ? `<p class="rd-pn-hint">${LOCK}.</p>`
      : R.tool === 'select' ? ''
      : `<p class="rd-pn-hint">اختر أداة «تحديد» ثم ${TOOL_HINT.select}.</p><button class="ghost sm" data-pact="tool" data-tool="select">${QB.ico('cursor', 'sm')}تحديد (1)</button>`;
    return `${panelHead(R.spread ? `صفحتا ${n(pages[0])} و${n(pages[1] || pages[0])}` : `صفحة ${n(pn)}`)}
      <div>
        <h2 class="h2 rd-pn-title">سورة ${sur.name}</h2>
        <div class="label" dir="ltr" style="text-align:end">${esc(sur.en)}</div>
      </div>
      <div class="facts"><span>${typeOf(inf.s)}</span><span><b>${n(sur.ayahs)}</b> آية</span><span>الجزء <b>${n(inf.juz)}</b></span><span>تبدأ في صفحة <b>${n(sur.page)}</b></span></div>
      <div>
        ${QB.ribbon(QB.data.index.map((x) => x.ayahs), { here: inf.s - 1, live: true, id: 'rd-srib', label: 'طول السور وموضعك بينها، اضغط سورة لتنتقل إليها' })}
        <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="rd-srib-r"></span><span>${QB.data.names[113]}</span></div>
      </div>
      <hr class="rule">
      <div>
        <div class="block-title"><h3 class="h3">من دفترك في ${R.spread ? 'الصفحتين' : 'هذه الصفحة'}</h3>${notes.length ? `<button class="link" data-pact="notebook">الدفتر ${QB.ico('chevL', 'sm')}</button>` : ''}</div>
        ${!loaded ? `<p class="empty">${LOADED_LINE}</p>`
          : notes.length ? `<ul class="list">${notes.map((x) => { const v = QB.ayah(x.s, x.a); const th = x.themes.map(QB.theme).filter(Boolean); return `<li class="rd-note">
              <button class="row" data-pact="flash" data-s="${x.s}" data-a="${x.a}"><span class="rd-dots">${(th.length ? th : [{ color: 'gray' }]).map((t) => `<span class="th-dot" style="--c:${QB.thColor(t.color)}"></span>`).join('')}</span>
                <span class="t"><span class="rd-note-q">${QB.words(v.text).slice(0, 5).join(' ')}…</span><small>الآية ${n(x.a)}، ${th.length ? th.map((t) => esc(t.name)).join('، ') : 'بلا موضوع'}</small></span></button>
              <button class="icon-btn" data-pact="edit" data-s="${x.s}" data-a="${x.a}" aria-label="تعديل مواضيع الآية ${n(x.a)}">${QB.ico('edit', 'sm')}</button></li>`; }).join('')}</ul>`
          : `<p class="empty">لم تحفظ آيةً من ${R.spread ? 'الصفحتين' : 'هذه الصفحة'} بعد. اختر أداة «تظليل» ثم اضغط آية لتحفظها بموضوع.</p>${R.tool !== 'hl' && !R.rec ? `<button class="ghost sm" data-pact="tool" data-tool="hl">${QB.ico('pen', 'sm')}تظليل (2)</button>` : ''}`}
      </div>
      ${toolHint ? `<hr class="rule"><div class="rd-pn-tip">${toolHint}</div>` : ''}`;
  }
  function renderPanel() {
    if (!panelEl || host() !== 'reader') return;
    const ws = selWords();
    const keepTop = panelEl.scrollTop;
    panelEl.innerHTML = `<div class="rd-pn" aria-live="polite">${!ws.length ? panelPage() : R.sel.kind === 'word' ? panelWord(ws[0]) : panelRange(ws)}</div>`;
    if (!ws.length) panelEl.scrollTop = keepTop;
    const rib = panelEl.querySelector('#rd-rib');
    if (rib) {
      const w = ws[0], m = (QB.morph(w.s, w.a) || [])[w.p - 1], sp = QB.spread(m.root);
      QB.wireRibbon(rib, panelEl.querySelector('#rd-rib-r'), (i) => `${QB.data.names[i]}: ${n(sp.counts[i])}`, null, () => `${QB.surah(w.s).name}: ${n(sp.counts[w.s - 1])}، أنت هنا`);
      wireBarClick(rib, () => QB.go('search', { q: m.root, mode: 'root' }));
    }
    const srib = panelEl.querySelector('#rd-srib');
    if (srib) {
      const s = info(R.page).s;
      QB.wireRibbon(srib, panelEl.querySelector('#rd-srib-r'), (i) => { const x = QB.data.index[i]; return `${x.name}: ${ayahsWord(x.ayahs)}، صفحة ${n(x.page)}`; }, null, () => `أنت في سورة ${QB.surah(s).name}`);
      wireBarClick(srib, (i) => goPage(QB.data.index[i].page));
    }
  }
  function wireBarClick(rib, fn) {
    rib.tabIndex = 0;
    const at = (x) => [...rib.children].find((b) => { const r = b.getBoundingClientRect(); return x >= r.left - 1 && x <= r.right + 1; });
    rib.addEventListener('click', (e) => { const b = at(e.clientX); if (b) fn(+b.dataset.i); });
    rib.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const h = rib.querySelector('.bar.hov') || rib.querySelector('.bar.here'); if (h) fn(+h.dataset.i); } });
  }

  QB.screen('reader', {
    room: 'mushaf',
    panelWidth: 420,
    world: 'reading',
    title: () => ['المصحف', 'مصحف المدينة النبوية، رواية حفص عن عاصم'],
    mount(panel) {
      panelEl = panel;
      panel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-pact]');
        if (!t) return;
        const act = t.dataset.pact, ws = selWords(), w = ws[0];
        if (act === 'collapse') setPanel(false);
        else if (act === 'lang') { R.lang = t.dataset.l; renderPanel(); }
        else if (act === 'root') QB.go('search', { q: t.dataset.root, mode: 'root' });
        else if (act === 'exact') QB.go('search', { q: selText(), mode: 'exact' });
        else if (act === 'save' && w) QB.saveAyah(w.s, w.a);
        else if (act === 'ask') ask();
        else if (act === 'tool') setTool(t.dataset.tool);
        else if (act === 'notebook') QB.go('notebook', { tab: 'verses' });
        else if (act === 'flash') flash({ s: +t.dataset.s, a: +t.dataset.a });
        else if (act === 'edit') QB.saveAyah(+t.dataset.s, +t.dataset.a);
      });
    },
    show(panel, p = {}) {
      panelEl = panel;
      const r = room(); if (r) r.classList.toggle('solo', !R.panelOpen);
      el.dataset.host = 'reader';
      R.width = el.clientWidth;
      if (p.keepScroll && R.started) { renderAll(); return; }
      if (p.s) {
        const pn = QB.pageOf(+p.s, +(p.a || 1));
        if (pn && p.p) {
          const i = IDX[`${p.s}:${p.a}:${p.p}`];
          goPage(pn, { travel: false, flash: null });
          if (i != null) { if (R.tool !== 'select') { R.tool = 'select'; el.dataset.tool = 'select'; renderBar(); } R.anchor = i; setSel(i, i); setRoving(keyOf(ALL[i])); }
        } else goTo({ s: +p.s, a: +(p.a || 1) }, { flash: true });
      } else if (p.page) goPage(+p.page, { travel: false });
      else if (!R.started) {
        const lr = QB.state.lastRead || {};
        goPage(lr.page || R.page, { travel: false, flash: lr.s && QB.pageOf(lr.s, lr.a) ? { s: lr.s, a: lr.a } : null });
      } else { renderBar(); if (canSpread() !== R.spread) renderBody(); renderPanel(); }
      R.started = true;
    },
    hide() { if (R.focus) setFocus(false); },
  });
})();
