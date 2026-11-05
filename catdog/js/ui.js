/* ============================================================
   CAT & DOG — ajudantes de tela: escape, toast, modal (sheet), confirmação,
   ícones, moedas e efeitos
   ============================================================ */
window.UI = (function(){
  'use strict';

  const ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- toast ----------
  function toast(msg, kind){
    let host = document.getElementById('toasts');
    if(!host){
      host = document.createElement('div');
      host.id = 'toasts';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, kind === 'bad' ? 4200 : 2600);
  }

  // ---------- modal / bottom sheet ----------
  let openCount = 0;
  /** openModal({ title, html, onClose, locked }) → { el, body, close(result), closed } */
  function openModal(opts){
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.title || '')}">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-head">
          <h2>${esc(opts.title || '')}</h2>
          <button class="icon-btn" type="button" aria-label="Fechar" data-modal-close>${icons.x}</button>
        </div>
        <div class="sheet-body">${opts.html || ''}</div>
      </div>`;
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    openCount++;

    const sheet = back.querySelector('.sheet');
    let done = false;
    let resolveClosed;
    const closed = new Promise(r => resolveClosed = r);
    const previousFocus = document.activeElement;

    function close(result){
      if(done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      back.classList.add('leaving');
      const finish = () => {
        back.remove();
        openCount = Math.max(0, openCount - 1);
        if(!openCount) document.body.classList.remove('modal-open');
        if(previousFocus && previousFocus.focus) try{ previousFocus.focus({ preventScroll:true }); }catch(e){}
        if(opts.onClose) opts.onClose(result);
        resolveClosed(result);
      };
      if(reduceMotion()) finish(); else setTimeout(finish, 220);
    }
    function onKey(e){
      if(e.key === 'Escape' && !opts.locked){ e.stopPropagation(); close(null); }
      if(e.key === 'Tab'){
        const f = [...sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if(!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', e => { if(e.target === back && !opts.locked) close(null); });
    back.addEventListener('click', e => { if(e.target.closest('[data-modal-close]') && !opts.locked) close(null); });

    requestAnimationFrame(() => {
      const first = sheet.querySelector('[autofocus]');
      if(first) first.focus({ preventScroll:true });
      else sheet.querySelector('[data-modal-close]').focus({ preventScroll:true });
    });

    return { el: back, sheet, body: back.querySelector('.sheet-body'), close, closed };
  }

  /** Pergunta sim/não. Resolve true se confirmou. */
  function confirmBox(opts){
    return new Promise(resolve => {
      const m = openModal({
        title: opts.title || 'Confirmar',
        html: `
          <p class="confirm-text">${opts.html || esc(opts.text || '')}</p>
          <div class="sheet-actions">
            <button class="btn" type="button" data-no>${esc(opts.noLabel || 'Cancelar')}</button>
            <button class="btn ${opts.danger ? 'danger' : 'primary'}" type="button" data-yes>${esc(opts.yesLabel || 'Confirmar')}</button>
          </div>`,
        onClose: r => resolve(r === true)
      });
      m.body.querySelector('[data-no]').onclick = () => m.close(false);
      m.body.querySelector('[data-yes]').onclick = () => m.close(true);
    });
  }

  async function busy(btn, fn){
    if(btn){ btn.disabled = true; btn.classList.add('busy'); }
    try{ return await fn(); }
    finally{ if(btn){ btn.disabled = false; btn.classList.remove('busy'); } }
  }

  function debounce(fn, ms){
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  // ---------- ícones (traço) ----------
  const svg = (inner, extra) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${inner}</svg>`;
  const icons = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>'),
    list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6.2l1 1 1.8-2M3.5 12.2l1 1 1.8-2M3.5 18.2l1 1 1.8-2"/>'),
    coins: svg('<circle cx="9" cy="9" r="5.5"/><path d="M14.6 6.6A5.5 5.5 0 1 1 9.4 14.5"/><path d="M9 6.5v5M7.2 9h3.6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
    minus: svg('<path d="M5 12h14"/>', 'stroke-width="2.4"'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3-5.2 6.5-5.2s5.9 1.8 6.5 5.2"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.9c2 .6 3.2 2.3 3.5 5.1"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 21h4"/>'),
    chevron: svg('<path d="M9 5l7 7-7 7"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    power: svg('<path d="M12 3v8"/><path d="M6.4 6.9a8 8 0 1 0 11.2 0"/>', 'stroke-width="2.4"'),
    logout: svg('<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'),
    hourglass: svg('<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>'),
    sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z"/>'),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    smartphone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    send: svg('<path d="M21 3L10.5 13.5M21 3l-6.5 18-4-8.5L2 8.5 21 3z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/>'),
    gift: svg('<rect x="3.5" y="8" width="17" height="4"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8c-2.5 0-4.5-.8-4.5-2.5S9 3 10.5 3C11.7 3 12 5 12 8zM12 8c2.5 0 4.5-.8 4.5-2.5S15 3 13.5 3C12.3 3 12 5 12 8z"/>')
  };

  // ---------- gato, cão e moedas (desenhos próprios, sprite em index.html) ----------
  const coin = (side, size) => `<svg class="coin coin-${side}" width="${size || 20}" height="${size || 20}" viewBox="0 0 32 32" aria-hidden="true"><use href="#coin-${side}"/></svg>`;
  const face = (side, size) => `<svg class="face face-${side}" width="${size || 28}" height="${size || 28}" viewBox="0 0 32 32" aria-hidden="true"><use href="#face-${side}"/></svg>`;

  // ---------- efeito: moedas voando ----------
  /** Solta algumas moedinhas a partir de um elemento e um "+N" que sobe. */
  function coinBurst(from, side, amount){
    if(reduceMotion() || !from) return;
    const r = from.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const layer = document.createElement('div');
    layer.className = 'fx-layer';
    const n = Math.min(9, 4 + Math.round(Math.abs(amount || 3) / 2));
    let html = '';
    for(let i = 0; i < n; i++){
      const ang = (-90 + (Math.random() - .5) * 150) * Math.PI / 180;
      const dist = 70 + Math.random() * 70;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 20;
      html += `<span class="fx-coin" style="left:${cx}px;top:${cy}px;--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(i * 28)}ms">${coin(side, 16 + Math.round(Math.random() * 8))}</span>`;
    }
    if(amount) html += `<span class="fx-amount ${side}" style="left:${cx}px;top:${cy}px">+${amount}</span>`;
    layer.innerHTML = html;
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1500);
  }

  /** Anima um número até o valor novo (a partir do que já estava escrito). */
  function countTo(el, to){
    const from = Number(el.dataset.v);
    el.dataset.v = String(to);
    if(reduceMotion() || !Number.isFinite(from) || from === to){ el.textContent = to; return; }
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if(k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return { esc, toast, openModal, confirmBox, busy, debounce, reduceMotion, icons, coin, face, coinBurst, countTo, isModalOpen: () => openCount > 0 };
})();
