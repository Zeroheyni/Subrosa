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
