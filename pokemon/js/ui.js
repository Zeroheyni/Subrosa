/* ============================================================
   POKÉMON — ajudantes de tela: escape de HTML, toast, modal, confirmação
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

  // ---------- modal ----------
  let openCount = 0;
  /**
   * openModal({ title, html, wide, onClose })
   * Devolve { el, body, close(result) , closed:Promise }.
   * Esc e clique fora fecham (a não ser que `locked` seja true).
   */
  function openModal(opts){
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || '')}">
        <div class="modal-head">
          <h2>${esc(opts.title || '')}</h2>
          <button class="modal-x" type="button" aria-label="Fechar" data-modal-close>✕</button>
        </div>
        <div class="modal-body">${opts.html || ''}</div>
      </div>`;
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    openCount++;

    const modal = back.querySelector('.modal');
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
      if(reduceMotion()) finish(); else setTimeout(finish, 180);
    }
    function onKey(e){
      if(e.key === 'Escape' && !opts.locked){ e.stopPropagation(); close(null); }
      if(e.key === 'Tab'){
        const f = [...modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if(!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', e => { if(e.target === back && !opts.locked) close(null); });
    back.querySelector('[data-modal-close]').addEventListener('click', () => { if(!opts.locked) close(null); });
    back.addEventListener('click', e => {
      const x = e.target.closest('[data-modal-close]');
      if(x && x !== back.querySelector('.modal-x')) close(null);
    });

    requestAnimationFrame(() => {
      const first = modal.querySelector('[autofocus],input,textarea,select');
      if(first) first.focus({ preventScroll:true });
      else modal.querySelector('.modal-x').focus({ preventScroll:true });
    });

    return { el: back, modal, body: back.querySelector('.modal-body'), close, closed };
  }

  /** Pergunta sim/não. Resolve true se confirmou. */
  function confirmBox(opts){
    return new Promise(resolve => {
      const m = openModal({
        title: opts.title || 'Confirmar',
        html: `
          <p class="confirm-text">${opts.html || esc(opts.text || '')}</p>
          <div class="modal-actions">
            <button class="btn" type="button" data-no>${esc(opts.noLabel || 'Cancelar')}</button>
            <button class="btn ${opts.danger ? 'danger' : 'primary'}" type="button" data-yes>${esc(opts.yesLabel || 'Confirmar')}</button>
          </div>`,
        onClose: r => resolve(r === true)
      });
      m.body.querySelector('[data-no]').onclick = () => m.close(false);
      m.body.querySelector('[data-yes]').onclick = () => m.close(true);
    });
  }

  /** Desabilita um botão enquanto uma promessa roda. */
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

  // ---------- ícones (traço, herdam a cor do texto) ----------
  const svg = (inner, extra) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${inner}</svg>`;
  const icons = {
    ball: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h5.5M15.5 12H21"/><circle cx="12" cy="12" r="3"/>'),
    person: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4 3.6-6 7.5-6s6.7 2 7.5 6"/>'),
    bag: svg('<path d="M6 8h12l1.2 12H4.8L6 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M9.5 13h5"/>'),
    swords: svg('<path d="M14.5 5.5 19 4l-1.5 4.5L9 17l-3-3 8.5-8.5z"/><path d="M5 19l2.2-2.2M3 21l2-2"/><path d="M9.5 5.5 5 4l1.5 4.5L9 11"/><path d="M19 19l-2.2-2.2M21 21l-2-2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    power: svg('<path d="M12 3v8"/><path d="M6.4 6.9a8 8 0 1 0 11.2 0"/>', 'stroke-width="2.4"'),
    logout: svg('<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>')
  };

  return { esc, toast, openModal, confirmBox, busy, debounce, reduceMotion, icons, isModalOpen: () => openCount > 0 };
})();
