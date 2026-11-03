# Subrosa — regras do projeto

Subrosa é um **hub** (site no GitHub Pages + um projeto Supabase) que abriga vários projetos independentes. O primeiro é o **Levina**, um RPG cyberpunk (`levina/`). Detalhes em `docs/README.md`.

## Regras fixas (definidas pelo usuário)

- **NUNCA deletar nada.** Só reorganizar (`git mv`). Tabelas, funções, URLs e chaves antigas continuam funcionando.
- **Um documento por projeto, em `docs/<id>.md`.** Ao começar um projeto novo, CRIE O DOCUMENTO DELE primeiro (modelo: `docs/_MODELO_PROJETO.md`) e liste-o em `docs/README.md`. Ao terminar cada funcionalidade, atualize o documento do projeto (histórico com data, banco, arquivos).
- **Planejar antes de mudanças grandes** e perguntar antes de começar. Deixar uma tag no git antes de reestruturar.
- **O Levina continua um projeto só**, agrupado e funcionando como sempre. O hub separa RPGs e aplicativos; não vira vários apps.
- Dentro do Levina o nome visível continua **SUBROSA** (é o nome do banco/jogo no RPG). "Levina" é só pasta/arquivo/documento.

## Login

- O site todo usa login por PIN (`shared/auth.js` + `hub_login` no banco): um PIN = mestre, outro = jogador. Projeto novo inclui `<script src="../shared/auth.js"></script>` no `<head>` e inicia dentro de `SubrosaAuth.onReady(a => …)` (`a.role`). Sem tela de escolha mestre/jogador.
- **NUNCA escrever os PINs em arquivos do repositório, docs, memória ou commits** (o repo é público). Só o hash no banco; para trocar, usar o SQL de `docs/hub.md` direto no CLI.
- Tabelas/funções do hub levam prefixo `hub_` (migrations em `supabase/hub/`).
- O PIN do jogador é só a porta da frente (o banco é legível com a chave pública); o do mestre protege de verdade (token no servidor).

## Convenções técnicas

- Caminhos **relativos** sempre (o site mora em `/Subrosa/`). Nunca `/` absoluto.
- Projeto novo `<id>`: tabelas/funções `<id>_…`, buckets e Edge Functions `<id>-…`, canais Realtime `<id>_…`, chaves de storage do navegador `<id>.…`, migrations em `supabase/<id>/`.
- **Nomes do Levina que não mudam:** `msg_*`, `diary_*`, `inventory_*`, `codex_*`, `dice_rolls`, `game_state`, `master_sessions`, RPCs existentes, Edge Functions `advance-day`/`go-back-day`, bucket `game-images`, `localStorage` `subrosa-master-token` / `subrosa_sound` / `subrosa_install_dismissed` / `subrosa_seen_notif`, canal `subrosa_presence`.
- Cada projeto instalável tem `manifest.json` próprio na sua pasta (`start_url` e `scope` `"./"`). O `sw.js` é um só, na raiz, e não guarda cache.
- Sem build: HTML/CSS/JS puros. Bibliotecas só por CDN com versão.

## Banco e testes

- CLI do Supabase já ligado ao projeto `tvhdlqapeofyxfxppjov`: `npx --yes supabase db query --linked --file <arquivo>` (use `--file` para SQL de várias linhas; leitura: `--read-only`; qualquer SQL que altere produção exige **perguntar ao usuário** e rodar com `--yes`), `npx --yes supabase functions deploy <nome> --no-verify-jwt`.
- Testar migration dentro de bloco que termina em `raise exception 'RESULTADO …'` (desfaz tudo) e só então aplicar de verdade.
- Há **dados reais** de jogo (contatos, conversas, sessões de mestre, dia atual em `game_state`). Nunca apagar/alterar por contagem ou data. Dados de teste usam prefixo `ZZ` e são removidos pelo nome exato; sessão de mestre temporária = apagar só aquele token.
- Para testar no navegador: `preview_start` com `subrosa-static` (porta 5500). Neutralize `saveState/flushSave` antes de mexer na interface do Levina.

## Commits

Mensagens em português, curtas, no estilo do histórico. Commit + push ao concluir cada funcionalidade.
