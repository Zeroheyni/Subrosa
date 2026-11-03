# Hub Subrosa

A tela inicial do site. Lista os projetos (RPGs e aplicativos) e leva a cada um. Não tem banco de dados nem login: é só um lançador.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/`
- **Arquivos:** `index.html`, `projects.js`, `manifest.json`, `sw.js`, `icons/`, `shared/pwa.js`, `shared/auth.js`
- **App instalável (PWA):** sim. Nome na tela inicial: **Subrosa**, ícone de rosa. Quem já tinha instalado o app antigo passa a abrir o hub (o endereço instalado era a raiz do site).

## Como funciona

- `projects.js` define `window.SUBROSA_PROJECTS`. O `index.html` desenha as seções ("RPGs" e "Aplicativos") a partir dessa lista; seção sem projeto mostra um espaço vazio "em breve".
- Abrir um projeto: o cartão cresce, o resto apaga e a página navega (`prefers-reduced-motion` pula a animação).
- Voltar de um projeto pelo botão de desligar: o projeto grava `sessionStorage['subrosa-hub-poweron']` e o hub toca a animação de "ligar" (efeito TV de tubo).
- `shared/pwa.js` registra o service worker e mostra o banner de instalar. Está pronto para os projetos novos reaproveitarem (o Levina ainda usa a versão própria dele).
- `sw.js` é um só, na raiz, e **não guarda nada em cache** (só deixa o app instalável). Por isso toda atualização do site chega ao app instalado.

## Login por PIN (vale para o site todo)

Ao abrir qualquer página (hub ou projeto) sem estar logado, aparece uma tela de bloqueio parecida com a de um celular (hora, data, teclado numérico). **Só o PIN** — um PIN entra como **mestre**, outro como **jogador**; ninguém escolhe o papel. O PIN do mestre e o do jogador **não estão no código nem na documentação** (o repositório é público): só os hashes ficam no banco.

- **Arquivo:** `shared/auth.js` (carregado no `<head>` antes de tudo). Esconde a página até o PIN certo; ao acertar, a tela "destranca" e a página aparece.
- **Quem confere:** a função `hub_login(p_pin)` no banco (`supabase/hub/01_login_pin.sql`). Devolve `{ok, role, token?, expires_at?}`. Mestre ganha um token de sessão em `master_sessions` (90 dias, o mesmo que as funções de mestre já exigem); jogador não tem token.
- **Sessão no navegador:** `localStorage['subrosa.auth']` = `{role, token, exp}`. Jogador: **30 dias**. Mestre: até o fim da sessão do banco (90 dias). O `localStorage` é um só para o site todo, então o login do hub vale nos projetos. Para o Levina o token do mestre também é copiado para a chave antiga `subrosa-master-token`.
- **Sair:** botão com o papel atual ("Mestre"/"Jogador" + seta) no canto do hub; no Levina, "sair" no widget do mestre. Se a sessão de mestre expirar, volta para a tela de PIN com um aviso.
- **Trava de tentativas:** 8 PINs errados em 5 minutos travam o login por alguns minutos (vale para todos juntos).
- **Onde ficam os PINs:** mestre em `game_secrets.pin_hash` (id 1, já existia), jogador em `hub_pins` (role `player`). Para trocar, rode no SQL (sem salvar o valor em arquivo): `update game_secrets set pin_hash = extensions.crypt('NOVO', extensions.gen_salt('bf')) where id = 1;` e `update hub_pins set pin_hash = extensions.crypt('NOVO', extensions.gen_salt('bf')) where role = 'player';`
- **Limite honesto:** o PIN do **mestre** protege de verdade (as ações de mestre exigem o token no servidor). O PIN do **jogador** é só a porta da frente: as leituras do banco são públicas (chave anônima), então quem conhecer o endereço e souber mexer consegue ler dados. Para um projeto com dados privados, é preciso regra no banco, não só PIN.
- **Em projeto novo:** incluir `<script src="../shared/auth.js"></script>` no `<head>` e iniciar o app dentro de `SubrosaAuth.onReady(a => …)`; `a.role` diz se é `master` ou `player`. Não criar tela própria de escolha mestre/jogador.

### Banco do hub (prefixo `hub_`)

- `hub_pins` (hash do PIN do jogador) e `hub_login_attempts` (registro de erros, limpo após 1 dia): RLS ligado e **sem policy**, ninguém lê pela API.
- `hub_login(text)`: `security definer`, liberada para `anon`.
- `master_login(text)` (função antiga do Levina) **perdeu o acesso público**: não tinha trava de tentativas. O único caminho de login é `hub_login`.
- Migrations em `supabase/hub/`: `01_login_pin.sql`.

## Como adicionar um projeto novo

1. Criar a pasta (`minha-coisa/index.html`), com caminhos **relativos** (o site mora em `/Subrosa/`, nunca use `/` absoluto).
2. Se for instalável: `manifest.json` próprio na pasta, com `start_url` e `scope` `"./"`, e ícones próprios.
3. Adicionar o objeto em `projects.js`.
4. **Criar `docs/<id>.md`** a partir de `docs/_MODELO_PROJETO.md`.
5. Um botão de desligar para voltar ao hub (`../`), como no Levina, é opcional.
6. Se usar o banco: prefixar tudo com o id do projeto (ver `docs/README.md`).

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-03 | **Login por PIN** para o site todo (`shared/auth.js` + `hub_login` no banco): um PIN entra como mestre, outro como jogador, sessão de jogador de 30 dias, chip com o papel e "sair" no hub, trava de tentativas, `master_login` antigo fechado ao público |
| 2026-11-03 | Criação do hub: tela inicial com cartão do Levina, seções RPGs/Aplicativos, ícone de rosa, PWA própria, `shared/pwa.js`, documentação em `docs/` e regras em `CLAUDE.md` |
