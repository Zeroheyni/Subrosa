# Documentação do Subrosa

O **Subrosa** é um hub pessoal: um site (GitHub Pages) e um banco (Supabase) que abrigam vários projetos independentes — RPGs e aplicativos úteis. Cada projeto vive na própria pasta e tem o próprio documento.

## Documentos

| Documento | Assunto |
|---|---|
| [hub.md](hub.md) | A tela inicial do site e como adicionar projetos |
| [levina.md](levina.md) | Levina — o RPG cyberpunk (banco, calendário, relógio, mensagens, inventário, codex, diário…) |
| [pokemon.md](pokemon.md) | Pokémon — gestor do RPG de Pokémon (treinadores, criaturas, bolsa, combate) |
| [catdog.md](catdog.md) | Cat & Dog — gamificação de produtividade a dois (tarefas, moedas felinas e caninas, timers, alarmes); fases 1 e 2 feitas |
| [_MODELO_PROJETO.md](_MODELO_PROJETO.md) | Modelo para o documento de um projeto novo |

## Regras

1. **Nunca deletar nada.** Reorganizar é permitido (`git mv`), apagar não. Tabelas, funções, URLs e chaves antigas continuam funcionando.
2. **Um documento por projeto.** Ao começar um projeto novo, o primeiro passo é criar `docs/<id>.md` pelo modelo. Depois de cada funcionalidade, atualizar o documento (o que foi feito, banco, histórico com data).
3. **Cada projeto na sua pasta**, com caminhos relativos (o site mora em `/Subrosa/`, nunca usar `/` absoluto).
4. **Projetos não dependem uns dos outros.** O que for útil para vários vai para `shared/`; o resto fica dentro do projeto.
5. **Prefixo em tudo que é compartilhado.** Num projeto novo `<id>`:
   - tabelas e funções: `<id>_nome`
   - buckets do Storage: `<id>-…` (ou a pasta `<id>/` dentro de um bucket)
   - Edge Functions: `<id>-…`
   - canais Realtime: `<id>_…`
   - chaves de `localStorage`/`sessionStorage`: `<id>.…` (o `localStorage` é um só para todo o `zeroheyni.github.io`)
   - migrations: `supabase/<id>/NN_descricao.sql`
6. **O Levina é a exceção histórica**: seus nomes (`msg_*`, `diary_*`, `inventory_*`, `codex_*`, `game_state`, `master_sessions`, `advance-day`, `go-back-day`, `game-images` etc.) ficam como estão. Está listado em `levina.md`.
7. **Privacidade:** o site e o repositório são públicos. Esconder um cartão no hub não protege nada; dados privados exigem PIN e regras no banco desenhadas no projeto.
8. **Login único por PIN.** O site todo usa `shared/auth.js`: um PIN entra como mestre, outro como jogador. Projetos novos não criam tela própria de "escolher mestre/jogador" (detalhes em `hub.md`). **PINs nunca entram no código, nos documentos nem nas migrations** (só hash no banco).
9. **Planejar antes de mudanças grandes** e deixar um ponto de volta no git (tag).

## Estrutura

```
Subrosa/
├─ index.html, projects.js, manifest.json, sw.js, icons/   ← o hub
├─ shared/                  ← peças reutilizáveis (pwa.js, auth.js = login por PIN)
├─ levina/                  ← projeto Levina
├─ <novo-projeto>/          ← cada projeto novo
├─ docs/                    ← um documento por projeto + este índice
├─ CLAUDE.md                ← regras para o Claude seguir em qualquer sessão
└─ supabase/
   ├─ hub/                  ← migrations do hub (login por PIN)
   ├─ levina/               ← migrations do Levina (01…13)
   ├─ <novo-projeto>/       ← migrations de cada projeto novo
   └─ functions/            ← Edge Functions (o Supabase exige essa pasta)
```

## Fluxo de trabalho

- Testar localmente (`preview_start` com `subrosa-static`, porta 5500), depois `git commit` + `git push`; o GitHub Pages publica sozinho.
- Banco e funções pelo CLI já ligado ao projeto `tvhdlqapeofyxfxppjov`: `npx --yes supabase db query --linked --file <arquivo>` e `npx --yes supabase functions deploy <nome> --no-verify-jwt`.
