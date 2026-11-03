# Levina

RPG de mesa cyberpunk em português. O app é o "celular do personagem": banco, calendário, relógio, mensagens, contatos, inventário, codex, diário e rolador de dados. Funciona ao vivo para dois lados: o **mestre** (controla o mundo) e o **jogador** (vê e age dentro do que o mestre permite).

> Dentro do app o nome visível continua **SUBROSA** (é o nome do banco/jogo no RPG). "Levina" é só o nome da pasta, dos arquivos e deste documento, para não confundir com o hub, que também se chama Subrosa.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/levina/`
- **Pasta:** `levina/`  ·  **Migrations:** `supabase/levina/`
- **App instalável (PWA):** sim, com manifest próprio (`levina/manifest.json`). Nome na tela inicial: **Levina**.
- **Voltar ao hub:** botão de desligar (⏻) na tela de entrada e na barra de status da home.

## Como está montado

Um único arquivo, `levina/index.html` (HTML + CSS + JS puro, sem build), mais o Supabase como backend. Tudo vive no escopo global do arquivo. Quebrar em vários arquivos está planejado para depois (ver "Ideias paradas").

| Peça | Detalhe |
|---|---|
| Tela | `render()` reescreve `#root`; overlays (`#diaryOverlay`, `#inventoryOverlay`, `#codexOverlay`, `#clockOverlay`, `#messagesOverlay`, `#contactsOverlay`) ficam fora do `#root` |
| Celular | `PHONE_APPS` é o registro de apps; `renderHome`, `openScreenApp`, `goHome`; o campo `visibleIn` permite apps só do modo sujo |
| Modos | `state.mode`: `limpo` (tema ciano) e `sujo` (tema vermelho) |
| Calendário do jogo | começa no ano 3430, 12 meses nomeados, 365 dias; `state.day`, `state.clock` (`HH:MM`) |
| Mestre | login por PIN (`master_login`) devolve um token guardado em `localStorage` (`subrosa-master-token`); RPCs de mestre exigem o token |
| Tempo real | Supabase Realtime: `postgres_changes`, `broadcast` (digitando…) e `presence` (mestre/jogador online) |
| Movimento | tokens `--ease-out/--ease-spring/--ease-in`; `#root.still` evita reanimar em re-render só de dados; respeita `prefers-reduced-motion` |

### Os apps

| App | O que faz |
|---|---|
| Banco (SUBROSA) | saldo limpo/sujo, negócios, ganhos e gastos fixos, investimentos, gráfico de patrimônio, resumo mensal |
| Calendário | passar/voltar dia (mestre), registro de acontecimentos, eventos |
| Relógio | relógio redondo com ponteiros arrastáveis (só mestre); passar da meia-noite avança o dia; jogador só vê |
| Mensagens | conversas diretas e em grupo, fotos (arquivo/colar/arrastar), digitando…, bloqueio, mensagens **agendadas** pelo mestre |
| Contatos | contatos do jogo; o jogador só vê o número até o mestre "revelar" |
| Depósito (Inventário) | carga do jogador, lugares, recipientes (podem ficar dentro de depósitos), itens, arrastar e soltar (segurar pra pegar no celular) |
| Memórias (Codex) | pastas e lembranças com foto, ordem arrastável, cores de pasta |
| Dados | rolador compartilhado, resultado calculado no servidor |
| Diário | **escondido de propósito**: só abre pelo pontinho no canto da tela. Dois autores (CAT = mestre, DOG = jogador), um texto por dia real |

## Banco de dados (Supabase `tvhdlqapeofyxfxppjov`)

Tabelas **sem prefixo** (herança de antes do hub; **não renomear**):

- `game_state` (linha única `id=1`, JSON com dia, hora, saldos, negócios, histórico…) e `master_sessions` (tokens do mestre). Existem desde a primeira versão do site e **não estão em nenhum `.sql`** (as migrations só as alteram).
- `diary_entries` · `dice_rolls`
- `inventory_containers` · `inventory_items` · `inventory_receptacles`
- `codex_folders` · `codex_entries`
- `msg_contacts` · `msg_threads` · `msg_thread_members` · `msg_messages` · `msg_scheduled`

**Segurança:** leitura pública (select), escrita só por RPCs `security definer`; as de mestre chamam `msg_assert_master(token)`. `msg_scheduled` não tem policy: só o mestre lê, por `msg_list_scheduled(token)`.

**Storage:** buckets `game-images` (público, 5 MB, png/jpeg/gif/webp; a chave anônima envia mas **não apaga**) e `diary-images`.

**Edge Functions:** `advance-day` e `go-back-day` (dividem `supabase/functions/_shared/simulation.ts`); publicadas com `--no-verify-jwt`.

**Gatilho:** `msg_game_state_deliver` em `game_state` entrega as mensagens agendadas quando o dia ou a hora mudam (funciona com o app do mestre fechado).

**Chaves que não podem mudar** (senão desloga gente ou quebra o app): `localStorage` `subrosa-master-token`, `subrosa_sound`, `subrosa_install_dismissed`, `subrosa_seen_notif`; canal Realtime `subrosa_presence`.

### Migrations (`supabase/levina/`)

| Arquivo | O que faz |
|---|---|
| `01_diary.sql` | diário CAT/DOG |
| `02_master_session_expiry.sql` | sessão de mestre de 24h para 90 dias |
| `03_dice_rolls.sql` | rolador de dados |
| `04_game_images_bucket.sql` | bucket `game-images` |
| `05_inventory_and_codex.sql` | inventário e codex |
| `06_inventory_receptacles.sql` | inventário v2: carga e recipientes |
| `07_codex_entry_order.sql` | ordem das lembranças |
| `08_codex_folder_color.sql` | cor de pasta |
| `09_codex_folder_order.sql` | ordem das pastas |
| `10_receptacles_in_containers.sql` | recipientes dentro de depósitos |
| `11_messages.sql` | mensagens, contatos, grupos, bloqueio |
| `12_message_image_size.sql` | largura/altura das fotos |
| `13_scheduled_messages.sql` | mensagens agendadas |

Aplicar: `npx --yes supabase db query --linked --file supabase/levina/<arquivo>.sql`. Para testar sem sujar o banco, envolva o teste num bloco que termina em `raise exception 'RESULTADO ...'` (tudo desfaz).

## Como testar sem estragar o jogo

Existem dados **reais** (contatos, conversas, sessões de mestre, o dia do jogo). Nunca apague por contagem ou data. Dados de teste levam o prefixo `ZZ` e são removidos pelo nome exato. Para fluxos de mestre, crie uma sessão temporária (`insert into master_sessions default values`) e apague **só aquele token**. Nunca altere o dia/hora reais de `game_state`.

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-08-22 | Primeira versão do site (painel financeiro) |
| 2026-09-01 | Diário CAT/DOG com editor rico, imagens e histórico; correções de salvamento |
| 2026-09-02 | Favicon do gatinho, símbolo próprio de dinheiro, sessão de mestre de 90 dias |
| 2026-09-06 | Diário mais rápido (previews leves, imagem colada) |
| 2026-09-14 | Gráfico de patrimônio, rolador de dados, pesquisas, elenco de personagens, inventário e codex |
| 2026-09-15 | Inventário refeito (carga, lugares, recipientes), arrastar itens, codex editável pelo mestre, ganhos/gastos fixos |
| 2026-09-16 | Codex: galeria, cores de pasta, feed; animações de transição |
| 2026-09-17 | PWA instalável (Android e iOS), trava de scroll nos overlays, indicador de presença, resumo mensal, calendário real |
| 2026-09-18 | Horário do RPG → app Relógio; tela inicial vira celular (home, widget, dock, Calendário separado); presença "online/offline"; correções de iOS (zoom, arrastar itens); recipientes dentro de depósitos |
| 2026-09-19 | Mensagens + Contatos + notificações; fotos nas conversas; mensagens agendadas e foto de quem fala nos grupos |
| 2026-10-02 | Polimento de movimento e acabamento visual |
| 2026-11-03 | **Vira um projeto do hub Subrosa**: app movido para `levina/`, manifest próprio (nome "Levina"), botão de desligar para voltar ao hub, migrations movidas para `supabase/levina/`. Nada deletado; nenhuma tabela, função ou chave renomeada. Marca de segurança no git: tag `antes-do-hub` |

## Ideias paradas (não construir sem pedir)

Tela de bloqueio com notificações, central de notificações, apps só do modo sujo (o registro já suporta), mensagens agendadas recorrentes, foto de grupo, reações em mensagens, Web Push de verdade, contratos/dívidas, metas, exportar backup, quebrar `levina/index.html` em vários arquivos (CSS/JS por app, com `<script src>` simples, sem build).
