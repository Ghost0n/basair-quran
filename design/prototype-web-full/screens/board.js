/* Theme board (لوحة الموضوع): one topic theme laid out on a drafting table.
   Production uses React Flow; this is a light vanilla equivalent: pan/zoom world, nodes, typed links,
   minimap, 7-step history, simulated autosave. Prefix bd-. Params {id}; default b1. */
(() => {
  const N = (x) => QB.n(x);
  const esc = QB.esc;

  QB.icons.bdUndo = '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>';
  QB.icons.bdRedo = '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>';
  QB.icons.bdShape = '<rect x="3.5" y="13.5" width="7" height="7" rx="1"/><circle cx="17" cy="17" r="3.5"/><path d="M12 2.5l4.5 4.5-4.5 4.5L7.5 7z"/>';
  QB.icons.bdMinus = '<path d="M5 12h14"/>';
  QB.icons.bdFit = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  QB.icons.bdEyeOff = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 7.6A15.8 15.8 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-1"/>';
  QB.icons.bdStyle = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 20h6"/>';

  const REL = [['explain', 'يفسّر'], ['confirm', 'يؤكّد'], ['contrast', 'يقابل'], ['cause', 'سبب ← نتيجة'], ['example', 'مثال'], ['recur', 'يتكرّر في']];
  const DIRECTED = new Set(['explain', 'confirm', 'cause', 'example', 'recur', 'custom']);
  const COLORS = ['green', 'blue', 'pink', 'purple', 'teal', 'sand'];
  const SIZES = ['S', 'M', 'L', 'XL'];
  const FONTS = [['naskh', 'نسخ'], ['kufi', 'كوفي'], ['simple', 'بسيط']];
  const BORDERS = [['solid', 'متصل'], ['dashed', 'متقطّع'], ['none', 'بلا']];
  const SHAPES = [['rect', 'مستطيل'], ['ellipse', 'شكل بيضاوي'], ['diamond', 'معيّن']];
  const DEF_BORDER = { ayah: 'solid', note: 'solid', heading: 'none', shape: 'solid' };
  const DEF_FONT = { ayah: 'naskh', note: 'simple', heading: 'naskh', shape: 'simple' };
  const HIST = 7;
  const SEEDS = {
    b1: {
      heading: 'من البصر إلى البصيرة',
      notes: ['البصائر جمع بصيرة: نورٌ في القلب يُبصَر به الحقّ، كما يُبصَر الطريق بالعين.', 'من اتّخذ هواه إلهاً جُعلت على بصره غشاوة: يرى ولا يُبصر.'],
      links: [['n0', 'a0', 'explain'], ['a0', 'a1', 'contrast'], ['a1', 'n1', 'cause']],
    },
    b2: {
      heading: 'بنو إسرائيل في الجاثية',
      notes: ['آتاهم الكتاب والحكم والنبوّة وفضّلهم، ثم اختلفوا من بعد ما جاءهم العلم بغياً بينهم.'],
      links: [['a0', 'a1', 'confirm'], ['n0', 'a0', 'explain']],
    },
  };

  /* ---------------- State ---------------- */
  let root = null, board = null, theme = null;
  let M = { nodes: [], edges: [] }, V = { px: 0, py: 0, z: 1 };
  let sel = new Set(), selEdge = null, undo = [], redo = [];
  let saveT = null, saveState = 'saved', geo = {}, mids = {}, drag = null, touched = false;
  let ui = { verses: false, styleOpen: false, menu: false, pop: null };
  let editPre = null, editing = null, lastNudge = 0, addN = 0, seedPlan = null, suppressFocus = false;
  const ptrs = new Map();

  const $ = (s) => root.querySelector(s);
  const node = (id) => M.nodes.find((x) => x.id === id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const g = (nd) => geo[nd.id] || { x: nd.x, y: nd.y, w: 300, h: 200 };
  const shortRef = (s, a) => `${QB.surah(s).name} ${N(a)}`;
  const themeVerses = () => QB.state.notebook.filter((x) => x.themes.includes(board.themeId)).sort((p, q) => p.s - q.s || p.a - q.a);
  const visible = () => M.nodes.filter((x) => !x.hidden);
  const relLabel = (e) => (e.type === 'custom' ? e.label || '' : (REL.find((r) => r[0] === e.type) || [0, ''])[1]);
  const colorName = (k) => (QB.swatchKeys.find((x) => x[0] === k) || [0, k])[1];
  const ayatCount = (k) => (k === 0 ? 'لا آيات بعد' : k === 1 ? 'آية واحدة' : k === 2 ? 'آيتان' : k <= 10 ? `${N(k)} آيات` : `${N(k)} آية`);
  const nodeName = (nd) => {
    if (!nd) return '';
    if (nd.type === 'ayah') return shortRef(nd.s, nd.a);
    const t = (nd.text || '').trim();
    const kind = { note: 'ملاحظة', heading: 'عنوان', shape: (SHAPES.find((x) => x[0] === nd.shape) || [0, 'شكل'])[1] }[nd.type];
    return t ? `${kind}: ${t.slice(0, 28)}${t.length > 28 ? '…' : ''}` : kind;
  };

  /* ---------------- History + autosave ---------------- */
  const undoAct = { action: 'تراجَع', onAction: () => { if (QB.current() === 'board') doUndo(); } };
  const pushHist = (pre) => { undo.push(pre); if (undo.length > HIST) undo.shift(); redo = []; };
  const snap = () => pushHist(JSON.stringify(M));
  function restore(json) {
    M = JSON.parse(json);
    sel = new Set([...sel].filter((id) => node(id) && !node(id).hidden));
    if (selEdge && !M.edges.some((e) => e.id === selEdge)) selEdge = null;
    closePop();
    renderNodes(); scheduleSave();
  }
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(M)); if (redo.length > HIST) redo.shift(); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(M)); if (undo.length > HIST) undo.shift(); restore(redo.pop()); }

  function scheduleSave() {
    saveState = 'saving'; paintSave(); updateTools();
    clearTimeout(saveT);
    saveT = setTimeout(flush, 900);
  }
  function flush() {
    clearTimeout(saveT); saveT = null;
    if (!board) return;
    if (navigator.onLine === false) { saveState = 'fail'; paintSave(); return; }
    board.nodes = clone(M.nodes); board.edges = clone(M.edges); board.view = Object.assign({}, V);
    board.at = QB.today.toISOString().slice(0, 10);
    saveState = 'saved'; paintSave();
    QB.emit('boards', { id: board.id });
  }
  function paintSave() {
    const el = root && $('.bd-save');
    if (!el) return;
    el.dataset.s = saveState;
    el.innerHTML = saveState === 'saving' ? 'جارٍ الحفظ…'
      : saveState === 'fail' ? `تعذّر الحفظ <button class="link" data-act="retry">أعد المحاولة</button>`
      : 'محفوظ';
  }

  /* ---------------- Seeding, sync, layout ---------------- */
  function seed() {
    const sp = SEEDS[board.id] || { heading: board.name, notes: ['ما الذي يجمع هذه الآيات؟'], links: [['n0', 'a0', 'explain'], ['a0', 'a1', 'confirm']] };
    const ay = themeVerses().map((v) => ({ id: QB.uid('na'), type: 'ayah', s: v.s, a: v.a, x: 0, y: 0 }));
    const h = { id: QB.uid('nh'), type: 'heading', text: sp.heading, x: -180, y: -150 };
    const notes = ay.length ? sp.notes.map((t) => ({ id: QB.uid('nn'), type: 'note', text: t, x: 0, y: 320 })) : [];
    const refs = { h };
    ay.forEach((x, i) => (refs['a' + i] = x));
    notes.forEach((x, i) => (refs['n' + i] = x));
    M = { nodes: [h, ...ay, ...notes], edges: [] };
    sp.links.forEach(([f, t, type]) => { if (refs[f] && refs[t]) M.edges.push({ id: QB.uid('e'), from: refs[f].id, to: refs[t].id, type }); });
    seedPlan = { h: h.id, notes: notes.map((x, i) => [x.id, (ay[i] || ay[0]).id]) };
  }
  // Runs after the first measure so the heading and notes sit against real card sizes.
  function postSeed() {
    if (!seedPlan) return;
    layoutAyahs();
    const ay = visible().filter((x) => x.type === 'ayah');
    const H = node(seedPlan.h);
    if (ay.length) {
      const right = Math.max(...ay.map((x) => x.x + g(x).w));
      const bottom = Math.max(...ay.map((x) => x.y + g(x).h));
      if (H) { H.x = Math.round(right - g(H).w); H.y = Math.round(-(g(H).h + 64)); }
      seedPlan.notes.forEach(([nid, aid]) => { const nn = node(nid), a = node(aid); if (nn && a) { nn.x = Math.round(a.x + (g(a).w - g(nn).w) / 2); nn.y = Math.round(bottom + 104); } });
    } else if (H) { H.x = Math.round(-g(H).w / 2); H.y = -40; }
    placeAll();
  }
  // Keep ayah nodes in step with the theme's verses in the notebook.
  function sync() {
    const verses = themeVerses();
    const keys = new Set(verses.map((v) => `${v.s}:${v.a}`));
    const gone = new Set(M.nodes.filter((x) => x.type === 'ayah' && !keys.has(`${x.s}:${x.a}`)).map((x) => x.id));
    if (gone.size) { M.nodes = M.nodes.filter((x) => !gone.has(x.id)); M.edges = M.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)); }
    const have = new Set(M.nodes.filter((x) => x.type === 'ayah').map((x) => `${x.s}:${x.a}`));
    const base = M.nodes.length ? Math.max(...M.nodes.map((x) => x.y)) + 360 : 0;
    let i = 0;
    verses.forEach((v) => { if (!have.has(`${v.s}:${v.a}`)) M.nodes.push({ id: QB.uid('na'), type: 'ayah', s: v.s, a: v.a, x: 170 - (i++ + 1) * 460, y: base }); });
    return gone.size + i;
  }
  // Mushaf order, reading from the right: first verse in the right-hand column.
  function layoutAyahs() {
    const ay = visible().filter((x) => x.type === 'ayah').sort((p, q) => p.s - q.s || p.a - q.a);
    if (!ay.length) return;
    const cols = ay.length <= 3 ? ay.length : ay.length === 4 ? 2 : 3;
    const W = Math.max(...ay.map((x) => g(x).w)), G = 130;
    const total = cols * W + (cols - 1) * G;
    let y = 0;
    for (let r = 0; r * cols < ay.length; r++) {
      const row = ay.slice(r * cols, r * cols + cols);
      row.forEach((x, c) => { x.x = Math.round(total / 2 - (c + 1) * W - c * G + (W - g(x).w) / 2); x.y = y; });
      y += Math.max(...row.map((x) => g(x).h)) + 150;
    }
    placeAll();
  }

  /* ---------------- Rendering ---------------- */
  function shell(el) {
    const verses = themeVerses();
    el.innerHTML = `
      <div class="bd">
        <header class="bd-bar">
          <button class="quiet bd-back" data-act="back">${QB.ico('chevR', 'sm')}العودة إلى الدفتر</button>
          <div class="bd-id">
            <div class="bd-kick"><span class="kicker" id="bd-count">لوحة الموضوع، ${ayatCount(verses.length)}</span>
              <span class="bd-theme"><span class="th-dot" style="--c:${QB.thColor(theme.color)}"></span>${esc(theme.name)}</span></div>
            <label class="sr" for="bd-name">اسم اللوحة</label>
            <input class="bd-name" id="bd-name" value="${esc(board.name)}" maxlength="80" autocomplete="off" spellcheck="false">
          </div>
          <div class="bd-end">
            <span class="bd-save" role="status" title="يُحفظ في ذاكرة هذا النموذج"></span>
            <button class="ghost sm" data-act="export">${QB.ico('doc', 'sm')}صدّر كبحث</button>
          </div>
        </header>
        <div class="bd-tools" role="toolbar" aria-label="أدوات اللوحة">
          ${tool('undo', 'bdUndo', 'تراجع', 'تراجع (Ctrl+Z)')}
          ${tool('redo', 'bdRedo', 'إعادة', 'إعادة (Ctrl+Y)')}
          <span class="bd-div" aria-hidden="true"></span>
          ${tool('add-note', 'note', 'ملاحظة', 'أضف ملاحظة')}
          ${tool('add-heading', 'text', 'عنوان', 'أضف عنواناً')}
          <span class="bd-menu-wrap">
            <button class="bd-tool" data-act="shape-menu" aria-haspopup="menu" aria-expanded="false" aria-label="شكل" title="أضف شكلاً">${QB.ico('bdShape', 'sm')}<span>شكل</span>${QB.ico('chevD', 'sm')}</button>
            <span class="bd-menu" role="menu" hidden>${SHAPES.map(([k, l]) => `<button role="menuitem" data-act="add-shape" data-shape="${k}"><span class="bd-mi bd-mi-${k}" aria-hidden="true"></span>${l}</button>`).join('')}</span>
          </span>
          <span class="bd-div" aria-hidden="true"></span>
          <button class="bd-tool" data-act="verses" aria-pressed="false" aria-label="الآيات" title="آيات الموضوع">${QB.ico('book', 'sm')}<span>الآيات</span><b class="bd-badge" hidden></b></button>
          ${tool('delete', 'trash', 'حذف', 'حذف (Delete)')}
          ${tool('arrange', 'grid', 'ترتيب', 'ترتيب الآيات بترتيب المصحف')}
        </div>
        <div class="bd-canvas">
          <div class="bd-stage" aria-label="مساحة اللوحة: اسحب لتحريك المساحة، Ctrl مع العجلة للتكبير">
            <div class="bd-world">
              <div class="bd-rosette">${QB.girih()}</div>
              <svg class="bd-edges" viewBox="-6000 -6000 12000 12000" aria-hidden="true">
                <defs><marker id="bd-ar" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5L8.5 5L1 8.5" class="bd-arp"/></marker>
                  <marker id="bd-ar-on" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5L8.5 5L1 8.5" class="bd-arp on"/></marker></defs>
                <g class="bd-eg"></g><path class="bd-live" d=""/>
              </svg>
              <div class="bd-elabels"></div>
              <div class="bd-nodes"></div>
            </div>
          </div>
          ${verses.length ? '' : `<div class="bd-empty"><p>لا آيات في هذا الموضوع بعد. ظلِّل آيات بهذا الموضوع من القراءة (أداة «تظليل») لتظهر هنا.</p><button class="ghost sm" data-act="reader">${QB.ico('book', 'sm')}افتح المصحف</button></div>`}
          <aside class="bd-verses" aria-label="آيات الموضوع" hidden></aside>
          <aside class="bd-style" aria-label="تنسيق العنصر" hidden></aside>
          <button class="bd-style-pill" data-act="style-open" hidden>${QB.ico('bdStyle', 'sm')}تنسيق العنصر</button>
          <div class="bd-nav">
            <div class="bd-zoom" role="group" aria-label="التكبير">
              <button data-act="zoom-in" aria-label="تكبير" title="تكبير">${QB.ico('plus', 'sm')}</button>
              <output class="bd-pct" aria-live="polite"></output>
              <button data-act="zoom-out" aria-label="تصغير" title="تصغير">${QB.ico('bdMinus', 'sm')}</button>
              <button data-act="fit" aria-label="ملاءمة اللوحة للشاشة" title="ملاءمة اللوحة للشاشة">${QB.ico('bdFit', 'sm')}</button>
            </div>
            <svg class="bd-mini" role="img" aria-label="خريطة اللوحة: اضغط لتوسيط العرض"></svg>
          </div>
          <div class="bd-pop" role="dialog" aria-label="نوع العلاقة" hidden></div>
        </div>
      </div>`;
    wireStage();
    $('#bd-name').addEventListener('input', (e) => { board.name = e.target.value; scheduleSave(); });
    $('#bd-name').addEventListener('change', (e) => { if (!e.target.value.trim()) { e.target.value = board.name = 'لوحة بلا اسم'; } QB.setTitle(); });
    $('#bd-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }
  const tool = (act, icon, label, title) => `<button class="bd-tool" data-act="${act}" aria-label="${title}" title="${title}">${QB.ico(icon, 'sm')}<span>${label}</span></button>`;

  function nodeHTML(nd) {
    const s = nd.style || {};
    const st = [`left:${nd.x}px`, `top:${nd.y}px`];
    if (s.color) st.push(`--nfg:var(--th-${s.color})`);
    if (s.bg) st.push(`--nbg:color-mix(in srgb, var(--th-${s.bg}) 16%, var(--bg-elev-1))`);
    if (s.borderColor) st.push(`--nbd:var(--th-${s.borderColor})`);
    const cls = `bd-node bd-${nd.type}${sel.has(nd.id) ? ' on' : ''}`;
    const attrs = `class="${cls}" data-id="${nd.id}" data-border="${s.border || DEF_BORDER[nd.type]}" data-size="${s.size || 'M'}" data-font="${s.font || DEF_FONT[nd.type]}" style="${st.join(';')}" tabindex="0" role="group"`;
    const handles = '<span class="bd-h" data-side="r" title="اسحب لربط هذا العنصر بآخر"></span><span class="bd-h" data-side="l" title="اسحب لربط هذا العنصر بآخر"></span>';
    if (nd.type === 'ayah') {
      const v = QB.ayah(nd.s, nd.a);
      const prev = nd.ctx && nd.a > 1 ? QB.ayah(nd.s, nd.a - 1) : null;
      const next = nd.ctx ? QB.ayah(nd.s, nd.a + 1) : null;
      const mk = (a) => `<span class="marker"><i>${N(a)}</i></span>`;
      const page = QB.pageOf(nd.s, nd.a);
      return `<div ${attrs} aria-label="آية: سورة ${QB.surah(nd.s).name}، الآية ${N(nd.a)}">
        <div class="bd-ref"><span class="th-dot" style="--c:${QB.thColor(theme.color)}"></span><b class="bd-f">${QB.surah(nd.s).name}، الآية ${N(nd.a)}</b>${page ? `<span>صفحة ${N(page)}</span>` : ''}</div>
        ${prev ? `<p class="bd-ctx" lang="ar">${prev.text} ${mk(nd.a - 1)}</p>` : ''}
        ${v ? `<p class="bd-q" lang="ar">${v.text} ${mk(nd.a)}</p>` : '<p class="bd-miss">نص هذه الآية خارج الصفحات المحمّلة في هذا النموذج.</p>'}
        ${next ? `<p class="bd-ctx" lang="ar">${next.text} ${mk(nd.a + 1)}</p>` : ''}
        ${nd.ctx && !prev && !next ? '<p class="bd-miss">لا سياق محمّلاً حول هذه الآية في النموذج.</p>' : ''}
        <div class="bd-acts"><button class="link" data-act="ctx" aria-expanded="${!!nd.ctx}">${nd.ctx ? 'طيّ السياق' : 'عرض السياق'}</button><button class="link" data-act="open">${QB.ico('book', 'sm')}افتح في المصحف</button></div>
        ${handles}</div>`;
    }
    const ph = { note: 'ملاحظة…', heading: 'عنوان…', shape: 'نص…' }[nd.type];
    const text = `<div class="bd-text bd-f" data-ph="${ph}" dir="rtl" lang="ar">${esc(nd.text || '')}</div>`;
    if (nd.type === 'shape') {
      const sh = nd.shape === 'ellipse' ? '<ellipse cx="50" cy="50" rx="49" ry="49" vector-effect="non-scaling-stroke"/>'
        : nd.shape === 'diamond' ? '<polygon points="50,1 99,50 50,99 1,50" vector-effect="non-scaling-stroke"/>'
        : '<rect x="1" y="1" width="98" height="98" rx="3" vector-effect="non-scaling-stroke"/>';
      return `<div ${attrs} data-shape="${nd.shape}" aria-label="${esc(nodeName(nd))}"><svg class="bd-shp" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${sh}</svg>${text}${handles}</div>`;
    }
    return `<div ${attrs} aria-label="${esc(nodeName(nd))}">${text}${handles}</div>`;
  }

  function renderNodes() {
    const layer = $('.bd-nodes');
    if (!layer) return;
    layer.innerHTML = visible().map(nodeHTML).join('');
    measure(); drawEdges(); drawMinimap(); renderStyle(); renderVerses(); updateTools();
  }
  function measure() {
    geo = {};
    root.querySelectorAll('.bd-node').forEach((el) => { const nd = node(el.dataset.id); if (nd) geo[nd.id] = { x: nd.x, y: nd.y, w: el.offsetWidth, h: el.offsetHeight }; });
  }
  function placeAll() {
    root.querySelectorAll('.bd-node').forEach((el) => {
      const nd = node(el.dataset.id); if (!nd) return;
      el.style.left = nd.x + 'px'; el.style.top = nd.y + 'px';
      if (geo[nd.id]) { geo[nd.id].x = nd.x; geo[nd.id].y = nd.y; }
    });
    drawEdges(); drawMinimap();
  }
  function refreshSel() {
    root.querySelectorAll('.bd-node').forEach((el) => el.classList.toggle('on', sel.has(el.dataset.id)));
    drawEdges(); drawMinimap(); renderStyle(); updateTools();
  }

  /* Edge geometry: leave each card from the side facing the other, as a soft cubic curve. */
  function side(r, t) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = t.x - cx, dy = t.y - cy;
    if (Math.abs(dx) * r.h > Math.abs(dy) * r.w) return { x: dx > 0 ? r.x + r.w : r.x, y: cy, nx: dx > 0 ? 1 : -1, ny: 0 };
    return { x: cx, y: dy > 0 ? r.y + r.h : r.y, nx: 0, ny: dy > 0 ? 1 : -1 };
  }
  function curve(p1, p2, n2) {
    const k = Math.max(36, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.38);
    const c1 = { x: p1.x + p1.nx * k, y: p1.y + p1.ny * k };
    const c2 = n2 ? { x: p2.x + n2.nx * k, y: p2.y + n2.ny * k } : p2;
    const mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
    return { d: `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`, mid };
  }
  function drawEdges() {
    const gEl = $('.bd-eg'), lab = $('.bd-elabels');
    if (!gEl) return;
    mids = {};
    let paths = '', labels = '';
    M.edges.forEach((e) => {
      const A = geo[e.from], B = geo[e.to];
      if (!A || !B) return;
      const ca = { x: A.x + A.w / 2, y: A.y + A.h / 2 }, cb = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
      const p1 = side(A, cb), p2 = side(B, ca);
      const { d, mid } = curve(p1, p2, p2);
      mids[e.id] = mid;
      const on = e.id === selEdge, rel = sel.has(e.from) || sel.has(e.to);
      const t = e.type || 'none';
      const arrow = DIRECTED.has(t) ? ` marker-end="url(#${on || rel ? 'bd-ar-on' : 'bd-ar'})"` : '';
      const lbl = relLabel(e);
      paths += `<g class="bd-e t-${t}${on ? ' on' : ''}${rel ? ' rel' : ''}"><path class="bd-ehit" d="${d}" data-act="edge" data-eid="${e.id}"/><path class="bd-eline" d="${d}"${arrow}/></g>`;
      labels += `<button class="bd-elabel${on ? ' on' : ''}${lbl ? '' : ' empty'}" data-act="edge" data-eid="${e.id}" style="left:${mid.x.toFixed(1)}px;top:${mid.y.toFixed(1)}px" aria-label="العلاقة: ${esc(lbl || 'بلا وصف')}، من ${esc(nodeName(node(e.from)))} إلى ${esc(nodeName(node(e.to)))}">${esc(lbl || 'نوع العلاقة؟')}</button>`;
    });
    gEl.innerHTML = paths; lab.innerHTML = labels;
    if (ui.pop) positionPop();
  }

  /* ---------------- View: pan, zoom, minimap ---------------- */
  const stageRect = () => $('.bd-stage').getBoundingClientRect();
  function applyView() {
    const w = $('.bd-world'), st = $('.bd-stage');
    if (!w) return;
    w.style.transform = `translate(${V.px}px, ${V.py}px) scale(${V.z})`;
    st.style.setProperty('--gs', `${22 * V.z}px`);
    st.style.setProperty('--gx', `${V.px}px`);
    st.style.setProperty('--gy', `${V.py}px`);
    $('.bd-pct').textContent = `${N(Math.round(V.z * 100))}٪`;
    drawMinimap();
    if (ui.pop) positionPop();
  }
  const clampZ = (z) => Math.min(2, Math.max(0.3, z));
  function zoomAt(z, sx, sy) {
    const r = stageRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const wx = (sx - V.px) / V.z, wy = (sy - V.py) / V.z;
    V.z = clampZ(z); V.px = sx - wx * V.z; V.py = sy - wy * V.z;
    touched = true; applyView();
  }
  function bounds(list) {
    const gs = list.map((x) => geo[x.id]).filter(Boolean);
    if (!gs.length) return { x: -300, y: -200, w: 600, h: 400 };
    const x0 = Math.min(...gs.map((r) => r.x)), y0 = Math.min(...gs.map((r) => r.y));
    const x1 = Math.max(...gs.map((r) => r.x + r.w)), y1 = Math.max(...gs.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fit() {
    const r = stageRect(); if (!r.width) return;
    const b = bounds(visible()), pad = r.width < 600 ? 28 : 72;
    const side = ui.verses && r.width > 900 ? 330 : 0;
    const styleW = sel.size && r.width > 720 ? 270 : 0;
    const aw = r.width - side - styleW - pad * 2, ah = r.height - pad * 2;
    V.z = clampZ(Math.min(1, aw / b.w, ah / b.h));
    V.px = styleW + pad + (aw - b.w * V.z) / 2 - b.x * V.z;
    V.py = pad + (ah - b.h * V.z) / 2 - b.y * V.z;
    applyView();
  }
  function centerOn(wx, wy) {
    const r = stageRect();
    V.px = r.width / 2 - wx * V.z; V.py = r.height / 2 - wy * V.z;
    touched = true; applyView();
  }
  let mm = null;
  function drawMinimap() {
    const svg = root && $('.bd-mini');
    if (!svg || !svg.clientWidth) return;
    const W = svg.clientWidth, H = svg.clientHeight, r = stageRect();
    const vw = { x: -V.px / V.z, y: -V.py / V.z, w: r.width / V.z, h: r.height / V.z };
    const b = bounds(visible());
    const x0 = Math.min(b.x, vw.x) - 60, y0 = Math.min(b.y, vw.y) - 60;
    const x1 = Math.max(b.x + b.w, vw.x + vw.w) + 60, y1 = Math.max(b.y + b.h, vw.y + vw.h) + 60;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    mm = { s, ox, oy, x0, y0 };
    const tx = (x) => (ox + (x - x0) * s).toFixed(1), ty = (y) => (oy + (y - y0) * s).toFixed(1);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = visible().map((nd) => { const q = geo[nd.id]; return q ? `<rect class="bd-mr t-${nd.type}${sel.has(nd.id) ? ' on' : ''}" x="${tx(q.x)}" y="${ty(q.y)}" width="${Math.max(2, q.w * s).toFixed(1)}" height="${Math.max(2, q.h * s).toFixed(1)}" rx="1.5"/>` : ''; }).join('')
      + `<rect class="bd-mv" x="${tx(vw.x)}" y="${ty(vw.y)}" width="${(vw.w * s).toFixed(1)}" height="${(vw.h * s).toFixed(1)}" rx="2"/>`;
  }

  /* ---------------- Pointer interaction ---------------- */
  function toWorld(e) { const r = stageRect(); return { x: (e.clientX - r.left - V.px) / V.z, y: (e.clientY - r.top - V.py) / V.z }; }
  function wireStage() {
    const st = $('.bd-stage');
    st.addEventListener('pointerdown', onDown);
    st.addEventListener('pointermove', onMove);
    st.addEventListener('pointerup', onUp);
    st.addEventListener('pointercancel', onUp);
    st.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stageRect();
      if (e.ctrlKey || e.metaKey) zoomAt(V.z * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      else { V.px -= e.shiftKey ? e.deltaY : e.deltaX; V.py -= e.shiftKey ? 0 : e.deltaY; touched = true; applyView(); }
    }, { passive: false });
    st.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.bd-node');
      if (el && el.querySelector('.bd-text') && !e.target.closest('button')) startEdit(el.dataset.id);
    });
    const mini = $('.bd-mini');
    let miniDrag = null;
    const miniGo = (e) => { if (!miniDrag) return; const r = mini.getBoundingClientRect(); const m = miniDrag; centerOn((e.clientX - r.left - m.ox) / m.s + m.x0, (e.clientY - r.top - m.oy) / m.s + m.y0); };
    mini.addEventListener('pointerdown', (e) => { miniDrag = Object.assign({}, mm); try { mini.setPointerCapture(e.pointerId); } catch (_) {} miniGo(e); });
    mini.addEventListener('pointermove', miniGo);
    mini.addEventListener('pointerup', () => { miniDrag = null; drawMinimap(); });
  }
  function onDown(e) {
    const st = e.currentTarget;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && (!drag || drag.kind === 'pan')) {
      const [a, b] = [...ptrs.values()];
      const r = stageRect();
      drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: V.z, sx: (a.x + b.x) / 2 - r.left, sy: (a.y + b.y) / 2 - r.top };
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.bd-elabel, .bd-ehit')) return;
    const h = e.target.closest('.bd-h');
    const el = e.target.closest('.bd-node');
    if (h && el) {
      e.preventDefault();
      drag = { kind: 'link', from: el.dataset.id, id: e.pointerId };
      try { st.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (el) {
      if (e.target.closest('button')) return;
      if (editing === el.dataset.id && e.target.closest('.bd-text')) return;
      e.preventDefault();
      const id = el.dataset.id;
      closePop(); closeMenu(); selEdge = null;
      if (e.shiftKey) { if (sel.has(id)) { sel.delete(id); refreshSel(); return; } sel.add(id); }
      else if (!sel.has(id)) sel = new Set([id]);
      suppressFocus = true; el.focus({ preventScroll: true }); suppressFocus = false;
      refreshSel();
      const w = toWorld(e);
      drag = { kind: 'move', id: e.pointerId, w0: w, start: [...sel].map((k) => [k, node(k).x, node(k).y]), pre: JSON.stringify(M), moved: false };
      try { st.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    drag = { kind: 'pan', id: e.pointerId, x0: e.clientX, y0: e.clientY, px: V.px, py: V.py, moved: false };
    st.classList.add('panning');
    try { st.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      zoomAt(drag.z0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0, drag.sx, drag.sy);
      return;
    }
    if (drag.id !== e.pointerId) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      V.px = drag.px + dx; V.py = drag.py + dy; if (drag.moved) touched = true; applyView();
    } else if (drag.kind === 'move') {
      const w = toWorld(e), dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
      if (!drag.moved && Math.hypot(dx * V.z, dy * V.z) < 3) return;
      drag.moved = true;
      drag.start.forEach(([k, x, y]) => { const nd = node(k); nd.x = Math.round(x + dx); nd.y = Math.round(y + dy); });
      placeAll();
    } else if (drag.kind === 'link') {
      const A = geo[drag.from], w = toWorld(e);
      if (!A) return;
      const p1 = side(A, w);
      $('.bd-live').setAttribute('d', curve(p1, { x: w.x, y: w.y }).d);
      root.querySelectorAll('.bd-node.target').forEach((x) => x.classList.remove('target'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-node');
      if (over && over.dataset.id !== drag.from) over.classList.add('target');
    }
  }
  function onUp(e) {
    ptrs.delete(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'pinch') { if (ptrs.size < 2) drag = null; return; }
    if (drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    $('.bd-stage').classList.remove('panning');
    if (d.kind === 'pan' && !d.moved) { sel.clear(); selEdge = null; closePop(); closeMenu(); refreshSel(); }
    if (d.kind === 'move' && d.moved) { pushHist(d.pre); scheduleSave(); drawMinimap(); }
    if (d.kind === 'link') {
      $('.bd-live').setAttribute('d', '');
      root.querySelectorAll('.bd-node.target').forEach((x) => x.classList.remove('target'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-node');
      if (over && over.dataset.id !== d.from) link(d.from, over.dataset.id);
    }
  }
  function link(from, to) {
    const dup = M.edges.find((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from));
    if (dup) { openPop(dup.id); QB.toast('بين هذين العنصرين علاقة من قبل؛ عدّل نوعها.'); return; }
    snap();
    const e = { id: QB.uid('e'), from, to, type: null };
    M.edges.push(e);
    drawEdges(); scheduleSave();
    openPop(e.id);
  }

  /* ---------------- Editing text nodes ---------------- */
  function startEdit(id) {
    const el = root.querySelector(`.bd-node[data-id="${id}"] .bd-text`);
    if (!el) return;
    if (editing && editing !== id) endEdit();
    editing = id; editPre = JSON.stringify(M);
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function endEdit() {
    if (!editing) return;
    const id = editing; editing = null;
    const el = root.querySelector(`.bd-node[data-id="${id}"] .bd-text`);
    if (el) el.removeAttribute('contenteditable');
    const nd = node(id);
    if (nd && editPre && JSON.parse(editPre).nodes.find((x) => x.id === id)?.text !== nd.text) { pushHist(editPre); updateTools(); }
    const host = el && el.closest('.bd-node'); if (host && nd) host.setAttribute('aria-label', nodeName(nd));
    editPre = null;
  }

  /* ---------------- Commands ---------------- */
  function viewCenter() { const r = stageRect(); return { x: (r.width / 2 - V.px) / V.z, y: (r.height / 2 - V.py) / V.z }; }
  function add(type, extra = {}) {
    snap();
    const c = viewCenter(), off = (addN++ % 5) * 26;
    const w = type === 'heading' ? 220 : type === 'shape' ? 180 : 230, h = type === 'shape' ? 110 : 60;
    const nd = Object.assign({ id: QB.uid('n'), type, text: '', x: Math.round(c.x - w / 2 + off), y: Math.round(c.y - h / 2 + off) }, extra);
    M.nodes.push(nd);
    sel = new Set([nd.id]); selEdge = null; closePop();
    renderNodes(); scheduleSave();
    startEdit(nd.id);
  }
  function del() {
    if (selEdge) { snap(); M.edges = M.edges.filter((e) => e.id !== selEdge); selEdge = null; closePop(); renderNodes(); scheduleSave(); QB.toast('حُذفت العلاقة.', undoAct); return; }
    if (!sel.size) return;
    snap();
    const ids = [...sel];
    const rm = new Set(ids.filter((id) => node(id) && node(id).type !== 'ayah'));
    let hid = 0;
    ids.forEach((id) => { const nd = node(id); if (nd && nd.type === 'ayah') { nd.hidden = true; hid++; } });
    M.nodes = M.nodes.filter((x) => !rm.has(x.id));
    M.edges = M.edges.filter((e) => !rm.has(e.from) && !rm.has(e.to));
    sel.clear(); renderNodes(); scheduleSave();
    QB.toast(hid && rm.size ? `حُذف ${rm.size === 1 ? 'عنصر' : N(rm.size) + ' عناصر'}، وأُخفيت ${hid === 1 ? 'آية' : N(hid) + ' آيات'} تبقى في الموضوع.`
      : hid ? (hid === 1 ? 'أُخفيت الآية من اللوحة، وتبقى في الموضوع.' : `أُخفيت ${N(hid)} آيات من اللوحة، وتبقى في الموضوع.`)
      : 'حُذف العنصر.', undoAct);
  }
  function nudge(dx, dy) {
    if (!sel.size) return;
    const t = Date.now();
    if (t - lastNudge > 700) snap();
    lastNudge = t;
    sel.forEach((id) => { const nd = node(id); if (nd) { nd.x += dx; nd.y += dy; } });
    placeAll(); scheduleSave();
  }
  function exportDoc() {
    flush();
    // Sections follow document.js: {id, kind: text|ayat|note|question|machine, title, body, verses:[{s,a,text}]}.
    const sec = (kind, o) => Object.assign({ id: QB.uid('sec'), kind, title: '', body: '', verses: [] }, o);
    const vis = visible();
    const ay = vis.filter((x) => x.type === 'ayah').sort((p, q) => p.s - q.s || p.a - q.a);
    const live = M.edges.filter((e) => vis.some((x) => x.id === e.from) && vis.some((x) => x.id === e.to));
    const used = new Set();
    const heads = vis.filter((x) => x.type === 'heading' && (x.text || '').trim());
    const sentences = live.filter((e) => relLabel(e) && node(e.from).type === 'ayah' && node(e.to).type === 'ayah').map((e) => `«${nodeName(node(e.from))}» ${relLabel(e)} «${nodeName(node(e.to))}».`);
    const sections = [sec('text', { title: heads[0] ? heads[0].text.trim() : board.name, body: sentences.join('\n') })];
    heads.slice(1).forEach((h) => sections.push(sec('text', { title: h.text.trim() })));
    ay.forEach((x) => {
      const notes = live.filter((e) => e.from === x.id || e.to === x.id).map((e) => node(e.from === x.id ? e.to : e.from))
        .filter((o) => o && (o.type === 'note' || o.type === 'shape') && (o.text || '').trim());
      notes.forEach((o) => used.add(o.id));
      const t = QB.ayah(x.s, x.a);
      sections.push(sec('ayat', { title: shortRef(x.s, x.a), body: notes.map((o) => o.text.trim()).join('\n'), verses: [{ s: x.s, a: x.a, text: t ? t.text : '' }] }));
    });
    vis.filter((x) => (x.type === 'note' || x.type === 'shape') && !used.has(x.id) && (x.text || '').trim()).forEach((o) => sections.push(sec('note', { body: o.text.trim() })));
    const d = { id: QB.uid('d'), title: board.name, from: 'board', boardId: board.id, at: QB.today.toISOString().slice(0, 10), status: 'draft', summary: '', version: 1, sections, refs: [] };
    QB.state.documents.unshift(d);
    QB.emit('documents', { id: d.id });
    QB.toast('أُنشئ بحث من اللوحة.');
    QB.go('document', { id: d.id });
  }
  function setStyle(k, v) {
    if (!sel.size) return;
    snap();
    sel.forEach((id) => {
      const nd = node(id); if (!nd) return;
      const s = Object.assign({}, nd.style || {});
      if (v) s[k] = v; else delete s[k];
      nd.style = s;
    });
    renderNodes(); scheduleSave();
  }

  /* ---------------- Relation popover ---------------- */
  function openPop(eid) {
    endEdit();
    selEdge = eid; sel.clear(); ui.pop = eid;
    refreshSel();
    const e = M.edges.find((x) => x.id === eid);
    const pop = $('.bd-pop');
    pop.innerHTML = `<div class="bd-pop-h"><h2 class="h3" id="bd-pop-t">نوع العلاقة</h2><button class="icon-btn" data-act="pop-close" aria-label="إغلاق">${QB.ico('x', 'sm')}</button></div>
      <p class="label bd-pop-ft">${esc(nodeName(node(e.from)))} ${QB.ico('chevL', 'sm')} ${esc(nodeName(node(e.to)))}</p>
      <div class="chips bd-rels">${REL.map(([k, l]) => `<button class="chip" data-act="rel" data-v="${k}" aria-pressed="${e.type === k}">${l}</button>`).join('')}</div>
      <label class="sr" for="bd-rel-custom">وصف آخر للعلاقة</label>
      <input class="input" id="bd-rel-custom" placeholder="وصف آخر…" maxlength="40" value="${e.type === 'custom' ? esc(e.label || '') : ''}" autocomplete="off">
      <div class="bd-pop-f"><button class="cta sm" data-act="rel-done">تمّ</button><button class="quiet danger" data-act="rel-del">${QB.ico('trash', 'sm')}حذف العلاقة</button></div>`;
    pop.setAttribute('aria-labelledby', 'bd-pop-t');
    pop.hidden = false;
    pop.querySelector('#bd-rel-custom').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); relDone(); } });
    positionPop();
    setTimeout(() => pop.querySelector('[aria-pressed="true"]')?.focus() || pop.querySelector('.chip')?.focus(), 30);
  }
  function positionPop() {
    const pop = $('.bd-pop'), m = mids[ui.pop];
    if (!pop || !m) return;
    const r = stageRect(), pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 220;
    let x = V.px + m.x * V.z - pw / 2, y = V.py + m.y * V.z + 18;
    if (y + ph > r.height - 8) y = V.py + m.y * V.z - ph - 18;
    x = Math.max(8, Math.min(r.width - pw - 8, x)); y = Math.max(8, Math.min(r.height - ph - 8, y));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function closePop() { ui.pop = null; const p = root && $('.bd-pop'); if (p) { p.hidden = true; p.innerHTML = ''; } }
  function relDone() {
    const e = M.edges.find((x) => x.id === ui.pop);
    const v = ($('#bd-rel-custom')?.value || '').trim();
    if (e && v && !(e.type === 'custom' && e.label === v)) { snap(); e.type = 'custom'; e.label = v; drawEdges(); scheduleSave(); }
    const eid = ui.pop; closePop(); selEdge = eid; drawEdges();
    root.querySelector(`.bd-elabel[data-eid="${eid}"]`)?.focus();
  }

  /* ---------------- Side panels ---------------- */
  function renderStyle() {
    const panel = $('.bd-style'), pill = $('.bd-style-pill');
    if (!panel) return;
    const list = [...sel].map(node).filter(Boolean);
    const narrow = window.matchMedia('(max-width: 720px)').matches;
    if (!list.length) { panel.hidden = true; pill.hidden = true; ui.styleOpen = false; return; }
    pill.hidden = !narrow || ui.styleOpen;
    panel.hidden = narrow && !ui.styleOpen;
    panel.classList.toggle('strip', narrow);
    const f = list[0], s = f.style || {};
    const allAyah = list.every((x) => x.type === 'ayah'), anyAyah = list.some((x) => x.type === 'ayah');
    const colorRow = (k, label) => `<div class="bd-srow"><span class="label" id="bd-l-${k}">${label}</span>
      <div class="bd-sw" role="group" aria-labelledby="bd-l-${k}"><button class="bd-def" data-act="sty" data-k="${k}" data-v="" aria-pressed="${!s[k]}">افتراضي</button>${COLORS.map((c) => `<button class="swatch" data-act="sty" data-k="${k}" data-v="${c}" aria-label="${colorName(c)}" title="${colorName(c)}" aria-pressed="${s[k] === c}" style="--c:var(--th-${c})"></button>`).join('')}</div></div>`;
    const segRow = (k, label, opts, cur) => `<div class="bd-srow"><span class="label" id="bd-l-${k}">${label}</span>
      <div class="seg-ctl" role="group" aria-labelledby="bd-l-${k}">${opts.map(([v, l]) => `<button data-act="sty" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div></div>`;
    const others = M.nodes.filter((x) => !x.hidden && !sel.has(x.id));
    panel.innerHTML = `<div class="bd-style-h"><h2 class="h3">تنسيق العنصر</h2><span class="label">${list.length === 1 ? esc(nodeName(f)) : `${N(list.length)} عناصر`}</span>
        <button class="icon-btn bd-style-x" data-act="style-close" aria-label="إغلاق التنسيق">${QB.ico('x', 'sm')}</button></div>
      <div class="bd-style-b">
      ${colorRow('color', 'لون النص')}
      ${colorRow('bg', 'الخلفية')}
      ${segRow('border', 'الإطار', BORDERS, s.border || DEF_BORDER[f.type])}
      ${colorRow('borderColor', 'لون الإطار')}
      ${segRow('size', 'الحجم', SIZES.map((x) => [x, x]), s.size || 'M')}
      ${segRow('font', 'الخط', FONTS, s.font || DEF_FONT[f.type])}
      ${anyAyah ? '<p class="bd-hint">نصّ الآية يبقى بخطّ المصحف؛ الخط يغيّر المرجع وما حوله.</p>' : ''}
      ${list.length === 1 && others.length ? `<div class="bd-srow"><label class="label" for="bd-linkto">اربط بعنصر</label><select class="select" id="bd-linkto"><option value="">اختر عنصراً…</option>${others.map((x) => `<option value="${x.id}">${esc(nodeName(x))}</option>`).join('')}</select></div>` : ''}
      <div class="bd-style-f">
        <button class="quiet" data-act="sty-reset">إعادة التنسيق</button>
        ${allAyah ? `<button class="quiet" data-act="delete">${QB.ico('bdEyeOff', 'sm')}إخفاء من اللوحة (تبقى في الموضوع)</button>`
          : `<button class="quiet danger" data-act="delete">${QB.ico('trash', 'sm')}${anyAyah ? 'حذف، وإخفاء الآيات' : 'حذف'}</button>`}
      </div></div>`;
    const lt = panel.querySelector('#bd-linkto');
    if (lt) lt.addEventListener('change', () => { if (lt.value) link(f.id, lt.value); });
  }
  function renderVerses() {
    const p = $('.bd-verses');
    if (!p) return;
    p.hidden = !ui.verses;
    if (!ui.verses) return;
    const vs = themeVerses();
    const hidden = M.nodes.filter((x) => x.type === 'ayah' && x.hidden).length;
    p.innerHTML = `<div class="bd-vh"><div><h2 class="h3">آيات الموضوع</h2><span class="label"><span class="th-dot" style="--c:${QB.thColor(theme.color)}"></span> ${esc(theme.name)}، ${ayatCount(vs.length)}${hidden ? `، ${N(hidden)} مخفيّة` : ''}</span></div>
        <button class="icon-btn" data-act="verses" aria-label="إغلاق آيات الموضوع">${QB.ico('x', 'sm')}</button></div>
      ${vs.length ? `<ul class="list bd-vlist">${vs.map((v) => {
        const nd = M.nodes.find((x) => x.type === 'ayah' && x.s === v.s && x.a === v.a);
        const t = QB.ayah(v.s, v.a);
        const on = nd && !nd.hidden;
        return `<li class="bd-vrow"><button class="bd-vref" data-act="verse-go" data-id="${nd ? nd.id : ''}" ${on ? '' : 'disabled'}><b>${QB.surah(v.s).name}، الآية ${N(v.a)}</b>${t ? `<span class="q">${QB.words(t.text).slice(0, 7).join(' ')}…</span>` : ''}</button>
          <span class="bd-vsw"><span class="label" id="bd-vs-${nd ? nd.id : v.id}">إظهار في اللوحة</span><button class="switch" role="switch" aria-checked="${!!on}" aria-labelledby="bd-vs-${nd ? nd.id : v.id}" data-act="vis" data-id="${nd ? nd.id : ''}"></button></span></li>`;
      }).join('')}</ul>` : '<p class="empty">لا آيات في هذا الموضوع بعد. ظلِّل آيات بهذا الموضوع من القراءة (أداة «تظليل») لتظهر هنا.</p>'}
      <p class="label bd-vfoot">لإضافة آية إلى اللوحة ظلِّلها بموضوع «${esc(theme.name)}» من القراءة.</p>`;
  }
  function updateTools() {
    if (!root || !$('.bd-tools')) return;
    const b = (a) => $(`.bd-tools [data-act="${a}"]`);
    b('undo').disabled = !undo.length; b('redo').disabled = !redo.length;
    const list = [...sel].map(node).filter(Boolean);
    const d = b('delete');
    d.disabled = !list.length && !selEdge;
    const onlyAyah = list.length && list.every((x) => x.type === 'ayah');
    const t = onlyAyah ? 'إخفاء من اللوحة (تبقى في الموضوع)' : selEdge ? 'حذف العلاقة (Delete)' : 'حذف (Delete)';
    d.title = t; d.setAttribute('aria-label', t);
    d.querySelector('span').textContent = onlyAyah ? 'إخفاء' : 'حذف';
    const hidden = M.nodes.filter((x) => x.type === 'ayah' && x.hidden).length;
    const v = b('verses'), badge = v.querySelector('.bd-badge');
    badge.hidden = !hidden; badge.textContent = N(hidden);
    v.setAttribute('aria-pressed', String(ui.verses));
    v.setAttribute('aria-label', hidden ? `الآيات، ${N(hidden)} مخفيّة` : 'الآيات');
    $('#bd-count').textContent = `لوحة الموضوع، ${ayatCount(themeVerses().length)}`;
  }
  function closeMenu() {
    ui.menu = false;
    const m = root && $('.bd-menu'); if (m) m.hidden = true;
    const b = root && $('[data-act="shape-menu"]'); if (b) b.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- Screen ---------------- */
  QB.screen('board', {
    world: 'research',
    title: () => ['الدفتر', board && theme ? `لوحات «${theme.name}»` : 'اللوحات'],
    mount(el) {
      root = el;
      el.addEventListener('click', (e) => {
        if (ui.menu && !e.target.closest('.bd-menu-wrap')) closeMenu();
        const t = e.target.closest('[data-act]');
        if (!t || !board) { if (!board && t && t.dataset.act === 'back') QB.go('notebook', { tab: 'boards' }); return; }
        const act = t.dataset.act;
        const host = t.closest('.bd-node');
        const nd = host && node(host.dataset.id);
        if (act === 'back') { endEdit(); QB.go('notebook', { tab: 'boards' }); }
        else if (act === 'undo') { endEdit(); doUndo(); }
        else if (act === 'redo') { endEdit(); doRedo(); }
        else if (act === 'add-note') add('note');
        else if (act === 'add-heading') add('heading');
        else if (act === 'shape-menu') {
          ui.menu = !ui.menu;
          const m = $('.bd-menu'), r = t.getBoundingClientRect();
          m.style.top = `${r.bottom + 6}px`; m.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
          m.hidden = !ui.menu; t.setAttribute('aria-expanded', String(ui.menu));
          if (ui.menu) m.querySelector('button').focus();
        }
        else if (act === 'add-shape') { closeMenu(); add('shape', { shape: t.dataset.shape }); }
        else if (act === 'verses') { ui.verses = !ui.verses; renderVerses(); updateTools(); if (ui.verses) $('.bd-verses button')?.focus(); }
        else if (act === 'delete') { endEdit(); del(); }
        else if (act === 'arrange') { endEdit(); snap(); layoutAyahs(); scheduleSave(); fit(); QB.toast('رُتّبت الآيات بترتيب المصحف.'); }
        else if (act === 'export') exportDoc();
        else if (act === 'retry') flush();
        else if (act === 'reader') QB.go('reader', {});
        else if (act === 'zoom-in') zoomAt(V.z * 1.2);
        else if (act === 'zoom-out') zoomAt(V.z / 1.2);
        else if (act === 'fit') { touched = true; fit(); }
        else if (act === 'ctx' && nd) { snap(); nd.ctx = !nd.ctx; renderNodes(); scheduleSave(); root.querySelector(`.bd-node[data-id="${nd.id}"] [data-act="ctx"]`)?.focus(); }
        else if (act === 'open' && nd) QB.go('reader', { s: nd.s, a: nd.a });
        else if (act === 'edge') openPop(t.dataset.eid);
        else if (act === 'pop-close') { const eid = ui.pop; closePop(); root.querySelector(`.bd-elabel[data-eid="${eid}"]`)?.focus(); }
        else if (act === 'rel') {
          const ed = M.edges.find((x) => x.id === ui.pop);
          if (ed && ed.type !== t.dataset.v) { snap(); ed.type = t.dataset.v; delete ed.label; drawEdges(); scheduleSave(); }
          $('.bd-pop').querySelectorAll('[data-act="rel"]').forEach((c) => c.setAttribute('aria-pressed', String(c === t)));
          $('#bd-rel-custom').value = '';
        }
        else if (act === 'rel-done') relDone();
        else if (act === 'rel-del') { snap(); M.edges = M.edges.filter((x) => x.id !== ui.pop); closePop(); selEdge = null; drawEdges(); scheduleSave(); QB.toast('حُذفت العلاقة.', undoAct); }
        else if (act === 'sty') setStyle(t.dataset.k, t.dataset.v);
        else if (act === 'sty-reset') { snap(); sel.forEach((id) => { const x = node(id); if (x) delete x.style; }); renderNodes(); scheduleSave(); }
        else if (act === 'style-open') { ui.styleOpen = true; renderStyle(); $('.bd-style button')?.focus(); }
        else if (act === 'style-close') { if (window.matchMedia('(max-width: 720px)').matches) { ui.styleOpen = false; renderStyle(); } else { sel.clear(); refreshSel(); } }
        else if (act === 'vis') {
          const x = node(t.dataset.id); if (!x) return;
          snap(); x.hidden = !x.hidden; if (x.hidden) sel.delete(x.id);
          renderNodes(); scheduleSave();
          root.querySelector(`.bd-verses [data-act="vis"][data-id="${x.id}"]`)?.focus();
        }
        else if (act === 'verse-go') {
          const x = node(t.dataset.id), q = x && geo[x.id]; if (!q) return;
          centerOn(q.x + q.w / 2, q.y + q.h / 2);
          sel = new Set([x.id]); refreshSel();
          const ne = root.querySelector(`.bd-node[data-id="${x.id}"]`);
          if (ne) { ne.classList.remove('flash'); void ne.offsetWidth; ne.classList.add('flash'); }
        }
      });
      // Typing in a text node: keep the model, the edges and the save state in step.
      el.addEventListener('input', (e) => {
        const tx = e.target.closest('.bd-text'); if (!tx) return;
        const nd = node(tx.closest('.bd-node').dataset.id); if (!nd) return;
        nd.text = tx.textContent; if (!nd.text) tx.innerHTML = '';
        const q = geo[nd.id]; const host = tx.closest('.bd-node'); if (q) { q.w = host.offsetWidth; q.h = host.offsetHeight; }
        drawEdges(); drawMinimap(); scheduleSave();
      });
      el.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.bd-text[contenteditable]')) endEdit(); });
      el.addEventListener('focusin', (e) => {
        const n0 = e.target.classList && e.target.classList.contains('bd-node') ? e.target : null;
        if (!n0 || suppressFocus || drag) return;
        if (!sel.has(n0.dataset.id)) { sel = new Set([n0.dataset.id]); selEdge = null; closePop(); refreshSel(); }
      });
      document.addEventListener('keydown', (e) => {
        if (QB.current() !== 'board' || !board || !root.querySelector('.bd')) return;
        if (QB.$('.sheet.on, .modal.on')) return;
        const a = document.activeElement;
        if (a && a.isContentEditable) { if (e.key === 'Escape') { const host = a.closest('.bd-node'); endEdit(); host?.focus(); } return; }
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
        if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size || selEdge) { e.preventDefault(); del(); } return; }
        if (e.key.startsWith('Arrow') && sel.size && !(a && a.closest('.bd-pop, .bd-style, .bd-verses, .bd-tools'))) {
          e.preventDefault();
          const st = e.shiftKey ? 40 : 10;
          nudge(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0);
          return;
        }
        if (e.key === 'Enter' && a && a.classList.contains('bd-node') && a.querySelector('.bd-text')) { e.preventDefault(); startEdit(a.dataset.id); return; }
        if (e.key === 'Escape') {
          if (ui.pop) { const eid = ui.pop; closePop(); root.querySelector(`.bd-elabel[data-eid="${eid}"]`)?.focus(); }
          else if (ui.menu) { closeMenu(); $('[data-act="shape-menu"]').focus(); }
          else if (sel.size || selEdge) { sel.clear(); selEdge = null; refreshSel(); }
        }
      });
      let rt;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (QB.current() === 'board' && board && root.querySelector('.bd')) { applyView(); renderStyle(); } }, 120); });
      window.addEventListener('online', () => { if (saveState === 'fail') flush(); });
    },
    show(el, params) {
      root = el;
      clearTimeout(saveT);
      const id = params.id || new URLSearchParams(location.search).get('board') || 'b1';
      board = QB.state.boards.find((b) => b.id === id) || null;
      theme = board && QB.theme(board.themeId);
      sel = new Set(); selEdge = null; undo = []; redo = []; drag = null; touched = false; editing = null; seedPlan = null;
      ui = { verses: false, styleOpen: false, menu: false, pop: null };
      saveState = 'saved';
      if (!board || !theme) {
        board = null;
        el.innerHTML = `<div class="wrap narrow bd-missing"><div class="empty-state">${QB.ico('board')}<h2 class="h3">لم يُعثر على هذا الموضوع.</h2><p>ربما حُذف الموضوع أو اللوحة. لوحاتك كلها في الدفتر.</p><button class="ghost sm" data-act="back">${QB.ico('chevR', 'sm')}العودة إلى الدفتر</button></div></div>`;
        QB.setTitle();
        return;
      }
      const fresh = !board.nodes;
      if (fresh) seed(); else M = clone({ nodes: board.nodes, edges: board.edges || [] });
      const synced = sync();
      shell(el);
      renderNodes();
      if (fresh) postSeed();
      if (board.view && !fresh) { V = Object.assign({}, board.view); applyView(); } else { V = { px: 0, py: 0, z: 1 }; requestAnimationFrame(() => { if (!touched) fit(); }); applyView(); }
      paintSave();
      if (fresh) flush(); else if (synced) scheduleSave();
      QB.setTitle();
      const me = board;
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
        if (board !== me || QB.current() !== 'board') return;
        measure();
        if (fresh && !touched) { postSeed(); flush(); }
        drawEdges(); drawMinimap();
        if (!touched && !(board.view && !fresh)) fit();
      });
    },
    hide() {
      endEdit();
      if (board) { if (saveT) flush(); else board.view = Object.assign({}, V); }
    },
  });
})();
