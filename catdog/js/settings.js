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

  function focusCard(){
    const s = me(), o = R.other(s);
    const mineV = App.settings[s] ? App.settings[s].focus_value : 2;
    const theirV = App.settings[o] ? App.settings[o].focus_value : 2;
    return `
      <section class="card enter">
        <div class="card-head"><h3>Moedas de foco</h3></div>
        <p class="muted">Cada sessão de foco concluída (mín. 15 min, até 8 por dia) vale quanto o <b>outro lado</b> definir.</p>
        <ul class="rules">
          <li>${UI.coin(s, 18)}<span>Sua sessão vale <b>${R.pluralCoins(mineV, s)}</b> (definido pelo ${R.SIDES[o].label}).</span></li>
          <li>${UI.coin(o, 18)}<span>A sessão do ${R.SIDES[o].label} vale <b>${R.pluralCoins(theirV, o)}</b> — você define:</span></li>
        </ul>
        <div class="stepper ${o} inline-step">
          <button class="icon-btn" type="button" data-act="fv-step" data-d="-1" aria-label="Menos">${I.minus}</button>
          <b class="fv-n" data-fv="${theirV}">${theirV}</b>
          <button class="icon-btn" type="button" data-act="fv-step" data-d="1" aria-label="Mais">${I.plus}</button>
          <button class="btn primary small" type="button" data-act="fv-save" disabled>Salvar</button>
        </div>
      </section>`;
  }

  /** minutos → "HH:MM" */
  const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

  function timeCard(){
    const s = me(), o = R.other(s);
    const start = App.settings[s] ? App.settings[s].day_start_min : 0;
    const opts = [];
    for(let m = 0; m <= 720; m += 30) opts.push(`<option value="${m}" ${m === start ? 'selected' : ''}>${hhmm(m)}${m === 0 ? ' (meia-noite)' : ''}</option>`);
    return `
      <section class="card enter">
        <div class="card-head"><h3>Horário</h3></div>
        <p class="muted">Cada um usa o próprio relógio, com horário de verão automático. Alarmes e prazos valem na hora local de quem faz.</p>
        <ul class="rules">
          <li>${UI.coin(s, 18)}<span>Você: <b>${R.TZ_NAMES[s]}</b> — agora são <b data-clock="${s}">${R.timeOf(Date.now(), s)}</b></span></li>
          <li>${UI.coin(o, 18)}<span>${R.SIDES[o].label}: <b>${R.TZ_NAMES[o]}</b> — agora são <b data-clock="${o}">${R.timeOf(Date.now(), o)}</b></span></li>
        </ul>
        <label class="field"><span>Seu dia começa às</span>
          <select name="daystart" class="select" data-v="${start}">${opts.join('')}</select></label>
        <p class="fine">Suas tarefas diárias, o "Hoje" e a sequência só viram nesse horário (ex.: 06:00 para quem dorme de manhã). As tarefas <b>compartilhadas</b> repetidas sempre viram à meia-noite de Brasília.</p>
        <div class="card-actions"><button class="btn primary small" type="button" data-act="ds-save" disabled>Salvar</button></div>
      </section>`;
  }

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

      ${timeCard()}

      ${focusCard()}

      <section class="card enter">
        <div class="card-head"><h3>Sobre as moedas</h3></div>
        <ul class="rules">
          <li>${UI.coin('gato', 18)}<span>Cada um ganha a moeda do <b>outro</b> bicho: o Cão (jogador) ganha <b>moedas felinas</b> e o Gato (mestre) ganha <b>moedas caninas</b>.</span></li>
          <li>${I.users}<span>O valor de cada tarefa é definido pelo <b>outro lado</b>: o Gato (mestre) valora as tarefas do Cão e o Cão (jogador) valora as do Gato.</span></li>
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
    root.addEventListener('change', e => {
      if(e.target.name !== 'daystart' || !view) return;
      const btn = root.querySelector('[data-act="ds-save"]');
      if(btn) btn.disabled = Number(e.target.value) === Number(e.target.dataset.v);
    });
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if(!b || !view || !root.contains(b)) return;
      const a = b.dataset.act;
      if(a === 'logout'){
        const ok = await UI.confirmBox({ title: 'Sair', text: 'Você vai precisar do PIN para entrar de novo.', yesLabel: 'Sair' });
        if(ok) SubrosaAuth.logout();
      }else if(a === 'ds-save'){
        const sel = root.querySelector('[name=daystart]');
        await UI.busy(b, async () => {
          try{
            await API.setDayStart(Number(sel.value));
            await App.reload();
            App.refreshView();
            UI.toast('Início do dia atualizado', 'good');
            render(view);
          }catch(err){ UI.toast(err.message, 'bad'); }
        });
      }else if(a === 'fv-step'){
        const n = root.querySelector('[data-fv]');
        n.textContent = Math.max(0, Math.min(50, Number(n.textContent) + Number(b.dataset.d)));
        root.querySelector('[data-act="fv-save"]').disabled = Number(n.textContent) === Number(n.dataset.fv);
      }else if(a === 'fv-save'){
        const n = root.querySelector('[data-fv]');
        await UI.busy(b, async () => {
          try{
            await API.setFocusValue(R.other(me()), Number(n.textContent));
            await App.reload();
            UI.toast('Valor do foco atualizado', 'good');
            render(view);
          }catch(err){ UI.toast(err.message, 'bad'); }
        });
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
