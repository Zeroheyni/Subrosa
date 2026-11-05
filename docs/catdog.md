# Cat & Dog

Aplicativo para **gamificar a produtividade de duas pessoas**: tarefas, lista de afazeres, timers e alarmes. O **jogador** ganha **moedas felinas** 🐱 e o **mestre** ganha **moedas caninas** 🐶. Existem tarefas só de cada um e tarefas **compartilhadas**.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/catdog/` (ainda não criado)
- **Pasta:** `catdog/`  ·  **Migrations:** `supabase/catdog/`
- **App instalável (PWA):** sim — nome na tela inicial: **Cat & Dog** (precisa estar instalado para a notificação com o app fechado funcionar no iPhone)
- **Tipo no hub:** `app`
- **Estado:** em planejamento (nada construído). Este documento é o plano; as decisões marcadas **(a confirmar)** esperam o OK do usuário. Tudo que está em "Decisões já tomadas" foi escolhido pelo usuário em 2026-11-05.

## Decisões já tomadas (pelo usuário)

- Duas pessoas: o **mestre** (entra com o PIN de mestre → lado Cão, moedas caninas) e o **jogador** (PIN de jogador → lado Gato, moedas felinas). Usa o login único do hub (`shared/auth.js`), sem tela de escolha.
- Há tarefas **individuais** (de um lado só) e **compartilhadas** (dos dois).
- Alarmes e timers precisam **avisar com o app fechado** (notificação push), não só com o app aberto.
- Nome do projeto: **Cat & Dog**, id técnico `catdog`.
- **Tarefa compartilhada:** quem cria escolhe o **modo** entre os três: (1) *cada um marca a sua parte*, (2) *qualquer um conclui por todos*, (3) *só vale quando os dois concluírem*.
- **Quem dá o valor:** o **mestre define o valor (em moedas) das tarefas do jogador** e o **jogador define o valor das tarefas do mestre**.
- **Loja:** cada lado tem a própria loja **e** pode colocar na loja do outro recompensas que ele mesmo vai cumprir (ex.: "eu faço o jantar" por 20 moedas felinas).
- **Ordem das fases:** testar a notificação cedo (um botão de "notificação de teste" na Fase 1), depois o resto.

## Conceitos (proposta — a confirmar)

| Conceito | Como funciona |
|---|---|
| **Lado** | `gato` (jogador) ou `cao` (mestre). Vem do papel do login; o visual muda de acordo (cores e ícone). |
| **Moedas** | Cada lado tem a própria carteira: felinas (gato) e caninas (cão). Todo ganho e gasto vira uma linha num **extrato** (nunca só um número), então dá para ver de onde veio e corrigir. |
| **Tarefa** | Título, anotação, prazo (data e hora, opcionais), repetição (diária, dias da semana) e subitens. É **individual** (de um lado) ou **compartilhada**. O valor em moedas **não é do dono**: quem dá o valor é o **outro lado** (ver abaixo). |
| **Valor da tarefa** | Tarefa do jogador → o mestre define o valor em moedas felinas. Tarefa do mestre → o jogador define o valor em moedas caninas. Quem criou sugere uma dificuldade (fácil / média / difícil) só como dica. **(a confirmar)** Enquanto o outro lado não definir o valor, a tarefa pode ser concluída mas as moedas ficam **pendentes**; o ganho entra no extrato quando a tarefa estiver **concluída e com valor** (o que vier por último). |
| **Tarefa compartilhada** | O criador escolhe o modo: **cada um marca a sua parte** (cada parte rende as próprias moedas, e quando as duas estão feitas os dois levam um bônus); **qualquer um conclui por todos** (quem marcar conclui para os dois); **só vale quando os dois concluírem** (ninguém ganha até as duas partes). **(a confirmar)** Nas compartilhadas, cada lado define o valor da parte do outro, igual às individuais. |
| **Lista de afazeres** | As tarefas em listas/grupos (hoje, semana, sem prazo), com atrasadas em destaque. |
| **Timer** | Foco (pomodoro 25/5 configurável), contagem regressiva e cronômetro. Terminar uma sessão de foco rende moedas; pode ser ligado a uma tarefa. O fim fica gravado no banco para o aviso chegar mesmo com o app fechado. |
| **Alarme** | Horário único ou repetido (dias da semana), por lado. Toca e notifica. Tarefa com prazo também pode avisar antes. |
| **Sequência (streak)** | Dias seguidos cumprindo ao menos uma tarefa; dá bônus de moedas em marcos (7, 30 dias…). |
| **Loja de recompensas** | **Própria:** cada lado cadastra recompensas para si e o preço nas suas moedas (ex.: "1 h de jogo"); comprar desconta da carteira e vale na hora. **Para o outro:** cada lado também pode pôr na loja do outro algo que ele mesmo vai cumprir, com o preço nas moedas de quem compra (ex.: "eu faço o jantar" por 20 moedas felinas). Comprar desconta a carteira de quem comprou, e a compra vira um **vale pendente** para quem ofereceu, que marca "cumprido". **(a confirmar)** As moedas gastas somem (não vão para quem ofereceu). |

## Como vai ser montado

Sem build (HTML/CSS/JS puros, bibliotecas só por CDN com versão), como os outros projetos.

- `catdog/index.html`, `catdog/manifest.json` (`start_url` e `scope` `"./"`), `catdog/icons/`, `catdog/css/`, `catdog/js/` (módulos globais, como no Pokémon: `rules.js` com as regras puras, `api.js`, `ui.js`, uma tela por módulo).
- Login: `<script src="../shared/auth.js"></script>` e o app inicia em `SubrosaAuth.onReady(a => …)` (`a.role` → lado).
- Tempo real: canal `catdog_live`; o app recarrega (com debounce) quando o outro lado mexe.
- Fuso: America/Sao_Paulo. Repetições e "hoje" são calculados nesse fuso, no banco, para o celular e o servidor concordarem.

### Banco (prefixo `catdog_`, tudo novo — nada existente é tocado)

- Tabelas: `catdog_tasks`, `catdog_task_parts` (a parte de cada lado, por dia quando repete), `catdog_coin_log` (extrato), `catdog_rewards`, `catdog_alarms`, `catdog_timers`, `catdog_push_subs` (dispositivos que aceitaram notificação, com o lado).
- Leitura pública (como o resto do hub); **escrita só por RPCs** `security definer`. Ações do **lado Cão** exigem o token de mestre; ações do **lado Gato** não têm token (o PIN do jogador é só a porta da frente).
- **Limite honesto:** como o banco é legível com a chave pública, as tarefas "individuais" ficam escondidas só na tela, não no banco. Quem souber mexer na API consegue ler as do outro, e o jogador consegue lançar moedas felinas para si mesmo. O lado Cão está protegido de verdade (token). Para um app a dois isso é aceitável; se um dia quiserem privacidade real é outro desenho.

### Notificação com o app fechado (a parte arriscada)

É a única peça que **não dá para testar no meu navegador**: depende do celular de vocês.

1. **Service worker:** o `sw.js` (um só, na raiz) ganha os tratadores `push` e `notificationclick`. Mudança só de acréscimo; ele continua sem guardar cache.
2. **Inscrição:** o app pede permissão e grava a inscrição do aparelho em `catdog_push_subs` (lado + endpoint + chaves).
3. **Quem dispara:** `pg_cron` roda a cada minuto e chama (via `pg_net`) a Edge Function `catdog-push`, que procura alarmes, fins de timer e prazos que venceram e ainda não foram avisados, envia o Web Push e marca como avisado. As extensões `pg_cron` e `pg_net` existem no projeto, mas **ainda não estão instaladas** (instalar altera o banco → pede OK).
4. **Chaves VAPID:** a pública vai no código; a **privada só nos segredos do Supabase** (`supabase secrets set`), nunca no repositório.
5. **Limites do celular:** no iPhone só funciona com o app **instalado na tela inicial** (iOS 16.4 ou mais novo). No Android/Chrome funciona com o app instalado ou no navegador. Economia de bateria pode atrasar a entrega em alguns segundos ou minutos; o aviso não é garantido como o de um alarme nativo do sistema. Por isso o app também toca e vibra quando está aberto.

## Fases (cada uma = commit + este documento atualizado)

| Fase | Entrega |
|---|---|
| 1 | Base: pasta, PWA, login por lado, visual gato/cão, carteira e extrato, tarefas individuais e compartilhadas (os 3 modos) com valor definido pelo outro lado, lista de afazeres, repetição. **Mais um botão "enviar notificação de teste"** (service worker com `push`, inscrição do aparelho, `catdog-push` mínima, chaves VAPID) para descobrir cedo, nos dois celulares, se o push com o app fechado funciona |
| 2 | Loja de recompensas (própria e para o outro, com vales pendentes), sequência (streak) e marcos |
| 3 | Timers dentro do app: foco (pomodoro), contagem regressiva, cronômetro, ligados a tarefas, com moedas por sessão |
| 4 | Alarmes completos e avisos automáticos: `pg_cron` + `catdog-push` varrendo alarmes, fins de timer e prazos das tarefas. **Teste real nos dois celulares.** |

A Fase 1 já carrega a parte de maior risco (notificação com app fechado) em versão mínima, para a gente saber logo se o celular de vocês aceita; a Fase 4 só liga isso aos alarmes, timers e prazos.

## Como testar sem estragar dados reais

Mesmo método do Pokémon: sessão de mestre temporária em `master_sessions` (token gerado por mim, com OK do usuário), página temporária `catdog/_teste.html` com `SubrosaAuth` simulado, dados de teste com prefixo `ZZ`, tudo apagado pelo nome/token exato no fim e contagens conferidas. A notificação push real só se testa nos celulares.

## Migrations

| Arquivo | O que faz |
|---|---|
| (nenhuma ainda) | |

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-05 | Projeto proposto. Documento de planejamento criado; decisões registradas: lados e moedas, modos da tarefa compartilhada, valor definido pelo outro lado, loja própria e para o outro, notificação testada cedo; nada construído |

## Ideias paradas

Níveis e XP do jogador, conquistas/troféus, desafios entre os dois (quem cumpre mais na semana), moedas que viram presentes entre os lados, tarefas "dadas" de um lado ao outro, estatísticas e gráficos da semana, widgets, modo foco com bloqueio de tela.
