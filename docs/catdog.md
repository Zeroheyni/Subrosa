# Cat & Dog

Aplicativo para **gamificar a produtividade de duas pessoas**: tarefas, lista de afazeres, timers e alarmes. O **jogador** (lado **Gato** 🐱) ganha **moedas felinas** e o **mestre** (lado **Cão** 🐶) ganha **moedas caninas**. Há tarefas só de cada um e tarefas **compartilhadas**.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/catdog/`
- **Pasta:** `catdog/`  ·  **Migrations:** `supabase/catdog/`  ·  **Edge Function:** `supabase/functions/catdog-push/`
- **App instalável (PWA):** sim — nome na tela inicial: **Cat & Dog** (no iPhone a notificação com o app fechado só funciona com o app instalado)
- **Tipo no hub:** `app`
- **Estado:** Fase 1 feita (tarefas, moedas, notificação de teste). Faltam as Fases 2 a 4.

## Decisões do usuário

- Duas pessoas: **mestre = Cão** (PIN de mestre, moedas caninas) e **jogador = Gato** (PIN de jogador, moedas felinas). Usa o login único do hub (`shared/auth.js`), sem tela de escolha.
- Tarefas **individuais** e **compartilhadas**; a compartilhada tem **três modos** (cada um marca a sua parte · qualquer um conclui · só vale com os dois).
- **Quem dá o valor:** o mestre define o valor das tarefas do jogador e o jogador define o valor das tarefas do mestre.
- **Loja:** cada lado tem a própria loja **e** pode pôr na loja do outro recompensas que ele mesmo vai cumprir (Fase 2).
- Alarmes e timers avisam **com o app fechado** (push). A notificação é testada cedo (Fase 1).
- Visual **escuro e bonito**.

## Regras (como o app funciona hoje)

| Conceito | Como funciona |
|---|---|
| **Lado** | `gato` (jogador) ou `cao` (mestre), vem do papel do login. A cor do app muda: Gato violeta/rosa, Cão âmbar/laranja. |
| **Moedas** | Cada lado tem uma carteira. Tudo é um lançamento no **extrato** (`catdog_coin_log`); o saldo é a soma (visão `catdog_wallets`). |
| **Tarefa** | Título, anotação, prazo (data, com ou sem hora) **ou** repetição (todo dia / dias da semana, hora opcional), dificuldade sugerida (fácil/média/difícil, só uma dica para quem vai dar o valor). É **individual** (de um lado) ou **compartilhada**. O dono e o modo não mudam depois de criada. |
| **Valor** | Quem dá o valor da parte do lado X é o **outro** lado (`value_gato` é definido pelo Cão; `value_cao` pelo Gato; 0 a 500 moedas). O app oferece "Definir valor" nos cartões, uma aba **Avaliar** (com contador) e um aviso na tela Hoje. |
| **Pendente** | Concluir antes de ter valor é permitido: as moedas ficam pendentes e entram no extrato quando o valor for definido. Mudar o valor depois ajusta a diferença no extrato. |
| **Modo "cada um a sua parte"** | Cada um ganha o próprio valor ao concluir a sua parte; se os dois concluírem, os dois ganham um **bônus de 50% do próprio valor** (arredondado para cima). |
| **Modo "qualquer um"** | Quem marcar primeiro conclui para os dois e **só quem fez ganha** o próprio valor. Só quem concluiu pode desfazer. |
| **Modo "só vale com os dois"** | Ninguém ganha até os dois concluírem; aí cada um ganha o próprio valor. |
| **Desfazer** | Desmarcar devolve as moedas (lançamento negativo no extrato). Apagar a tarefa **não** tira as moedas já ganhas. |
| **Repetição** | A conclusão vale só para o dia (fuso `America/Sao_Paulo`, calculado no banco). Tarefa semanal não pode ser concluída fora dos seus dias. Prazo só com data vence às 23:59. |
| **Tarefas do outro lado** | Aparecem na aba **Do Cão / Do Gato** (e em Avaliar) porque é o outro quem define o valor. Ou seja, o título das tarefas "individuais" é visível para os dois. |
| **Ajuste do mestre** | O Cão pode somar/tirar moedas de qualquer lado (tela Moedas → Ajustar); fica no extrato como "Ajuste do mestre". |

Telas: **Hoje** (saudação, anel de progresso, as duas carteiras, atrasadas / para hoje / quando der / feitas hoje), **Tarefas** (Minhas · Juntas · Do outro · Avaliar, concluídas recolhidas, detalhe, formulário, definir valor), **Moedas** (saldos, extrato por dia com filtro, ajuste do mestre) e **Ajustes** (perfil, notificações, regras, sair, voltar ao Subrosa).

## Como está montado

Sem build (HTML/CSS/JS puros; só o Supabase por CDN com versão). Módulos globais, como no Pokémon.

| Arquivo | O que faz |
|---|---|
| `catdog/index.html` | Esqueleto: sprite de moedas/carinhas, cabeçalho com carteiras, navegação inferior, scripts |
| `catdog/manifest.json`, `catdog/icons/` | PWA (`start_url` e `scope` `"./"`); ícone = pata violeta→âmbar |
| `catdog/css/app.css` | Todo o visual (tema escuro, vidro, brilhos por lado, folha inferior, animações; respeita `prefers-reduced-motion`) |
| `catdog/js/rules.js` | Regras puras (datas em São Paulo, status da tarefa, grupos de Hoje, valores pendentes). Testável no Node |
| `catdog/js/ui.js` | Escape de HTML, toast, folha/modal, confirmação, ícones, moedas, efeito de moedas voando, contagem animada |
| `catdog/js/api.js` | Supabase: leituras públicas e RPCs (o Cão manda o token; o Gato não) |
| `catdog/js/tasks.js` | Telas Hoje e Tarefas |
| `catdog/js/wallet.js` | Tela Moedas |
| `catdog/js/settings.js` | Tela Ajustes |
| `catdog/js/push.js` | Inscrever o aparelho e mandar a notificação de teste |
| `catdog/js/app.js` | Login (`SubrosaAuth.onReady`), dados, rotas (`#hoje #tarefas[/minhas\|juntas\|outro\|avaliar] #moedas #ajustes`), realtime, virada do dia |
| `sw.js` (raiz) | Ganhou os tratadores `push` e `notificationclick` (só acréscimo; continua sem cache) |
| `supabase/functions/catdog-push/index.ts` | Envia Web Push (hoje só a ação `test`) |

## Banco de dados (prefixo `catdog_`)

- **Tabelas:** `catdog_tasks`, `catdog_completions` (uma linha por tarefa × lado × período), `catdog_coin_log` (extrato), `catdog_push_subs` (aparelhos inscritos; ninguém lê pela API, só a Edge Function). **Visão:** `catdog_wallets`.
- **Funções (RPC, `security definer`):** `catdog_save_task`, `catdog_delete_task`, `catdog_set_value`, `catdog_complete`, `catdog_adjust` (só mestre), `catdog_push_subscribe`, `catdog_push_unsubscribe`, `catdog_today`. Internas (sem acesso público): `catdog_assert_side`, `catdog_period`, `catdog_reconcile` (calcula quanto cada lado deveria ter ganho e lança só a diferença).
- **Quem pode o quê:** leitura pública; escrita só por RPC. Toda ação diz o lado (`p_side`); o lado **cão exige o token de mestre** (`master_sessions`), o **gato não tem token** (o PIN do jogador é só a porta da frente).
- **Realtime:** canal `catdog_live` (tarefas, conclusões, extrato). `localStorage`: ainda nenhuma chave `catdog.`.
- **Edge Function:** `catdog-push` (publicada com `--no-verify-jwt`). Segredos no Supabase: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a privada **nunca** vai para o repositório; a pública está em `catdog/js/push.js`).
- **Limite honesto:** o banco é legível com a chave pública, então as tarefas do outro lado são visíveis para quem souber usar a API, e o jogador consegue lançar moedas felinas para si (as funções do Gato não pedem token). O lado Cão é protegido de verdade.

### Migrations

| Arquivo | O que faz |
|---|---|
| `01_base.sql` | Tarefas, conclusões, extrato, aparelhos de notificação, visão de saldos e todas as funções acima. Testada em transação desfeita (todos os casos de valor, bônus, modos, desfazer, dia da semana, permissões) e aplicada |

## Notificação com o app fechado

Fase 1 entrega a base e o teste: em **Ajustes → Notificações** o aparelho pede permissão, se inscreve (chave VAPID pública) e "Enviar teste" chama a Edge Function, que manda um push para aquele aparelho.

- No **iPhone** só funciona com o app **instalado na tela inicial** (iOS 16.4+); sem isso a tela explica como instalar.
- No Android/Chrome funciona instalado ou no navegador. A entrega não é garantida como a de um alarme do sistema (economia de bateria pode atrasar).
- **Ainda não testado em celular de verdade** (o navegador embutido do Claude bloqueia notificações). O envio em si foi testado: a função carrega `web-push`, cifra a mensagem e tenta entregar (com um aparelho de mentira falha só na rede, como esperado).
- Fases futuras: `pg_cron` + `pg_net` (existem no projeto, **ainda não instaladas**) chamando `catdog-push` a cada minuto para alarmes, fins de timer e prazos.

## Como testar sem estragar dados reais

Sessão de mestre temporária em `master_sessions` (token gerado por mim, com OK do usuário), página temporária `catdog/_teste.html` (cópia do `index.html` com `SubrosaAuth` simulado; papel e token em `sessionStorage.cdRole`/`cdToken`), tarefas de teste com prefixo `ZZ`, tudo apagado pelo nome/token exato no fim (primeiro as linhas do extrato ligadas às tarefas, depois as tarefas) e contagens conferidas. A notificação push real só se testa nos celulares.

## Fases

| Fase | Entrega |
|---|---|
| 1 ✅ | Base, login por lado, visual, carteira e extrato, tarefas individuais e compartilhadas (3 modos) com valor dado pelo outro lado, repetição, notificação de teste |
| 2 | Loja de recompensas (própria e para o outro, com vales pendentes), sequência (streak) e marcos |
| 3 | Timers dentro do app: foco (pomodoro), contagem regressiva, cronômetro, ligados a tarefas, com moedas por sessão |
| 4 | Alarmes completos e avisos automáticos (`pg_cron` + `catdog-push`) para alarmes, fim de timer e prazos |

Pontos a confirmar com o usuário: no modo "qualquer um" só quem fez ganha; o bônus de 50% do modo "cada um a sua parte"; nas compartilhadas cada lado define o valor da parte do outro; as moedas gastas na loja somem (não vão para quem ofereceu).

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-05 | Projeto proposto e planejado (este documento); decisões registradas |
| 2026-11-05 | **Fase 1.** Migration `01_base.sql` (testada e aplicada), Edge Function `catdog-push` e chaves VAPID (segredos no Supabase), `sw.js` com push, app completo (Hoje, Tarefas, Moedas, Ajustes) em tema escuro, ícones, entrada no hub. Testado como Cão e como Gato, no PC e na largura de celular; dados de teste e sessão temporária apagados |

## Ideias paradas

Checklist de subitens dentro da tarefa (saiu da Fase 1 por causa das tarefas repetidas), níveis e XP, conquistas/troféus, desafios entre os dois, moedas que viram presentes, estatísticas e gráficos da semana, widgets, modo foco com bloqueio de tela, o outro lado confirmar a conclusão de uma tarefa.
