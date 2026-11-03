/* ============================================================
   SUBROSA — PWA compartilhado (service worker + banner de instalar)

   Uso numa página de projeto:
     <script>window.SUBROSA_PWA = { id:'hub', title:'Subrosa', swPath:'sw.js', icon:'icons/icon-192.png' };</script>
     <script src="shared/pwa.js"></script>

   id     chave do projeto (a "dispensei o banner" fica em subrosa.<id>.install_dismissed)
   title  nome mostrado no banner
   swPath caminho do sw.js relativo à página (o sw.js é um só, na raiz do site)
   icon   imagem do banner, relativa à página
   ============================================================ */
(function(){
  const cfg = window.SUBROSA_PWA || {};
  const id = cfg.id || 'hub';
  const DISMISS_KEY = `subrosa.${id}.install_dismissed`;
  let deferredPrompt = null;

  if('serviceWorker' in navigator && cfg.swPath){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register(cfg.swPath).catch(err => console.error('Falha ao registrar service worker', err));
    });
  }

  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  const style = document.createElement('style');
  style.textContent = `
    .sr-install{position:fixed;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:150;max-width:420px;margin:0 auto;
      background:linear-gradient(160deg,#1b1128,#120c1a);border:1px solid #ff5c9a;border-radius:16px;padding:14px;
      display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 22px rgba(255,92,154,.3);
      animation:srInstallIn .35s cubic-bezier(.2,.8,.2,1);font-family:'Inter',sans-serif;color:#f3e9f7}
    @keyframes srInstallIn{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
    .sr-install img{width:38px;height:38px;border-radius:10px;flex-shrink:0}
    .sr-install .sr-body{flex:1;min-width:0}
    .sr-install .sr-title{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:13px}
    .sr-install .sr-sub{font-size:11px;color:#a590b3;margin-top:2px;line-height:1.4}
    .sr-install .sr-go{background:linear-gradient(120deg,#ff5c9a,#9b6bff);color:#1a0716;border:none;padding:8px 14px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
    .sr-install .sr-x{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#241833;border:1px solid #3a2750;color:#7d6a8c;cursor:pointer;font-size:12px}
    @media (prefers-reduced-motion:reduce){.sr-install{animation:none}}`;
  document.head.appendChild(style);

  const host = document.createElement('div');
  document.body.appendChild(host);

  function render(){
    let dismissed = false;
    try{ dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch(e){}
    if(standalone() || dismissed){ host.innerHTML = ''; return; }
    const ios = isIos();
    if(!ios && !deferredPrompt){ host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="sr-install">
        ${cfg.icon ? `<img src="${cfg.icon}" alt="">` : ''}
        <div class="sr-body">
          <div class="sr-title">Instalar ${cfg.title || 'o Subrosa'}</div>
          <div class="sr-sub">${ios
            ? 'Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.'
            : 'Adicione à tela inicial pra abrir como um app, sem barra de navegador.'}</div>
        </div>
        ${ios ? '' : '<button class="sr-go" id="srInstallGo">Instalar</button>'}
        <button class="sr-x" id="srInstallX" aria-label="Fechar">✕</button>
      </div>`;
    host.querySelector('#srInstallX').onclick = ()=>{
      try{ localStorage.setItem(DISMISS_KEY, '1'); } catch(e){}
      render();
    };
    const go = host.querySelector('#srInstallGo');
    if(go) go.onclick = async ()=>{
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      render();
    };
  }

  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; render(); });
  window.addEventListener('appinstalled', ()=>{ deferredPrompt = null; render(); });
  if(isIos() && !standalone()) render();
})();
