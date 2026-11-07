/* Home (الرئيسية): verse of the day, where you are, and the way back into your work.
   Reference screen: shows the conventions every screen file follows. */
(() => {
  const { n } = QB;
  const VERSE = { s: 45, a: 20 };

  QB.screen('home', {
    title: () => (QB.state.homeSections.greeting === false ? ['الرئيسية', ''] : [QB.signedIn() ? `مساء الخير، ${QB.state.user.name}` : 'مساء الخير', 'الأربعاء ٢٨ ربيع الآخر ١٤٤٨']),
    mount(el) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        const act = t.dataset.act;
        if (act === 'context') QB.go('reader', VERSE);
        if (act === 'listen') { const p = QB.page(500); QB.go('reader', VERSE); QB.player.start({ ayahs: p.ayahs, idx: p.ayahs.findIndex((x) => x.a === 20) }); }
        if (act === 'resume') QB.go('reader', { page: QB.state.lastRead.page });
        if (act === 'resume-listen') { const p = QB.page(QB.state.lastRead.page); QB.go('reader', { page: p.n }); QB.player.start({ ayahs: p.ayahs, idx: 0 }); }
        if (act === 'root') QB.go('search', { q: t.dataset.root, mode: 'root' });
        if (act === 'go') QB.go(t.dataset.to, t.dataset.s ? { s: +t.dataset.s, a: +t.dataset.a } : {});
        if (act === 'search') { const i = QB.$('#cmd-input'); i.focus(); i.select(); }
        if (act === 'page') QB.go('reader', { page: +t.dataset.page });
        if (act === 'session') QB.go('study', { session: t.dataset.id });
        if (act === 'new-session') QB.go('study', { new: true });
      });
    },
    show(el) {
      const verse = QB.ayah(VERSE.s, VERSE.a);
      const words = QB.words(verse.text);
      const tr = QB.trans(VERSE.s, VERSE.a) || {};
      const morph = QB.morph(VERSE.s, VERSE.a) || [];
      const last = QB.state.lastRead, here = last.s - 1;
      const sur = QB.surah(last.s);
      const bm = QB.state.savedPages.slice(0, 3);
      const tTheme = QB.state.themes[0];
      el.innerHTML = `
        <section class="hm-hero" data-sec="verse">
          ${QB.girih()}
          <div class="label">آية اليوم</div>
          <blockquote class="word-in" lang="ar">${words.map((w, i) => `<span style="--w:${i}">${w}${i < words.length - 1 ? ' ' : ''}</span>`).join('')}</blockquote>
          ${tr.english ? `<p class="hm-meaning" lang="en" dir="ltr">${tr.english}</p>` : ''}
          <div class="hm-acts">
            <button class="ghost" data-act="context">${QB.ico('book')}اقرأها في سياقها، الجاثية ${n(20)}</button>
            <button class="ghost" data-act="listen">${QB.ico('headphones')}استمع</button>
          </div>
        </section>
        <div class="wrap">
          <div class="hm-grid">
            <div>
              <section class="hm-resume" data-sec="resume" aria-labelledby="hm-resume-t">
                <div class="block-title"><h2 class="h2" id="hm-resume-t">تابع القراءة</h2><span class="label">توقفت قبل ١٣ دقيقة</span></div>
                <div class="hm-row">
                  <div class="hm-where"><strong>سورة ${sur.name}</strong><span>الجزء ${n(sur.juz)}، عند الآية ${n(last.a)}</span></div>
                  <div class="hm-pn gold-num">${n(last.page)}<small>من ${n(QB.data.stats.pages)}</small></div>
                </div>
                ${QB.ribbon(QB.data.names.map((_, i) => (i < here ? 1 : 0)), { here, flat: true, grow: true, id: 'hm-rib', label: 'ما قرأته من السور' })}
                <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="hm-read"></span><span>${QB.data.names[113]}</span></div>
                <div class="hm-acts start">
                  <button class="cta" data-act="resume">تابع من صفحة ${n(last.page)}</button>
                  <button class="ghost" data-act="resume-listen">${QB.ico('play', 'fill')}استمع من حيث توقفت</button>
                </div>
              </section>

              <button class="hm-search" data-sec="search" data-act="search">${QB.ico('search')}<span>ابحث بكلمة أو جذر، أو اطرح سؤالاً</span><kbd>/</kbd></button>
              <section class="hm-roots" data-sec="verse">
                <div class="block-title"><h2 class="h2">جذور آية اليوم</h2><span class="label">المس جذراً لترى مواضعه</span></div>
                <div class="hm-chips">${morph.filter((m) => m.root).map((m) => {
                  const sp = QB.spread(m.root);
                  return sp ? `<button class="hm-chip" data-act="root" data-root="${m.root}"><span><b class="letters">${QB.letters(sp.root)}</b><small>${n(sp.total)} موضعاً في ${n(sp.surahs)} سورة</small></span>${QB.miniRibbon(sp.counts)}</button>` : '';
                }).join('')}</div>
              </section>
            </div>

            <aside>
              <div data-sec="index"><ul class="list hm-index">
                <li><button class="row" data-act="go" data-to="index"><span class="glyph">${QB.ico('list')}</span><span class="t">الفهرس<small>كل السور، ${n(114)} سورة في ${n(30)} جزءاً</small></span><span class="chev">${QB.ico('chevL')}</span></button></li>
              </ul></div>
              <div data-sec="study"><div class="block-title hm-gap"><h2 class="h2">تابع دراستك</h2><button class="link" data-act="new-session">جلسة جديدة ${QB.ico('plus', 'sm')}</button></div>
              <ul class="list">${QB.state.sessions.slice(0, 2).map((s) => `<li><button class="row" data-act="session" data-id="${s.id}"><span class="glyph">${QB.ico('study')}</span><span class="t">${QB.esc(s.title)}<small>${s.mode === 'tafsir' ? 'قراءة تفسيرية' : 'القرآن وحدَه'}، ${QB.age(s.at)}</small></span><span class="chev">${QB.ico('chevL')}</span></button></li>`).join('')}
                ${tTheme ? `<li><button class="row" data-act="go" data-to="notebook"><span class="glyph" style="color:${QB.thColor(tTheme.color)}">${QB.ico('tag')}</span><span class="t">${QB.esc(tTheme.name)}<small>موضوع في الدفتر، ${n(QB.state.notebook.filter((x) => x.themes.includes(tTheme.id)).length)} آيات</small></span><span class="chev">${QB.ico('chevL')}</span></button></li>` : ''}
              </ul>
              </div>
              <div data-sec="saved"><div class="block-title hm-gap"><h2 class="h2">المحفوظة</h2><button class="link" data-act="go" data-to="saved">الصفحات المحفوظة ${QB.ico('chevL', 'sm')}</button></div>
              <ul class="list">${bm.map((b) => {
                const p = QB.page(b.page);
                const sur = p ? QB.surah(p.ayahs[0].s) : null;
                const first = p ? QB.words(p.ayahs[0].text).slice(0, 4).join(' ') : '';
                return `<li><button class="row" data-act="page" data-page="${b.page}"><span class="glyph">${QB.ico('bookmark')}</span><span class="t"><span class="hm-q q">${first}…</span><small>${sur ? sur.name : ''}، صفحة ${n(b.page)}، ${QB.age(b.at)}</small></span><span class="chev">${QB.ico('chevL')}</span></button></li>`;
              }).join('')}</ul>
              </div>
              <div data-sec="community"><div class="block-title hm-gap"><h2 class="h2">من المجتمع</h2><button class="link" data-act="go" data-to="community">المجتمع ${QB.ico('chevL', 'sm')}</button></div>
              <ul class="list">
                <li><button class="row" data-act="go" data-to="community"><span class="avatar">م</span><span class="t">«البصائر» بين الأنعام والجاثية<small>مريم، ٢٤ إعجاباً، ٧ تعليقات</small></span><span class="chev">${QB.ico('chevL')}</span></button></li>
              </ul></div>
            </aside>
          </div>
        </div>`;
      el.querySelectorAll('[data-sec]').forEach((x) => { x.hidden = QB.state.homeSections[x.dataset.sec] === false; });
      const read = () => `قرأت ${n(here)} سورة من ${n(114)}`;
      QB.wireRibbon(el.querySelector('#hm-rib'), el.querySelector('#hm-read'),
        (i) => (i < here ? `${QB.data.names[i]}: قرأتها` : i === here ? `${QB.data.names[i]}: أنت هنا` : QB.data.names[i]), null, read);
    },
  });
})();
