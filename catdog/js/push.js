/* ============================================================
   CAT & DOG — notificações push (Web Push)
   Fase 1: inscrever o aparelho e mandar uma notificação de teste.
   A chave pública (VAPID) pode ficar no código; a privada só nos
   segredos do Supabase.
   ============================================================ */
window.Push = (function(){
  'use strict';

  const VAPID_PUBLIC_KEY = 'BCYscoPxsRyd9Fzabg9p1ha3I1B6eyEeJJWy4-DhhS5MHzJLMUAnbzb0XWoCVeS5Pp1DebAQMqdAutMO_Ae-4So';

  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function keyBytes(b64){
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function registration(){
    if(!('serviceWorker' in navigator)) return null;
    try{
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
      ]);
    }catch(e){ return null; }
  }

  /** Situação para a tela de Ajustes. */
  async function state(){
    const s = { supported: supported(), ios: ios(), standalone: standalone(), permission: 'default', subscribed: false, needInstall: false };
    if(!s.supported){
      // iPhone fora do app instalado não oferece push: orientar a instalar
      s.needInstall = s.ios && !s.standalone;
      return s;
    }
    s.permission = Notification.permission;
    const reg = await registration();
    if(reg){
      try{ s.subscribed = !!(await reg.pushManager.getSubscription()); }catch(e){}
    }
    return s;
  }

  /** Pede permissão, inscreve o aparelho e grava no banco. */
  async function enable(){
    if(!supported()) throw new Error('Este navegador não suporta notificações. No iPhone, instale o app na tela inicial primeiro.');
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') throw new Error('Você não permitiu notificações. Libere nas configurações do navegador/aparelho e tente de novo.');
    const reg = await registration();
    if(!reg) throw new Error('O serviço do app ainda não carregou. Recarregue a página e tente de novo.');
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    }
    await API.pushSubscribe(sub.toJSON(), navigator.userAgent);
    return sub;
  }

  async function disable(){
    const reg = await registration();
    const sub = reg && await reg.pushManager.getSubscription();
    if(!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try{ await API.pushUnsubscribe(endpoint); }catch(e){ /* a linha some quando o serviço de push recusar a próxima entrega */ }
  }

  async function test(){
    const reg = await registration();
    const sub = reg && await reg.pushManager.getSubscription();
    if(!sub) throw new Error('Este aparelho ainda não está inscrito. Ative as notificações primeiro.');
    // garante que o banco conhece o aparelho antes de pedir o envio
    await API.pushSubscribe(sub.toJSON(), navigator.userAgent);
    return API.pushTest(sub.endpoint);
  }

  return { state, enable, disable, test, supported, standalone, ios };
})();
