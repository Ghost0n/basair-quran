/* Settings (الإعدادات) and Account (login / signup / forgot / reset / welcome). Prefix set-.
   Settings: a section index on the start side that follows the scroll, the settings on the other.
   Account: the brand on the start side (mark, name, rosette, 45:20), the form on the other. */
(() => {
  const { n, esc } = QB;

  /* ---------------- Shared pieces ---------------- */
  QB.icons['device-laptop'] = '<rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 19h19"/>';
  QB.icons['device-phone'] = '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>';
  QB.icons['device-tablet'] = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>';
  QB.icons['eye'] = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>';
  QB.icons['eye-off'] = '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.9"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>';

  // The 24 interface languages (apps/web/lib/i18n/locales.ts). Arabic is reviewed; the others are β.
  const LOCALES = [
    ['ar', 'العربية', 'arabic'], ['en', 'English', 'latin'], ['fr', 'Français', 'latin'], ['es', 'Español', 'latin'],
    ['de', 'Deutsch', 'latin'], ['pt', 'Português', 'latin'], ['it', 'Italiano', 'latin'], ['nl', 'Nederlands', 'latin'],
    ['ru', 'Русский', 'latin'], ['tr', 'Türkçe', 'latin'], ['az', 'Azərbaycanca', 'latin'], ['uz', 'Oʻzbekcha', 'latin'],
    ['bs', 'Bosanski', 'latin'], ['sq', 'Shqip', 'latin'], ['fa', 'فارسی', 'persian'], ['ur', 'اردو', 'persian'],
    ['id', 'Bahasa Indonesia', 'latin'], ['ms', 'Bahasa Melayu', 'latin'], ['bn', 'বাংলা', 'latin'], ['hi', 'हिन्दी', 'latin'],
    ['zh', '中文', 'latin'], ['ja', '日本語', 'latin'], ['ko', '한국어', 'latin'], ['sw', 'Kiswahili', 'latin'],
  ];

  /* Medals: 8 geometric motifs on the landing rosette's geometry. 0 is the first letter of your name. */
  const pt = (r, a) => { a = (a * Math.PI) / 180; return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`; };
  const poly = (r, angles) => 'M' + angles.map((a) => pt(r, a)).join('L') + 'Z';
  const sq = (r, t) => poly(r, [0, 90, 180, 270].map((a) => a + t));
  const star = (count, step, r, t = -90) => poly(r, Array.from({ length: count }, (_, i) => t + ((i * step) % count) * (360 / count)));
  const rays = (k, r1, r2, t = 0) => Array.from({ length: k }, (_, i) => `M${pt(r1, t + i * (360 / k))}L${pt(r2, t + i * (360 / k))}`).join('');
  const circ = (r) => `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0`;
  const MEDALS = [
    { name: 'حرف من اسمك', draw: (L) => `<path d="${circ(23)}"/><path d="${circ(19.5)}" stroke-opacity=".45"/><text y="8.5" text-anchor="middle" font-family="Amiri" font-size="24" fill="var(--gold-text)" stroke="none">${esc(L)}</text>` },
    { name: 'علامة بصائر', draw: () => `<path d="${sq(19, 45)}"/><path d="${sq(19, 0)}"/><path d="${circ(13)}"/><text y="7" text-anchor="middle" font-family="Amiri" font-size="20" fill="var(--gold-text)" stroke="none">ب</text>` },
    { name: 'وردة ثمانية', draw: () => `<path d="${sq(22, 0)}"/><path d="${sq(22, 45)}"/><path d="${circ(17)}"/><path d="${sq(10, 22.5)}"/><path d="${sq(10, 67.5)}"/>${`<path d="${rays(8, 10, 17, 22.5)}" stroke-opacity=".6"/>`}` },
    { name: 'نجمة ستّ عشرة', draw: () => `<path d="${sq(23, 0)}"/><path d="${sq(23, 22.5)}"/><path d="${sq(23, 45)}"/><path d="${sq(23, 67.5)}"/><path d="${circ(8)}"/>` },
    { name: 'خاتم', draw: () => `<path d="${star(8, 3, 24, -90)}"/><path d="${circ(9.5)}"/><path d="${star(8, 3, 9.5, -90)}" stroke-opacity=".6"/>` },
    { name: 'سداسية', draw: () => `<path d="${poly(24, [-90, 30, 150])}"/><path d="${poly(24, [90, 210, 330])}"/><path d="${poly(12, [0, 60, 120, 180, 240, 300])}"/><path d="${circ(4)}"/>` },
    { name: 'زهرة', draw: () => Array.from({ length: 8 }, (_, i) => { const [x, y] = pt(11, i * 45).split(' '); return `<circle cx="${x}" cy="${y}" r="10" stroke-opacity=".75"/>`; }).join('') + `<path d="${circ(24)}"/>` },
    { name: 'حلقات', draw: () => `<path d="${circ(24)}"/><path d="${circ(16)}"/><path d="${circ(6)}"/><path d="${rays(16, 16, 24)}" stroke-opacity=".55"/><path d="${rays(8, 6, 16, 22.5)}"/>` },
  ];
  const letterOf = (u) => (u && u.name ? u.name.trim()[0] : 'ب');
  // QB.medal(index, size, letter): the medallion drawn for a user. Other screens may reuse it.
  QB.medal = (i = 0, size = 36, L) => {
    const m = MEDALS[i] || MEDALS[0];
    return `<span class="set-medal" style="--ms:${size}px" aria-hidden="true"><svg width="${size}" height="${size}" viewBox="-30 -30 60 60"><g fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round">${m.draw(L || letterOf(QB.state.user))}</g></svg></span>`;
  };
  QB.medals = MEDALS.map((m) => m.name);
  const medalGrid = (picked, L, idp) => `<div class="set-medals" role="radiogroup" aria-label="المداليات" id="${idp}-grid">${MEDALS.map((m, i) => `
      <button type="button" class="set-medal-opt" role="radio" aria-checked="${i === picked}" data-act="medal" data-i="${i}" data-fk="medal-${i}" tabindex="${i === picked ? 0 : -1}">
        ${QB.medal(i, 52, L)}<span>${m.name}</span></button>`).join('')}</div>`;
  // Arrow keys move inside a radiogroup (medals, reciters).
  const radioKeys = (e) => {
    const g = e.target.closest('[role=radiogroup]');
    if (!g || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const opts = [...g.querySelectorAll('[role=radio]')];
    const i = opts.indexOf(e.target.closest('[role=radio]'));
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : -1;
    const next = opts[(i + step + opts.length) % opts.length];
    next.focus(); next.click();
  };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================================
     Settings
     ===================================================================== */
  const SECTIONS = [
    ['display', 'العرض'], ['home', 'الرئيسية'], ['reading', 'القراءة والمصحف'],
    ['translations', 'ترجمة المعاني'], ['account', 'الحساب'], ['devices', 'الأجهزة النشطة'],
  ];
  const HOME = [
    ['greeting', 'التحية', 'سلامٌ بحسب الوقت، والتاريخ الهجري.'],
    ['verse', 'الآية المتجدّدة', 'آية تتبدّل في رأس الرئيسية، مع جذورها.'],
    ['resume', 'متابعة القراءة', 'حيث توقفت، وشريط ما قرأته.'],
    ['index', 'الفهرس', 'كل السور والأجزاء.'],
    ['saved', 'المحفوظة', 'آخر الصفحات التي حفظتها.'],
    ['study', 'الدراسة', 'آخر جلساتك ومواضيعك.'],
    ['community', 'المجتمع', 'ما يشاركه الباحثون.'],
    ['search', 'البحث', 'ابحث بكلمة أو جذر، أو اطرح سؤالاً.'],
  ];
  // Translation catalogue. 'english' and 'french' are the keys the prototype has verse text for.
  const LOADED = { 'quranenc:english_saheeh': 'english', 'quranenc:french_montada': 'french' };
  const stateKey = (t) => LOADED[t.key] || t.key;
  const catalogue = () => QB.data.translations;
  const entryOf = (k) => catalogue().find((t) => stateKey(t) === k) || null;
  const hasText = (k) => k === 'english' || k === 'french';
  const source = (t) => (t.key.startsWith('tanzil') ? 'Tanzil' : 'QuranEnc');
  const split = (t) => { const p = t.name.split(' - '); return p.length > 1 ? { title: p[1], kind: p[0] } : { title: t.name, kind: '' }; };
  const langName = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ar'], { type: 'language' }); } catch (e) {} return (c) => { try { const v = dn && dn.of(c); return v && v !== c ? v : c; } catch (e) { return c; } }; })();

  // Seeded sessions connected to the account (in memory).
  let devices = [
    { id: 'dv0', kind: 'laptop', label: 'Chrome على Windows', current: true },
    { id: 'dv1', kind: 'phone', label: 'تطبيق بصائر على iPhone', at: '2026-10-21T13:05' },
    { id: 'dv2', kind: 'laptop', label: 'Safari على MacBook', at: '2026-10-18T20:10' },
    { id: 'dv3', kind: 'tablet', label: 'Chrome على iPad', at: '2026-10-09T08:00' },
    { id: 'dv4', kind: 'laptop', label: 'Firefox على Linux', at: '2026-09-14T11:00' },
  ];
  const ago = (iso) => {
    const h = Math.floor((QB.today - new Date(iso)) / 3600000);
    if (h < 1) return 'قبل دقائق';
    if (h === 1) return 'قبل ساعة';
    if (h === 2) return 'قبل ساعتين';
    if (h < 11) return `قبل ${n(h)} ساعات`;
    if (h < 24) return `قبل ${n(h)} ساعة`;
    return QB.age(iso);
  };

  const ui = { medalOpen: false, deleting: false, deleteBusy: false, transLang: 'en', devicesAll: false, busyDevice: null, sample: null };
  let root = null, spy = null, refocus = null, pinned = null;
  // A jump pins its section as current until the viewer scrolls by hand.
  const unpin = () => { pinned = null; };
  ['wheel', 'touchmove', 'keydown'].forEach((ev) => document.addEventListener(ev, unpin, { passive: true }));

  const row = (id, label, desc, control, extra = '') => `
    <div class="set-row ${extra}">
      <div class="set-lbl">${id ? `<label for="${id}">${label}</label>` : `<span class="set-lbl-t">${label}</span>`}${desc ? `<small>${desc}</small>` : ''}</div>
      <div class="set-ctl">${control}</div>
    </div>`;
  const groupRow = (gid, label, desc, control) => `
    <div class="set-row" role="group" aria-labelledby="${gid}">
      <div class="set-lbl"><span class="set-lbl-t" id="${gid}">${label}</span>${desc ? `<small>${desc}</small>` : ''}</div>
      <div class="set-ctl">${control}</div>
    </div>`;
  const head = (id, title, desc) => `<header class="set-sec-h"><h2 class="h2" id="set-${id}-t">${title}</h2><p>${desc}</p></header>`;

  /* ---- العرض ---- */
  function secDisplay() {
    const dark = QB.isDark();
    const lang = LOCALES.find((l) => l[0] === QB.state.uiLang) || LOCALES[0];
    const nums = [['arabic', 'هنديّة', '٠١٢'], ['latin', 'لاتينية', '012'], ['persian', 'فارسيّة', '۰۱۲']];
    return head('display', 'العرض', 'اللغة والسمة وطريقة عرض الأرقام في الواجهة.') + `<div class="set-rows">
      ${groupRow('set-theme-l', 'السمة', 'الداكنة للقراءة ليلاً، والفاتحة بلون الورق.',
        `<div class="seg-ctl set-seg">${[['dark', 'داكنة', 'moon'], ['light', 'فاتحة', 'sun']].map(([v, l, ic]) => `<button type="button" data-act="theme" data-v="${v}" data-fk="theme-${v}" aria-pressed="${(v === 'dark') === dark}">${QB.ico(ic, 'sm')}${l}</button>`).join('')}</div>`)}
      ${row('set-lang', 'لغة الواجهة · Language', 'العربية مراجَعة؛ غيرها مسودة أولى تنتظر مراجعة (β).',
        `<select class="select" id="set-lang" data-act="lang" data-fk="lang">${LOCALES.map(([c, nm]) => `<option value="${c}" ${c === lang[0] ? 'selected' : ''}>${nm}${c === 'ar' ? '' : ' · β'}</option>`).join('')}</select>
         ${lang[0] !== 'ar' ? `<p class="set-note" role="status">${QB.ico('info', 'sm')}<span>هذا النموذج مرسومٌ بالعربية وحدها. في التطبيق تظهر الواجهة بـ<bdi lang="${lang[0]}">${lang[1]}</bdi> من مسودة أولى، وتتبدّل الأرقام إلى ما تعتاده هذه اللغة.</span></p>` : ''}`)}
      ${groupRow('set-num-l', 'الأرقام', 'أرقام الصفحات والآيات والعدّ في كل الواجهة.',
        `<div class="seg-ctl set-seg">${nums.map(([v, l, s]) => `<button type="button" data-act="numerals" data-v="${v}" data-fk="num-${v}" aria-pressed="${QB.state.numerals === v}">${l} <span class="set-dig">${s}</span></button>`).join('')}</div>
         <p class="set-sample" aria-live="polite">${QB.ico('book', 'sm')}الجاثية ${n(45)}:${n(20)}، صفحة ${n(500)} من ${n(604)}</p>`)}
    </div>`;
  }

  /* ---- الرئيسية ---- */
  function secHome() {
    const hs = QB.state.homeSections || {};
    return head('home', 'الرئيسية', 'اختر ما تعرضه الشاشة الرئيسية.') + `<ul class="set-switches">${HOME.map(([k, l, d]) => `
      <li><span class="set-sw-t" id="set-hs-${k}">${l}<small>${d}</small></span>
        <button type="button" class="switch" role="switch" aria-checked="${hs[k] !== false}" aria-labelledby="set-hs-${k}" data-act="home" data-k="${k}" data-fk="hs-${k}"></button></li>`).join('')}</ul>
      <div class="set-foot"><button class="link" data-act="go-home">اعرض الرئيسية ${QB.ico('chevL', 'sm')}</button></div>`;
  }

  /* ---- القراءة والمصحف ---- */
  function secReading() {
    const size = QB.state.quranSize || 26;
    const sample = QB.ayah(1, 2);
    const others = QB.data.mushafs.filter((m) => m.riwayah !== 'hafs').map((m) => m.name);
    return head('reading', 'القراءة والمصحف', 'المصحف الذي تقرأ فيه، وطريقة عرضه، ومن يتلوه.') + `<div class="set-rows">
      ${groupRow('set-mushaf-l', 'المصحف', others.length ? `روايات ${others.slice(0, 3).join('، ')} وغيرها ليست على الويب بعد.` : '',
        `<div class="set-edition" aria-current="true"><span class="set-ed-mark">${QB.mark(34)}</span><span><b>مصحف المدينة النبوية</b><small>رواية حفص عن عاصم · صفحات مجمّع الملك فهد</small></span><span class="pill gold">${QB.ico('check', 'sm')}المعتمد</span></div>`)}
      ${groupRow('set-mode-l', 'طريقة القراءة', 'تتغيّر أيضاً من «العرض» في القارئ <kbd>Shift M</kbd>.',
        `<div class="set-modes">${[['page', 'صفحات', 'صفحة المصحف كما طُبعت'], ['ayahs', 'آية آية', 'كل آية في سطر، وتحتها الترجمة']].map(([v, l, d]) => `
          <button type="button" class="set-mode" data-act="mode" data-v="${v}" data-fk="mode-${v}" aria-pressed="${QB.state.readingMode === v}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>`)}
      ${row('set-size', 'حجم النص', `من ${n(18)} إلى ${n(48)}، الآن <output id="set-size-out" for="set-size">${n(size)}</output>.`,
        `<input type="range" class="range" id="set-size" min="18" max="48" step="1" value="${size}" data-act="size" data-fk="size" aria-valuetext="${n(size)}">
         ${sample ? `<p class="set-qsample q" lang="ar" style="font-size:${size}px">${sample.text}</p>` : ''}`)}
      ${row('', 'تظليل المواضيع', 'لوّن الآيات المحفوظة في المصحف بألوان مواضيعها.',
        `<button type="button" class="switch" role="switch" aria-checked="${QB.state.themeHighlight !== false}" aria-label="تظليل المواضيع" data-act="highlight" data-fk="hl"></button>`)}
      ${groupRow('set-rec-l', 'القارئ', 'يتلو في القارئ وشريط التلاوة.',
        `<div class="set-reciters" role="radiogroup" aria-labelledby="set-rec-l">${QB.data.reciters.map((r) => { const on = r.id === QB.state.reciter; return `
          <button type="button" class="set-rec" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-act="reciter" data-v="${r.id}" data-fk="rec-${r.id}">
            <span class="avatar">${r.name[0]}</span><span class="t">${r.name}<small><bdi dir="ltr" lang="en">${r.en}</bdi></small></span>${on ? QB.ico('check', 'sm') : ''}</button>`; }).join('')}</div>
         <button class="quiet set-listen" data-act="sample" data-fk="sample">${QB.ico(ui.sample ? 'pause' : 'headphones', 'sm')}${ui.sample ? 'أوقف العيّنة' : 'استمع لعيّنة من الفاتحة'}</button>`)}
    </div>`;
  }

  /* ---- ترجمة المعاني ---- */
  function secTranslations() {
    const chosen = QB.state.translations || [];
    const full = chosen.length >= 3;
    const langs = [...new Set(catalogue().map((t) => t.lang))].sort((a, b) => langName(a).localeCompare(langName(b), 'ar'));
    const list = catalogue().filter((t) => t.lang === ui.transLang);
    return head('translations', 'ترجمة المعاني', 'تظهر تحت كل آية حين تقرأ «آية آية». الترجمة بيانٌ للمعنى، لا تقوم مقام النصّ.') + `
      <div class="set-chosen">
        <div class="set-chosen-h"><span class="set-lbl-t">المختارة</span><span class="label" aria-live="polite">${n(chosen.length)} من ${n(3)}، ثلاث ترجمات على الأكثر</span></div>
        ${chosen.length ? `<ul class="set-pills">${chosen.map((k) => { const t = entryOf(k); const s = t ? split(t) : { title: k }; return `
          <li class="set-pill"><span><bdi dir="auto">${esc(s.title)}</bdi>${t ? `<small>${langName(t.lang)}</small>` : ''}</span>
            <button type="button" data-act="tr-remove" data-k="${esc(k)}" data-fk="trx-${esc(k)}" aria-label="إزالة ${esc(s.title)}">${QB.ico('x', 'sm')}</button></li>`; }).join('')}</ul>`
          : '<p class="empty">لا ترجمة مختارة. أضِف واحدة من القائمة لتظهر تحت الآيات.</p>'}
      </div>
      <div class="set-rows">
        ${row('set-tr-lang', 'اللغة', `${n(catalogue().length)} ترجمة في ${n(langs.length)} لغة، من <bdi>QuranEnc</bdi> و<bdi>Tanzil</bdi>.`,
          `<select class="select" id="set-tr-lang" data-act="tr-lang" data-fk="trlang">${langs.map((c) => `<option value="${c}" ${c === ui.transLang ? 'selected' : ''}>${langName(c)}</option>`).join('')}</select>`)}
      </div>
      <ul class="list set-tr-list" aria-label="ترجمات ${langName(ui.transLang)}">${list.map((t) => { const k = stateKey(t); const on = chosen.includes(k); const s = split(t); return `
        <li><div class="row">
          <span class="t"><bdi dir="auto">${esc(s.title)}</bdi><small><bdi dir="ltr">${esc(s.kind || langName(t.lang))}</bdi>، المصدر <bdi>${source(t)}</bdi></small></span>
          ${hasText(k) ? '<span class="pill ok">النص محمّل</span>' : '<span class="pill mute">النص غير محمّل في النموذج</span>'}
          ${on ? `<button class="quiet danger" data-act="tr-remove" data-k="${esc(k)}" data-fk="tr-${esc(k)}">إزالة</button>`
            : `<button class="ghost sm" data-act="tr-add" data-k="${esc(k)}" data-fk="tr-${esc(k)}" ${full ? 'disabled title="ثلاث ترجمات على الأكثر"' : ''}>${QB.ico('plus', 'sm')}أضِف</button>`}
        </div></li>`; }).join('')}</ul>
      ${full ? '<p class="set-note">' + QB.ico('info', 'sm') + '<span>ثلاث ترجمات على الأكثر. أزِل واحدة لتضيف أخرى.</span></p>' : ''}
      <div class="set-foot"><button class="link" data-act="read-ayahs">اقرأ «آية آية» لترى الترجمة ${QB.ico('chevL', 'sm')}</button></div>`;
  }

  /* ---- الحساب ---- */
  function secAccount() {
    const u = QB.state.user;
    if (!QB.signedIn()) {
      return head('account', 'الحساب', u && u.guest ? 'أنت ضيف على هذا الجهاز.' : 'لم تدخل إلى حساب.') + `
        <div class="set-guest">
          <p class="lede">أنت الآن في وضع الضيف. سجّل الدخول لحفظ محفوظاتك ومزامنتها عبر أجهزتك.</p>
          <div class="set-acts"><button class="cta" data-act="to-account" data-tab="login">تسجيل الدخول</button><button class="ghost" data-act="to-account" data-tab="signup">أنشئ حساباً</button></div>
          <p class="label">محفوظات الضيف (المثبَّتات والجلسات وموضع القراءة) تُدمَج في حسابك تلقائياً عند التسجيل.</p>
        </div>`;
    }
    const L = letterOf(u);
    return head('account', 'الحساب', 'مداليتك واسمك المعروض.') + `
      <div class="set-me">
        ${QB.medal(u.medal || 0, 72, L)}
        <div class="set-me-t"><b>${esc(u.name)}</b><span dir="ltr">${esc(u.email || '')}</span><span class="sync">محفوظاتك تُزامَن تلقائياً</span></div>
        <button class="ghost sm" data-act="medal-toggle" data-fk="medal-toggle" aria-expanded="${ui.medalOpen}" aria-controls="set-medal-grid">${ui.medalOpen ? 'تمّ' : 'غيّر المدالية'}</button>
      </div>
      ${ui.medalOpen ? `<div class="set-medal-pick"><p class="label">مداليتك في الشريط والقوائم وبطاقات الجلسات — حرفٌ من اسمك أو زخرفة.</p>${medalGrid(u.medal || 0, L, 'set-medal')}</div>` : ''}
      <div class="set-rows">
        ${row('set-name', 'الاسم المعروض', 'يظهر في التحية وفي منشوراتك.',
          `<form class="set-inline" data-form="name"><input class="input" id="set-name" name="name" value="${esc(u.name)}" maxlength="40" autocomplete="nickname" aria-label="اسمك المعروض" data-fk="name-in"><button class="ghost sm" type="submit" data-fk="name-save">حفظ</button></form>
           <p class="set-err" id="set-name-err" role="alert"></p>`)}
      </div>
      <div class="set-acts set-acts-sep">
        <button class="quiet" data-act="logout" data-fk="logout">${QB.ico('logout', 'sm')}تسجيل الخروج</button>
        <button class="quiet danger" data-act="delete" data-fk="delete" aria-expanded="${ui.deleting}" aria-controls="set-del">${QB.ico('trash', 'sm')}حذف الحساب نهائياً</button>
      </div>
      ${ui.deleting ? `<div class="set-danger" id="set-del" role="alert" aria-labelledby="set-del-t">
        <b id="set-del-t">تأكيد حذف الحساب</b>
        <p>سيُحذف حسابك وكل محفوظاتك (المثبَّتات والجلسات والجذور والإعدادات) نهائياً على كل الأجهزة. لا يمكن التراجع.</p>
        <div class="set-acts"><button class="set-btn-danger" data-act="delete-yes" data-fk="delete-yes" ${ui.deleteBusy ? 'disabled aria-busy="true"' : ''}>${ui.deleteBusy ? 'جارٍ الحذف…' : 'احذف نهائياً'}</button><button class="ghost sm" data-act="delete-no" data-fk="delete-no">إلغاء</button></div>
      </div>` : ''}`;
  }

  /* ---- الأجهزة النشطة ---- */
  function secDevices() {
    if (!QB.signedIn()) return head('devices', 'الأجهزة النشطة', 'الجلسات المتصلة بحسابك — يمكنك إخراج أيّ جهاز.') + '<p class="empty">تظهر هنا الأجهزة المتصلة بحسابك بعد تسجيل الدخول.</p>';
    const others = devices.filter((d) => !d.current);
    const shown = ui.devicesAll ? devices : devices.slice(0, 3);
    const hidden = devices.length - shown.length;
    return head('devices', `الأجهزة النشطة <span class="set-count">(${n(devices.length)})</span>`, 'الجلسات المتصلة بحسابك — يمكنك إخراج أيّ جهاز.') + `
      <ul class="list set-devices">${shown.map((d) => `
        <li><div class="row">
          <span class="glyph">${QB.ico('device-' + d.kind)}</span>
          <span class="t"><bdi>${esc(d.label)}</bdi><small>${d.current ? 'هذا الجهاز، نشط الآن' : ago(d.at)}</small></span>
          ${d.current ? '<span class="pill ok">هذا الجهاز</span>' : `<button class="quiet" data-act="dev-out" data-id="${d.id}" data-fk="dev-${d.id}" ${ui.busyDevice === d.id ? 'disabled aria-busy="true"' : ''}>${ui.busyDevice === d.id ? 'جارٍ الإخراج…' : 'أخرِج'}</button>`}
        </div></li>`).join('')}</ul>
      ${!others.length ? '<p class="empty">لا أجهزة أخرى.</p>' : ''}
      <div class="set-acts">
        ${hidden > 0 ? `<button class="quiet" data-act="dev-all" data-fk="dev-all">عرض الكل (${n(hidden)} أخرى)</button>` : ''}
        ${others.length ? `<button class="quiet danger" data-act="dev-out-all" data-fk="dev-out-all">${QB.ico('logout', 'sm')}أخرِج كل الأجهزة الأخرى</button>` : ''}
      </div>`;
  }

  const RENDER = { display: secDisplay, home: secHome, reading: secReading, translations: secTranslations, account: secAccount, devices: secDevices };
  const fkOf = (a) => (a && a.dataset && a.dataset.fk) || null;
  function paint(...names) {
    if (!root) return;
    const fk = fkOf(document.activeElement);
    names.forEach((nm) => { const s = root.querySelector(`#set-${nm}`); if (s) s.innerHTML = RENDER[nm](); });
    if (names.includes('devices')) { const lbl = root.querySelector('[data-to="devices"] span'); if (lbl) lbl.textContent = QB.signedIn() ? `الأجهزة النشطة (${n(devices.length)})` : 'الأجهزة النشطة'; }
    if (fk) { const t = root.querySelector(`[data-fk="${fk}"]`); if (t && !t.disabled) t.focus({ preventScroll: true }); }
  }

  function scrollToSection(id, smooth) {
    const main = QB.$('#main'), s = root && root.querySelector(`#set-${id}`);
    if (!s) return;
    const top = s.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - ((QB.$('.topbar')?.offsetHeight || 64) + 12);
    main.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  }
  function setActive(id, pin) {
    if (pin) pinned = id;
    root && root.querySelectorAll('.set-index [data-to]').forEach((b) => { const on = b.dataset.to === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  function wireSpy() {
    if (spy) spy.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const visible = new Map();
    spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.id.slice(4), e.isIntersecting));
      if (pinned) return;
      const main = QB.$('#main');
      const atEnd = main.scrollTop + main.clientHeight >= main.scrollHeight - 4;
      const first = atEnd ? SECTIONS[SECTIONS.length - 1][0] : SECTIONS.map((s) => s[0]).find((id) => visible.get(id));
      if (first) setActive(first);
    }, { root: QB.$('#main'), rootMargin: `-${(QB.$('.topbar')?.offsetHeight || 64) + 20}px 0px -55% 0px`, threshold: 0 });
    root.querySelectorAll('.set-sec').forEach((s) => spy.observe(s));
    QB.$('#main').addEventListener('scroll', onEndScroll, { passive: true });
  }
  function onEndScroll() {
    if (QB.current() !== 'settings' || pinned) return;
    const main = QB.$('#main');
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) setActive(SECTIONS[SECTIONS.length - 1][0]);
  }

  let sampleAudio = null;
  function toggleSample() {
    if (sampleAudio) { sampleAudio.pause(); sampleAudio = null; ui.sample = null; paint('reading'); return; }
    const r = QB.data.reciters.find((x) => x.id === QB.state.reciter) || QB.data.reciters[0];
    if (!r) return;
    const a = new Audio(`${r.audio}/001001.mp3`);
    sampleAudio = a; ui.sample = r.id;
    const end = () => { if (sampleAudio === a) { sampleAudio = null; ui.sample = null; if (QB.current() === 'settings') paint('reading'); } };
    a.addEventListener('ended', end);
    a.addEventListener('error', () => { end(); QB.toast('تعذّر تشغيل العيّنة في هذه المعاينة.'); });
    const p = a.play(); if (p && p.catch) p.catch(() => { end(); QB.toast('تعذّر تشغيل العيّنة في هذه المعاينة.'); });
    paint('reading');
  }

  function onSettingsClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.tagName === 'SELECT' || t.type === 'range') return;
    const act = t.dataset.act, s = QB.state;
    if (act === 'jump') { setActive(t.dataset.to, true); scrollToSection(t.dataset.to, true); const h = root.querySelector(`#set-${t.dataset.to}-t`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } return; }
    if (act === 'theme') {
      QB.set('theme', t.dataset.v);
      QB.set('user', QB.state.user); // re-draws the rail so its theme button follows (see report)
      paint('display');
    }
    if (act === 'numerals') { refocus = `num-${t.dataset.v}`; QB.set('numerals', t.dataset.v); return; } // core re-shows the screen
    if (act === 'home') {
      const hs = Object.assign({}, s.homeSections); hs[t.dataset.k] = hs[t.dataset.k] === false;
      QB.set('homeSections', hs);
      t.setAttribute('aria-checked', String(hs[t.dataset.k] !== false));
    }
    if (act === 'go-home') QB.go('home');
    if (act === 'mode') { QB.set('readingMode', t.dataset.v); paint('reading'); }
    if (act === 'highlight') { QB.set('themeHighlight', s.themeHighlight === false); t.setAttribute('aria-checked', String(s.themeHighlight !== false)); }
    if (act === 'reciter') { if (sampleAudio) { sampleAudio.pause(); sampleAudio = null; ui.sample = null; } QB.set('reciter', t.dataset.v); paint('reading'); }
    if (act === 'sample') toggleSample();
    if (act === 'tr-add') {
      const k = t.dataset.k; if ((s.translations || []).length >= 3 || s.translations.includes(k)) return;
      QB.set('translations', [...s.translations, k]); paint('translations');
      const e2 = entryOf(k); QB.toast(hasText(k) ? 'أُضيفت الترجمة. تظهر تحت الآيات في «آية آية».' : `أُضيفت «${e2 ? split(e2).title : k}». نصّها غير محمّل في هذا النموذج.`);
    }
    if (act === 'tr-remove') {
      const k = t.dataset.k; QB.set('translations', s.translations.filter((x) => x !== k));
      const fk = t.dataset.fk; paint('translations');
      if (fk && fk.startsWith('trx-')) root.querySelector('.set-pill button, #set-tr-lang')?.focus({ preventScroll: true });
    }
    if (act === 'read-ayahs') { QB.set('readingMode', 'ayahs'); QB.go('reader'); }
    if (act === 'to-account') QB.go('account', { tab: t.dataset.tab });
    if (act === 'medal-toggle') { ui.medalOpen = !ui.medalOpen; paint('account'); if (ui.medalOpen) root.querySelector('.set-medal-opt[aria-checked="true"]')?.focus({ preventScroll: true }); }
    if (act === 'medal') { QB.set('user', Object.assign({}, s.user, { medal: +t.dataset.i })); paint('account'); }
    if (act === 'logout') { QB.set('user', null); ui.deleting = false; ui.medalOpen = false; QB.toast('خرجت من حسابك. محفوظات هذا الجهاز باقية.'); paint('account', 'devices'); root.querySelector('#set-account [data-act="to-account"]')?.focus({ preventScroll: true }); }
    if (act === 'delete') { ui.deleting = !ui.deleting; paint('account'); if (ui.deleting) root.querySelector('[data-act="delete-no"]')?.focus({ preventScroll: true }); }
    if (act === 'delete-no') { ui.deleting = false; paint('account'); root.querySelector('[data-act="delete"]')?.focus({ preventScroll: true }); }
    if (act === 'delete-yes') {
      ui.deleteBusy = true; paint('account');
      setTimeout(() => { ui.deleteBusy = false; ui.deleting = false; ui.medalOpen = false; QB.set('user', null); QB.toast('حُذف حسابك وكل محفوظاته. يمكنك المتابعة ضيفاً.'); if (QB.current() === 'settings') paint('account', 'devices'); }, 700);
    }
    if (act === 'dev-all') { ui.devicesAll = true; paint('devices'); root.querySelector('.set-devices li:nth-child(4) button, .set-devices li:nth-child(4) .row')?.focus?.({ preventScroll: true }); }
    if (act === 'dev-out') {
      const id = t.dataset.id; ui.busyDevice = id; paint('devices');
      setTimeout(() => { devices = devices.filter((d) => d.id !== id); ui.busyDevice = null; if (QB.current() === 'settings') { paint('devices'); root.querySelector('#set-devices [data-act^="dev-"]')?.focus({ preventScroll: true }); } QB.toast('أُخرج الجهاز. سيُطلب منه تسجيل الدخول من جديد.'); }, 600);
    }
    if (act === 'dev-out-all') {
      const k = devices.filter((d) => !d.current).length;
      QB.confirm({ title: 'أخرِج كل الأجهزة الأخرى؟', body: `سيُطلب تسجيل الدخول من جديد على ${n(k)} ${k > 2 && k < 11 ? 'أجهزة' : 'جهاز'}. يبقى هذا الجهاز متصلاً.`, confirm: 'أخرِج كل الأجهزة الأخرى', danger: true,
        onConfirm: () => { devices = devices.filter((d) => d.current); ui.devicesAll = false; paint('devices'); QB.toast('أُخرجت كل الأجهزة الأخرى.'); } });
    }
  }
  function onSettingsChange(e) {
    const t = e.target;
    if (t.dataset.act === 'lang') {
      const loc = LOCALES.find((l) => l[0] === t.value) || LOCALES[0];
      QB.set('uiLang', loc[0]);
      if (QB.state.numerals !== loc[2]) { refocus = 'lang'; QB.set('numerals', loc[2]); return; }
      paint('display');
    }
    if (t.dataset.act === 'tr-lang') { ui.transLang = t.value; paint('translations'); }
  }
  function onSettingsInput(e) {
    const t = e.target;
    if (t.dataset.act !== 'size') return;
    const v = +t.value;
    QB.set('quranSize', v);
    t.setAttribute('aria-valuetext', n(v));
    const out = root.querySelector('#set-size-out'); if (out) out.textContent = n(v);
    const q = root.querySelector('.set-qsample'); if (q) q.style.fontSize = v + 'px';
  }
  function onSettingsSubmit(e) {
    const f = e.target.closest('[data-form="name"]');
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector('#set-name'), err = root.querySelector('#set-name-err');
    const v = inp.value.trim();
    if (!v) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', 'set-name-err'); err.textContent = 'اكتب اسماً يظهر للآخرين، حرفاً واحداً على الأقل.'; inp.focus(); return; }
    QB.set('user', Object.assign({}, QB.state.user, { name: v }));
    paint('account');
    root.querySelector('#set-name')?.focus({ preventScroll: true });
    QB.toast('حُفظ اسمك المعروض.');
  }

  QB.screen('settings', {
    title: () => ['الإعدادات', 'التفضيلات'],
    world: 'reading',
    mount(el) {
      el.addEventListener('click', onSettingsClick);
      el.addEventListener('change', onSettingsChange);
      el.addEventListener('input', onSettingsInput);
      el.addEventListener('submit', onSettingsSubmit);
      el.addEventListener('keydown', radioKeys);
    },
    show(el, params = {}) {
      root = el;
      el.innerHTML = `<div class="wrap set-wrap"><div class="set-layout">
        <nav class="set-index" aria-label="أقسام الإعدادات"><ul>${SECTIONS.map(([id, l]) => `<li><button type="button" data-act="jump" data-to="${id}"><span>${id === 'devices' && QB.signedIn() ? `الأجهزة النشطة (${n(devices.length)})` : l}</span></button></li>`).join('')}</ul>
          <p class="label set-index-note">تُحفظ التفضيلات فور تغييرها.</p></nav>
        <div class="set-body">${SECTIONS.map(([id]) => `<section class="set-sec" id="set-${id}" aria-labelledby="set-${id}-t">${RENDER[id]()}</section>`).join('')}</div>
      </div></div>`;
      wireSpy();
      setActive(SECTIONS[0][0]);
      if (refocus) { const fk = refocus; refocus = null; setTimeout(() => el.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true }), 0); }
      else if (params.section && !params.keepScroll) setTimeout(() => { setActive(params.section, true); scrollToSection(params.section, false); }, 0);
    },
    hide() { if (spy) { spy.disconnect(); spy = null; } if (sampleAudio) { sampleAudio.pause(); sampleAudio = null; ui.sample = null; } ui.deleting = false; },
  });

  /* =====================================================================
     Account: login / signup / forgot / reset / welcome
     ===================================================================== */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const A = { tab: 'login', vals: {}, step: 2, medal: 0, busy: false, showPw: false };
  let aroot = null;

  const field = (id, label, input, extra = '') => `<div class="set-field">${extra ? `<div class="set-field-h"><label for="${id}">${label}</label>${extra}</div>` : `<label for="${id}">${label}</label>`}${input}</div>`;
  const pw = (id, label, extra, auto) => field(id, label, `<div class="set-pw"><input class="input" id="${id}" name="${id}" type="${A.showPw ? 'text' : 'password'}" dir="ltr" autocomplete="${auto}" aria-describedby="${id}-hint" minlength="${auto === 'new-password' ? 8 : 1}" value="${esc(A.vals[id] || '')}"><button type="button" class="set-eye" data-act="pw-eye" aria-label="${A.showPw ? 'أخفِ كلمة المرور' : 'أظهر كلمة المرور'}" aria-pressed="${A.showPw}">${QB.ico(A.showPw ? 'eye-off' : 'eye', 'sm')}</button></div><small class="set-hint" id="${id}-hint">ثمانية أحرف فأكثر</small>`, extra);
  const email = (id = 'set-a-email') => field(id, 'البريد الإلكتروني', `<input class="input" id="${id}" name="email" type="email" dir="ltr" inputmode="email" autocomplete="email" placeholder="name@example.com" value="${esc(A.vals[id] || '')}">`);
  const submit = (label) => `<button class="cta set-submit" type="submit" data-label="${label}">${label}</button>`;
  const alertBox = `<p class="set-a-err" id="set-a-err" role="alert"></p>`;
  const honest = '<p class="set-a-honest">نموذج تجريبي: لا تُرسل أي بيانات.</p>';

  function authForm() {
    const t = A.tab;
    if (t === 'forgot') return `
      <h2 class="h2">إعادة تعيين كلمة المرور</h2>
      <p class="lede">اكتب بريد حسابك، نرسل إليه رمزاً لإعادة التعيين.</p>
      <form class="set-form" data-form="forgot" novalidate>${email()}${alertBox}<div id="set-a-notice"></div>${submit('أرسِل رمز إعادة التعيين')}</form>
      <button class="link set-back" data-act="tab" data-tab="login">← العودة لتسجيل الدخول</button>${honest}`;
    if (t === 'reset') return `
      <h2 class="h2">أدخِل الرمز وكلمة المرور الجديدة</h2>
      <p class="lede">الرمز في الرسالة التي وصلتك، صالحٌ لساعة.</p>
      <form class="set-form" data-form="reset" novalidate>
        ${field('set-a-code', 'رمز إعادة التعيين', `<input class="input set-code" id="set-a-code" name="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" value="${esc(A.vals['set-a-code'] || '')}">`)}
        ${pw('set-a-newpass', 'كلمة المرور الجديدة', '', 'new-password')}
        ${alertBox}${submit('غيّر كلمة المرور')}
      </form>
      <p class="label">في هذا النموذج يعمل أي رمز من ستة أرقام، إلا ٠٠٠٠٠٠.</p>
      <button class="link set-back" data-act="tab" data-tab="login">← العودة لتسجيل الدخول</button>${honest}`;
    const up = t === 'signup';
    return `
      <div class="tabs set-a-tabs" role="tablist" aria-label="الدخول أو إنشاء حساب">
        <button type="button" role="tab" id="set-tab-login" aria-selected="${!up}" aria-controls="set-a-panel" tabindex="${up ? -1 : 0}" data-act="tab" data-tab="login">دخول</button>
        <button type="button" role="tab" id="set-tab-signup" aria-selected="${up}" aria-controls="set-a-panel" tabindex="${up ? 0 : -1}" data-act="tab" data-tab="signup">حساب جديد</button>
      </div>
      <div id="set-a-panel" role="tabpanel" aria-labelledby="set-tab-${t}">
        ${QB.signedIn() ? `<p class="set-note">${QB.ico('info', 'sm')}<span>أنت داخلٌ باسم «${esc(QB.state.user.name)}». الدخول بحساب آخر يُخرجك منه.</span></p>` : ''}
        <form class="set-form" data-form="${t}" novalidate>
          ${up ? field('set-a-name', 'اسمك — كما تحبّ أن تُنادى', `<input class="input" id="set-a-name" name="name" autocomplete="nickname" placeholder="أبو محمد" maxlength="40" value="${esc(A.vals['set-a-name'] || '')}">`) : ''}
          ${email()}
          ${pw('set-a-pass', 'كلمة المرور', up ? '' : '<button type="button" class="link" data-act="tab" data-tab="forgot">نسيتها؟</button>', up ? 'new-password' : 'current-password')}
          ${up ? field('set-a-invite', 'رمز دعوة؟ <span class="label">اختياري</span>', `<input class="input" id="set-a-invite" name="invite" dir="ltr" autocomplete="off" aria-label="رمز دعوة اختياري" value="${esc(A.vals['set-a-invite'] || '')}">`) : ''}
          ${alertBox}
          ${submit(up ? 'أنشئ حسابك' : 'دخول')}
        </form>
        <div class="set-a-guest"><button class="link" data-act="guest">تصفّح كضيف ←</button><span class="label">عند إنشاء الحساب نضمّ محفوظاتك تلقائياً</span></div>
        ${honest}
        <p class="set-a-try">${up ? 'جرّب <bdi dir="ltr">taken@example.com</bdi> لترى خطأ البريد المسجَّل.' : 'جرّب كلمة المرور <bdi dir="ltr">x</bdi> لترى خطأ الدخول.'}</p>
      </div>`;
  }

  function welcome() {
    const u = QB.state.user || {};
    const L = letterOf(u);
    if (A.step === 2) return `
      <ol class="set-steps" aria-label="الخطوة ${n(2)} من ${n(3)}"><li class="done"><span class="sr">الحساب، تمّ</span></li><li class="on" aria-current="step"><span class="sr">المدالية</span></li><li><span class="sr">التعريف</span></li></ol>
      <p class="kicker">الخطوة ${n(2)} من ${n(3)} — اختر مداليتك</p>
      <h2 class="h2">أهلاً${u.name ? `، ${esc(u.name)}` : ''}</h2>
      <p class="lede">مداليتك في الشريط والقوائم وبطاقات الجلسات — حرفٌ من اسمك أو زخرفة.</p>
      <div class="set-w-preview">${QB.medal(A.medal, 88, L)}<span><b>${esc(MEDALS[A.medal].name)}</b><small>تغيّرها متى شئت من الإعدادات.</small></span></div>
      ${medalGrid(A.medal, L, 'set-w')}
      <div class="set-acts"><button class="cta" data-act="w-next">متابعة ←</button><button class="quiet" data-act="w-skip">تخطّي والبدء مباشرةً</button></div>`;
    const items = [
      ['search', 'شريطٌ واحد لكل شيء', 'جذرٌ أو كلمة، «الأنعام ١٠٤»، أو سؤال — الشريط يفهم قصدك ويعلنه بشارة.', ''],
      ['book', 'المصحف هو الغرفة', 'اللوحات تُستدعى جانباً ولا تغطّي النصّ أبداً؛ الصفحة تستقرّ للخلف وتبقى.', ''],
      ['', 'ذهبٌ ونحاس', 'الذهبي دليلٌ من القرآن وحده؛ النحاسي قراءةٌ تفسيرية تجريبية.', '<span class="pill tafsir">تنبيه — ليست حُجَّة شرعية</span>'],
    ];
    return `
      <ol class="set-steps" aria-label="الخطوة ${n(3)} من ${n(3)}"><li class="done"><span class="sr">الحساب، تمّ</span></li><li class="done"><span class="sr">المدالية، تمّ</span></li><li class="on" aria-current="step"><span class="sr">التعريف</span></li></ol>
      <p class="kicker">الخطوة ${n(3)} من ${n(3)}</p>
      <h2 class="h2">ثلاثةُ أشياء فقط، ثم الغرفة لك</h2>
      <ul class="set-three">${items.map(([ic, t, d, x]) => `<li><span class="set-three-g">${ic ? QB.ico(ic) : '<i class="set-gc"><b></b><b></b></i>'}</span><span><b>${t}</b><small>${d}</small>${x}</span></li>`).join('')}</ul>
      <div class="set-acts"><button class="cta" data-act="w-start">ابدأ القراءة ←</button></div>`;
  }

  function paintAuth(focusSel) {
    if (!aroot) return;
    const side = aroot.querySelector('.set-auth-form');
    side.innerHTML = `<div class="set-auth-inner">${A.tab === 'welcome' ? welcome() : authForm()}</div>`;
    QB.setTitle();
    const f = focusSel && side.querySelector(focusSel);
    if (f) f.focus({ preventScroll: true });
  }
  const keepVals = () => { aroot && aroot.querySelectorAll('.set-form input').forEach((i) => { A.vals[i.id] = i.value; }); };
  function setTab(tab, focusSel) { keepVals(); A.tab = tab; A.busy = false; if (tab === 'welcome') A.step = 2; paintAuth(focusSel || (tab === 'login' || tab === 'signup' ? `#set-tab-${tab}` : 'input')); }

  function fail(form, msg, fieldId) {
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    const box = form.querySelector('#set-a-err');
    box.innerHTML = msg;
    if (fieldId) { const f = form.querySelector('#' + fieldId); if (f) { f.setAttribute('aria-invalid', 'true'); f.setAttribute('aria-errormessage', 'set-a-err'); f.focus(); } }
  }
  function busy(form, on) {
    A.busy = on;
    const b = form.querySelector('.set-submit');
    b.disabled = on; b.setAttribute('aria-busy', String(on)); b.textContent = on ? 'لحظة…' : b.dataset.label;
  }

  function onAuthSubmit(e) {
    const form = e.target.closest('.set-form');
    if (!form) return;
    e.preventDefault();
    if (A.busy) return;
    const kind = form.dataset.form;
    const val = (id) => (form.querySelector('#' + id)?.value || '').trim();
    form.querySelector('#set-a-err').textContent = '';
    if (kind === 'login' || kind === 'signup') {
      const up = kind === 'signup';
      const name = up ? val('set-a-name') : '', em = val('set-a-email').toLowerCase(), p = form.querySelector('#set-a-pass').value;
      if ((up && !name) || !em || !p) return fail(form, up ? 'أكمِل الحقول — البريد وكلمة المرور مطلوبان، والاسم أيضاً.' : 'أكمِل الحقول — البريد وكلمة المرور مطلوبان.', up && !name ? 'set-a-name' : !em ? 'set-a-email' : 'set-a-pass');
      if (!EMAIL.test(em)) return fail(form, 'صيغة البريد غير صحيحة. اكتبه هكذا: name@example.com', 'set-a-email');
      if (up && p.length < 8) return fail(form, 'كلمة المرور قصيرة (ثمانية أحرف فأكثر).', 'set-a-pass');
      busy(form, true);
      setTimeout(() => {
        if (!aroot || !form.isConnected) return;
        busy(form, false);
        if (up && em === 'taken@example.com') return fail(form, 'هذا البريد مُسجَّل بالفعل — جرّب تسجيل الدخول. <button type="button" class="link" data-act="login-with">ادخل بهذا البريد</button>', 'set-a-email');
        if (!up && p === 'x') return fail(form, 'البريد أو كلمة المرور غير صحيحة.', 'set-a-pass');
        A.vals = {};
        if (up) {
          const wasGuest = !!(QB.state.user && QB.state.user.guest);
          QB.set('user', { name, email: em, role: 'admin', medal: 0 });
          A.medal = 0;
          QB.go('account', { tab: 'welcome' });
          if (wasGuest) mergeBanner();
        } else {
          const prev = QB.state.user && QB.state.user.email === em ? QB.state.user : null;
          const nm = prev ? prev.name : em === 'maintainer@example.com' ? 'المشرف' : em.split('@')[0];
          QB.set('user', { name: nm, email: em, role: 'admin', medal: prev ? prev.medal || 0 : 0 });
          QB.go('home');
          QB.toast(`مرحباً بعودتك، ${nm}.`);
        }
      }, 600);
    }
    if (kind === 'forgot') {
      const em = val('set-a-email').toLowerCase();
      if (!em) return fail(form, 'أدخل بريدك الإلكتروني أولاً.', 'set-a-email');
      if (!EMAIL.test(em)) return fail(form, 'صيغة البريد غير صحيحة. اكتبه هكذا: name@example.com', 'set-a-email');
      busy(form, true);
      setTimeout(() => {
        if (!form.isConnected) return;
        busy(form, false);
        A.vals['set-a-email'] = em;
        form.querySelector('#set-a-notice').innerHTML = `<div class="set-a-notice" role="status">${QB.ico('info', 'sm')}<span>إن كان البريد مُسجَّلاً، فقد أرسلنا إليه رابطاً ورمزاً لإعادة التعيين (صالحَين لساعة). افتح الرابط أو أدخِل الرمز هنا.<button type="button" class="link" data-act="tab" data-tab="reset">أدخِل الرمز ${QB.ico('chevL', 'sm')}</button></span></div>`;
      }, 600);
    }
    if (kind === 'reset') {
      const code = val('set-a-code').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), p = form.querySelector('#set-a-newpass').value;
      if (!code || !p) return fail(form, 'أدخل الرمز وكلمة المرور الجديدة (ثمانية أحرف فأكثر).', !code ? 'set-a-code' : 'set-a-newpass');
      if (p.length < 8) return fail(form, 'كلمة المرور قصيرة (ثمانية أحرف فأكثر).', 'set-a-newpass');
      busy(form, true);
      setTimeout(() => {
        if (!form.isConnected) return;
        busy(form, false);
        if (!/^\d{6}$/.test(code) || code === '000000') return fail(form, 'الرمز غير صالح أو منتهٍ.', 'set-a-code');
        A.vals = { 'set-a-email': A.vals['set-a-email'] || '' };
        setTab('login', '#set-a-pass');
        QB.toast('تم تغيير كلمة المرور. سجّل الدخول بها الآن.');
      }, 600);
    }
  }

  function onAuthClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'tab') setTab(t.dataset.tab);
    if (act === 'login-with') { keepVals(); delete A.vals['set-a-pass']; setTab('login', '#set-a-pass'); }
    if (act === 'pw-eye') { keepVals(); A.showPw = !A.showPw; const id = t.parentElement.querySelector('input').id; paintAuth(`#${id}`); }
    if (act === 'guest') { QB.set('user', { guest: true }); QB.go('home'); QB.toast('تتصفّح ضيفاً. محفوظاتك على هذا الجهاز.'); }
    if (act === 'medal') { A.medal = +t.dataset.i; if (QB.state.user && !QB.state.user.guest) QB.set('user', Object.assign({}, QB.state.user, { medal: A.medal })); paintAuth(`[data-fk="medal-${A.medal}"]`); }
    if (act === 'w-next') { A.step = 3; paintAuth('.set-auth-inner .h2'); QB.setTitle(); }
    if (act === 'w-skip') QB.go('home');
    if (act === 'w-start') QB.go('reader');
  }
  function onAuthKey(e) {
    radioKeys(e);
    const tl = e.target.closest('[role=tablist]');
    if (tl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTab(A.tab === 'login' ? 'signup' : 'login'); }
  }

  /* Guest-merge banner (bottom), with a 30-second undo ring. */
  function mergeBanner() {
    document.getElementById('set-merge')?.remove();
    const s = QB.state;
    const counts = [`${n(s.notebook.length)} آية مُثبَّتة`, `${n(s.sessions.length)} جلسة بحث`, `${n(s.followedRoots.length)} جذر مُتابَع`];
    const el = document.createElement('div');
    el.id = 'set-merge'; el.className = 'set-merge'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.dir = 'rtl'; el.lang = 'ar';
    el.innerHTML = `<span class="set-merge-dot" aria-hidden="true"></span>
      <div class="set-merge-t"><b>ضممنا محفوظاتِ الضيف إلى حسابك</b><span>${counts.join('، ')} — أصبحت تُزامَن</span></div>
      <button type="button" class="set-undo" data-m="undo"><svg class="set-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" pathLength="100"/><text x="18" y="22.5" text-anchor="middle"></text></svg><span>تراجَع</span><span class="sr">، متاح ثلاثين ثانية</span></button>
      <button type="button" class="icon-btn set-merge-x" data-m="close" aria-label="إغلاق">${QB.ico('x', 'sm')}</button>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('on'), 20);
    const total = 30000, t0 = performance.now();
    const fg = el.querySelector('.fg'), num = el.querySelector('text');
    let timer = null;
    const close = () => { clearInterval(timer); el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
    const tick = () => {
      const left = Math.max(0, total - (performance.now() - t0));
      fg.style.strokeDashoffset = String(100 - (left / total) * 100);
      num.textContent = n(Math.ceil(left / 1000));
      if (left <= 0) close();
    };
    tick(); timer = setInterval(tick, 250);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      if (b.dataset.m === 'close') return close();
      clearInterval(timer);
      el.classList.add('undone');
      el.innerHTML = `<span class="set-merge-dot off" aria-hidden="true"></span><div class="set-merge-t"><b>أُلغي الضمّ — بقيت محفوظات الضيف محليّةً على هذا الجهاز</b></div><button type="button" class="icon-btn set-merge-x" data-m="close" aria-label="إغلاق">${QB.ico('x', 'sm')}</button>`;
      el.querySelector('[data-m=close]').focus();
      setTimeout(close, 5000);
    });
  }
  QB.mergeBanner = mergeBanner;

  QB.screen('account', {
    title: () => {
      if (A.tab === 'welcome') return ['أهلاً بك في بصائر', `الخطوة ${n(A.step)} من ${n(3)}`];
      return ['الحساب', { login: 'دخول', signup: 'حساب جديد', forgot: 'إعادة تعيين كلمة المرور', reset: 'كلمة مرور جديدة' }[A.tab]];
    },
    mount(el) {
      el.addEventListener('submit', onAuthSubmit);
      el.addEventListener('click', onAuthClick);
      el.addEventListener('keydown', onAuthKey);
    },
    show(el, params = {}) {
      aroot = el;
      const tab = ['login', 'signup', 'forgot', 'reset', 'welcome'].includes(params.tab) ? params.tab : (params.keepScroll ? A.tab : 'login');
      if (!params.keepScroll) { A.busy = false; if (tab === 'welcome' && A.tab !== 'welcome') { A.step = 2; A.medal = (QB.state.user && QB.state.user.medal) || 0; } }
      A.tab = tab;
      // The brand side is drawn once (its verse reveal plays once); only the form side changes per tab.
      if (el.querySelector('.set-auth') && !params.keepScroll) { paintAuth(null); return; }
      const v = QB.ayah(45, 20);
      const words = v ? QB.words(v.text) : [];
      el.innerHTML = `<div class="set-auth">
        <aside class="set-auth-brand" aria-label="بصائر القرآن">
          ${QB.girih()}
          <div class="set-brand-in">
            <span class="set-brand-mark">${QB.mark(76)}</span>
            <p class="set-brand-name">بَصَائِر القُرآن</p>
            <p class="set-brand-sub">قراءةٌ وبحثٌ ودراسة، والمصحف في وسط الغرفة.</p>
            ${v ? `<blockquote class="set-brand-verse word-in" lang="ar">${words.map((w, i) => `<span style="--w:${i}">${w}${i < words.length - 1 ? ' ' : ''}</span>`).join('')}</blockquote><p class="set-brand-ref">الجاثية ${n(20)}</p>` : ''}
          </div>
        </aside>
        <div class="set-auth-form"></div>
      </div>`;
      paintAuth(null);
    },
  });
})();
