// Service worker mínimo, só pra habilitar a instalação como app
// (Android/Chrome exige um SW registrado com handler de fetch).
// De propósito NÃO cacheia nada: o SUBROSA muda com frequência e
// depende de dados ao vivo do Supabase, então cachear a página
// arriscaria mostrar uma versão velha do app pros dois lados.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// ---- notificações push (hoje só o Cat & Dog usa; os outros projetos nunca recebem push) ----
// O corpo do push é um JSON { title, body, tag, url }; `url` é relativa a este arquivo (raiz do site).
self.addEventListener('push', (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch(e){ data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Cat & Dog';
  event.waitUntil((async () => {
    // se o app estiver aberto, avisa a página também (ela toca o alarme na tela)
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    open.forEach(c => { try{ c.postMessage({ type: 'catdog-push', payload: data }); }catch(e){} });
    await self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'catdog/icons/icon-192.png',
    badge: 'catdog/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || 'catdog/' },
    vibrate: [120, 60, 120]
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || 'catdog/', self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of all){
      if(c.url.startsWith(target) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(target);
  })());
});
