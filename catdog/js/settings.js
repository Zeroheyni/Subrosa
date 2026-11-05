/* ============================================================
   CAT & DOG — tela "Ajustes": perfil, notificações, sair
   ============================================================ */
window.Settings = (function(){
  'use strict';

  const R = CD_RULES;
  const I = UI.icons;
  const esc = UI.esc;

  let view = null;
  let info = null;           // situação das notificações

  const me = () => App.side;

  function pushCard(){
    if(!info) return `<div class="card"><div class="card-head"><h3>Notificações</h3></div><p class="muted">Verificando este aparelho…</p></div>`;

    let status, tone = '', body = '', actions = '';
    if(info.needInstall){
      status = 'Instale o app primeiro'; tone = 'warn';
      body = 'No iPhone as notificações só funcionam com o Cat &amp; Dog <b>instalado na tela inicial</b>: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abra o app por lá e volte aqui.';
    }else if(!info.supported){
      status = 'Sem suporte neste navegador'; tone = 'warn';
      body = 'Este navegador não oferece notificações com o app fechado. Tente pelo Chrome (Android) ou instale o app na tela inicial.';
    }else if(info.permission === 'denied'){
      status = 'Bloqueadas'; tone = 'bad';
      body = 'Você bloqueou as notificações deste app. Libere nas configurações do navegador ou do aparelho e volte aqui.';
    }else if(info.subscribed && info.permission === 'granted'){
      status = 'Ativadas neste aparelho'; tone = 'good';
      body = 'Os avisos vão chegar mesmo com o app fechado. Toque em “Enviar teste” para conferir.';
      actions = `
        <button class="btn primary" type="button" data-act="push-test">${I.send}<span>Enviar teste</span></button>
        <button class="btn ghost" type="button" data-act="push-off">Desativar</button>`;
    }else{
      status = 'Desativadas'; tone = '';
      body = 'Ative para receber alarmes, fins de timer e lembretes mesmo com o app fechado. O aparelho vai pedir a sua permissão.';
      actions = `<button class="btn primary" type="button" data-act="push-on">${I.bell}<span>Ativar notificações</span></button>`;
    }
    return `
      <section class="card">
        <div class="card-head"><h3>Notificações</h3><span class="status ${tone}">${status}</span></div>
        <p class="muted">${body}</p>
        ${actions ? `<div class="card-actions">${actions}</div>` : ''}
        ${info.supported && !info.standalone && !info.ios ? `<p class="fine">Dica: instalando o app na tela inicial, o aviso chega com mais confiança.</p>` : ''}
      </section>`;
  }

  function render(root){
    view = root;
    const s = me();
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Conta e aparelho</span><h1>Ajustes</h1></div>
      </header>

      <section class="card profile ${s} enter">
        <div class="profile-face">${UI.face(s, 56)}</div>
        <div class="profile-body">
          <small>Você entrou como</small>
          <h2>${R.SIDES[s].label} <em>${R.SIDES[s].role}</em></h2>
          <p>Suas moedas: ${UI.coin(s, 16)} ${R.SIDES[s].coin}</p>
        </div>
      </section>

      <div class="enter" id="pushHost">${pushCard()}</div>

      <section class="card enter">
        <div class="card-head"><h3>Sobre as moedas</h3></div>
        <ul class="rules">
          <li>${UI.coin('gato', 18)}<span><b>Moedas felinas</b> são do Gato (jogador). <b>Moedas caninas</b> são do Cão (mestre).</span></li>
          <li>${I.users}<span>O valor de cada tarefa é definido pelo <b>outro lado</b>: o Cão valora as tarefas do Gato e o Gato valora as do Cão.</span></li>
          <li>${I.hourglass}<span>Concluiu antes de ter valor? As moedas ficam <b>pendentes</b> e entram quando o valor for definido.</span></li>
        </ul>
      </section>

      <section class="card enter">
        <div class="card-actions col">
          <a class="btn" href="../">${I.back}<span>Voltar ao Subrosa</span></a>
          <button class="btn ghost danger-text" type="button" data-act="logout">${I.logout}<span>Sair</span></button>
        </div>
      </section>
      <p class="fine center">Cat &amp; Dog · fase 1 — tarefas e moedas</p>`;
    if(!info) refreshPush();
  }

  async function refreshPush(){
    try{ info = await Push.state(); }catch(e){ info = { supported:false, permission:'default', subscribed:false, needInstall:false }; }
    const host = document.getElementById('pushHost');
    if(host) host.innerHTML = pushCard();
  }

  function refresh(){ /* nada vem do banco nesta tela */ }

  function init(root){
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if(!b || !view || !root.contains(b)) return;
      const a = b.dataset.act;
      if(a === 'logout'){
        const ok = await UI.confirmBox({ title: 'Sair', text: 'Você vai precisar do PIN para entrar de novo.', yesLabel: 'Sair' });
        if(ok) SubrosaAuth.logout();
      }else if(a === 'push-on'){
        await UI.busy(b, async () => {
          try{ await Push.enable(); UI.toast('Notificações ativadas neste aparelho', 'good'); }
          catch(err){ UI.toast(err.message, 'bad'); }
          await refreshPush();
        });
      }else if(a === 'push-off'){
        await UI.busy(b, async () => {
          try{ await Push.disable(); UI.toast('Notificações desativadas neste aparelho'); }
          catch(err){ UI.toast(err.message, 'bad'); }
          await refreshPush();
        });
      }else if(a === 'push-test'){
        await UI.busy(b, async () => {
          try{ await Push.test(); UI.toast('Teste enviado! Em instantes ele chega.', 'good'); }
          catch(err){ UI.toast(err.message, 'bad'); }
        });
      }
    });
  }

  return { init, render, refresh };
})();
