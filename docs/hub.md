# Hub Subrosa

A tela inicial do site. Lista os projetos (RPGs e aplicativos) e leva a cada um. Não tem banco de dados nem login: é só um lançador.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/`
- **Arquivos:** `index.html`, `projects.js`, `manifest.json`, `sw.js`, `icons/`, `shared/pwa.js`
- **App instalável (PWA):** sim. Nome na tela inicial: **Subrosa**, ícone de rosa. Quem já tinha instalado o app antigo passa a abrir o hub (o endereço instalado era a raiz do site).

## Como funciona

- `projects.js` define `window.SUBROSA_PROJECTS`. O `index.html` desenha as seções ("RPGs" e "Aplicativos") a partir dessa lista; seção sem projeto mostra um espaço vazio "em breve".
- Abrir um projeto: o cartão cresce, o resto apaga e a página navega (`prefers-reduced-motion` pula a animação).
- Voltar de um projeto pelo botão de desligar: o projeto grava `sessionStorage['subrosa-hub-poweron']` e o hub toca a animação de "ligar" (efeito TV de tubo).
- `shared/pwa.js` registra o service worker e mostra o banner de instalar. Está pronto para os projetos novos reaproveitarem (o Levina ainda usa a versão própria dele).
- `sw.js` é um só, na raiz, e **não guarda nada em cache** (só deixa o app instalável). Por isso toda atualização do site chega ao app instalado.

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
| 2026-11-03 | Criação do hub: tela inicial com cartão do Levina, seções RPGs/Aplicativos, ícone de rosa, PWA própria, `shared/pwa.js`, documentação em `docs/` e regras em `CLAUDE.md` |
