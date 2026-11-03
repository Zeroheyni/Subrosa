/* ============================================================
   POKÉMON — enquadrador de foto (estilo Discord)

   Cropper.open({ url?, frame?, title? }) -> Promise
     resolve null            se cancelou
     resolve {
       croppedBlob,          recorte quadrado 512 px (o que aparece na tela)
       sourceBlob | null,    original reduzido (só quando uma imagem nova foi escolhida)
       frame                 { zoom, cx, cy }  enquadramento normalizado (pra reenquadrar depois)
     }

   Enquadramento: `zoom` 1 = o lado menor da imagem preenche o quadrado;
   abaixo de 1 a imagem inteira cabe (sobra transparente); `cx, cy` = centro
   do recorte em fração da imagem (0 a 1). Por ser normalizado, vale pra
   qualquer resolução da mesma foto.
   ============================================================ */
window.Cropper = (function(){
  'use strict';

  const OUT = 512;          // lado do recorte final
  const SRC_MAX = 1600;     // maior lado da imagem original guardada
  const ZOOM_MAX = 6;
  const MAX_FILE = 30 * 1024 * 1024;
  const MAX_BYTES = 4.6 * 1024 * 1024; // bucket aceita 5 MB

  const loadImage = (src, cross) => new Promise((res, rej) => {
    const im = new Image();
    if(cross) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Não consegui abrir essa imagem'));
    im.src = src;
  });

  const zoomMin = (w, h) => Math.min(w, h) / Math.max(w, h);

  function clampFrame(f, w, h){
    const zoom = Math.min(ZOOM_MAX, Math.max(zoomMin(w, h), Number(f.zoom) || 1));
    const side = Math.min(w, h) / zoom;
    const hx = side / 2 / w, hy = side / 2 / h;
    const cx = side >= w ? 0.5 : Math.min(1 - hx, Math.max(hx, Number(f.cx) || 0.5));
    const cy = side >= h ? 0.5 : Math.min(1 - hy, Math.max(hy, Number(f.cy) || 0.5));
    return { zoom, cx, cy };
  }

  /** Desenha o enquadramento num quadrado `size` × `size`. */
  function draw(ctx, img, w, h, frame, size){
    const f = clampFrame(frame, w, h);
    const side = Math.min(w, h) / f.zoom;
    const x0 = f.cx * w - side / 2, y0 = f.cy * h - side / 2;
    const k = size / side;
    const sx = Math.max(0, x0), sy = Math.max(0, y0);
    const ex = Math.min(w, x0 + side), ey = Math.min(h, y0 + side);
    if(ex <= sx || ey <= sy) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, ex - sx, ey - sy, (sx - x0) * k, (sy - y0) * k, (ex - sx) * k, (ey - sy) * k);
  }

  const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

  /** WebP (mantém transparência); se o navegador não gerar, PNG; se ficar grande, JPEG. */
  async function encode(canvas){
    let b = await toBlob(canvas, 'image/webp', 0.92);
    if(b && b.type === 'image/webp' && b.size <= MAX_BYTES) return b;
    b = await toBlob(canvas, 'image/png');
    if(b && b.size <= MAX_BYTES) return b;
    const flat = document.createElement('canvas');
    flat.width = canvas.width; flat.height = canvas.height;
    const c = flat.getContext('2d');
    c.fillStyle = '#151925'; c.fillRect(0, 0, flat.width, flat.height);
    c.drawImage(canvas, 0, 0);
    return toBlob(flat, 'image/jpeg', 0.88);
  }

  /** Reduz a imagem a no máximo SRC_MAX no maior lado. */
  function downscale(img){
    const k = Math.min(1, SRC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  const ICON_SMALL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  const ICON_BIG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';

  function open(opts){
    opts = opts || {};
    return new Promise(resolve => {
      let src = null;            // imagem de trabalho (Image ou canvas)
      let sw = 0, sh = 0;        // tamanho da imagem de trabalho
      let srcCanvas = null;      // original reduzido (só quando veio de arquivo)
      let frame = { zoom:1, cx:.5, cy:.5 };
      let ctx, S = 320, dpr = 1, raf = 0;
      const pointers = new Map();

      const m = UI.openModal({
        title: opts.title || 'Foto',
        locked: false,
        html: `
          <div class="crop">
            <div class="crop-drop" data-drop>
              <div class="crop-drop-ball"></div>
              <strong>Escolha uma imagem</strong>
              <span>Clique aqui, arraste um arquivo ou cole (Ctrl+V)</span>
            </div>
            <div class="crop-work" hidden>
              <div class="crop-stage" data-stage tabindex="0" aria-label="Área de enquadramento: arraste para mover, role para dar zoom">
                <canvas></canvas>
                <div class="crop-mask"></div>
                <div class="crop-ring"></div>
              </div>
              <div class="crop-zoom">
                <span class="crop-zi">${ICON_SMALL}</span>
                <input type="range" min="0" max="1000" value="0" data-zoom aria-label="Zoom">
                <span class="crop-zi">${ICON_BIG}</span>
              </div>
              <p class="crop-hint">Arraste para mover · role ou use o controle para dar zoom</p>
            </div>
            <input type="file" accept="image/*" hidden data-file>
            <div class="modal-actions">
              <button class="btn ghost" type="button" data-pick hidden>Trocar imagem</button>
              <span class="grow"></span>
              <button class="btn" type="button" data-cancel>Cancelar</button>
              <button class="btn primary" type="button" data-save disabled>Salvar foto</button>
            </div>
          </div>`,
        onClose: r => { document.removeEventListener('paste', onPaste); resolve(r || null); }
      });

      const root = m.body;
      const $ = s => root.querySelector(s);
      const dropEl = $('[data-drop]'), work = $('.crop-work'), stage = $('[data-stage]');
      const canvas = $('canvas'), slider = $('[data-zoom]'), fileEl = $('[data-file]');
      const saveBtn = $('[data-save]'), pickBtn = $('[data-pick]');

      // ---------- zoom <-> controle ----------
      const t2z = t => { const zmin = zoomMin(sw, sh); return zmin * Math.pow(ZOOM_MAX / zmin, t); };
      const z2t = z => { const zmin = zoomMin(sw, sh); return Math.log(z / zmin) / Math.log(ZOOM_MAX / zmin); };

      function schedule(){ if(!raf) raf = requestAnimationFrame(render); }
      function render(){
        raf = 0;
        if(!src) return;
        frame = clampFrame(frame, sw, sh);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, S, S);
        ctx.fillStyle = '#0c0f15';
        ctx.fillRect(0, 0, S, S);
        draw(ctx, src, sw, sh, frame, S);
        slider.value = Math.round(z2t(frame.zoom) * 1000);
      }
      function sizeCanvas(){
        S = stage.clientWidth || 320;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(S * dpr);
        canvas.height = Math.round(S * dpr);
        canvas.style.width = canvas.style.height = S + 'px';
        ctx = canvas.getContext('2d');
        schedule();
      }

      function setSource(img, isNew, initialFrame){
        src = img;
        sw = img.naturalWidth || img.width;
        sh = img.naturalHeight || img.height;
        srcCanvas = isNew ? img : null;
        frame = clampFrame(initialFrame || { zoom:1, cx:.5, cy:.5 }, sw, sh);
        dropEl.hidden = true;
        work.hidden = false;
        pickBtn.hidden = false;
        saveBtn.disabled = false;
        sizeCanvas();
      }

      async function loadFile(file){
        if(!file || !/^image\//.test(file.type)){ UI.toast('Isso não parece uma imagem', 'bad'); return; }
        if(file.size > MAX_FILE){ UI.toast('Imagem grande demais (máx. 30 MB)', 'bad'); return; }
        const url = URL.createObjectURL(file);
        try{
          const img = await loadImage(url);
          setSource(downscale(img), true, null);
        }catch(e){ UI.toast(e.message, 'bad'); }
        finally{ URL.revokeObjectURL(url); }
      }

      // ---------- entrada de imagem: clicar, arrastar, colar ----------
      dropEl.addEventListener('click', () => fileEl.click());
      pickBtn.addEventListener('click', () => fileEl.click());
      fileEl.addEventListener('change', () => { if(fileEl.files[0]) loadFile(fileEl.files[0]); fileEl.value = ''; });
      m.modal.addEventListener('dragover', e => { e.preventDefault(); m.modal.classList.add('dragging'); });
      m.modal.addEventListener('dragleave', e => { if(e.target === m.modal) m.modal.classList.remove('dragging'); });
      m.modal.addEventListener('drop', e => {
        e.preventDefault();
        m.modal.classList.remove('dragging');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if(f) loadFile(f);
      });
      function onPaste(e){
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for(const it of items){
          if(it.type && it.type.indexOf('image') === 0){ loadFile(it.getAsFile()); e.preventDefault(); return; }
        }
      }
      document.addEventListener('paste', onPaste);

      // ---------- arrastar / pinça / roda / teclado ----------
      const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      stage.addEventListener('pointerdown', e => {
        stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
        stage.classList.add('grabbing');
      });
      stage.addEventListener('pointermove', e => {
        const p = pointers.get(e.pointerId);
        if(!p || !src) return;
        if(pointers.size === 1){
          const side = Math.min(sw, sh) / frame.zoom;
          frame.cx -= (e.clientX - p.x) / S * side / sw;
          frame.cy -= (e.clientY - p.y) / S * side / sh;
          p.x = e.clientX; p.y = e.clientY;
        }else if(pointers.size === 2){
          const before = dist();
          p.x = e.clientX; p.y = e.clientY;
          const after = dist();
          if(before > 0) frame.zoom *= after / before;
        }
        schedule();
      });
      const endPointer = e => {
        pointers.delete(e.pointerId);
        if(!pointers.size) stage.classList.remove('grabbing');
      };
      stage.addEventListener('pointerup', endPointer);
      stage.addEventListener('pointercancel', endPointer);
      stage.addEventListener('wheel', e => {
        if(!src) return;
        e.preventDefault();
        frame.zoom *= Math.exp(-e.deltaY * 0.0015);
        schedule();
      }, { passive:false });
      stage.addEventListener('keydown', e => {
        if(!src) return;
        const side = Math.min(sw, sh) / frame.zoom, step = 0.03;
        if(e.key === 'ArrowLeft') frame.cx -= side * step / sw;
        else if(e.key === 'ArrowRight') frame.cx += side * step / sw;
        else if(e.key === 'ArrowUp') frame.cy -= side * step / sh;
        else if(e.key === 'ArrowDown') frame.cy += side * step / sh;
        else if(e.key === '+' || e.key === '=') frame.zoom *= 1.08;
        else if(e.key === '-') frame.zoom /= 1.08;
        else return;
        e.preventDefault();
        schedule();
      });
      slider.addEventListener('input', () => { frame.zoom = t2z(slider.value / 1000); schedule(); });
      window.addEventListener('resize', onResize);
      function onResize(){ if(src) sizeCanvas(); }
      m.closed.then(() => window.removeEventListener('resize', onResize));

      // ---------- salvar / cancelar ----------
      $('[data-cancel]').addEventListener('click', () => m.close(null));
      saveBtn.addEventListener('click', () => UI.busy(saveBtn, async () => {
        try{
          const out = document.createElement('canvas');
          out.width = out.height = OUT;
          draw(out.getContext('2d'), src, sw, sh, frame, OUT);
          const croppedBlob = await encode(out);
          const sourceBlob = srcCanvas ? await encode(srcCanvas) : null;
          if(!croppedBlob || (srcCanvas && !sourceBlob)) throw new Error('Não consegui gerar a imagem');
          const r = v => Math.round(v * 10000) / 10000;
          m.close({ croppedBlob, sourceBlob, frame:{ zoom:r(frame.zoom), cx:r(frame.cx), cy:r(frame.cy) } });
        }catch(e){ UI.toast(e.message, 'bad'); }
      }));

      // ---------- já tem imagem? abre direto no enquadramento ----------
      if(opts.url){
        loadImage(opts.url, true)
          .then(img => setSource(img, false, opts.frame))
          .catch(() => UI.toast('Não consegui carregar a imagem atual. Escolha outra.', 'bad'));
      }
    });
  }

  return { open, clampFrame, draw };
})();
