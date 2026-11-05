# Cat & Dog

Aplicativo para **gamificar a produtividade de duas pessoas**: tarefas, lista de afazeres, timers e alarmes. O **jogador é o Cão** 🐶 e ganha **moedas felinas**; o **mestre é o Gato** 🐱 e ganha **moedas caninas** (cada um ganha a moeda do outro bicho). Há tarefas só de cada um e tarefas **compartilhadas**.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/catdog/`
- **Pasta:** `catdog/`  ·  **Migrations:** `supabase/catdog/`  ·  **Edge Function:** `supabase/functions/catdog-push/`
- **App instalável (PWA):** sim — nome na tela inicial: **Cat & Dog** (no iPhone a notificação com o app fechado só funciona com o app instalado)
- **Tipo no hub:** `app`
- **Estado:** Fases 1 a 4 feitas (tarefas, moedas, loja, vales, sequência, timers, alarmes e avisos automáticos com o app fechado). Cada lado usa o **próprio fuso** (jogador em Portugal, mestre em Brasília), com virada do dia ajustável. A notificação com o app fechado **foi testada nos dois celulares e funcionou**.

## ⚠️ Quem é quem (leia antes de mexer no código ou no banco)

O usuário corrigiu em 2026-11-05: **o JOGADOR é o CÃO e o MESTRE é o GATO** (a primeira versão do app tinha isso ao contrário). Para não migrar o banco, **as chaves internas guardam o LADO (cor + moeda), não o bicho**:

| Chave no banco/código | Quem é | Bicho (nome e carinha) | Moeda que ganha | Cor | Login |
|---|---|---|---|---|---|
| `gato` | **Jogador** | **Cão** 🐶 | moedas **felinas** | violeta/rosa | PIN de jogador, **sem token** |
| `cao` | **Mestre** | **Gato** 🐱 | moedas **caninas** | âmbar/laranja | PIN de mestre, **exige token** |

Ou seja: a chave `gato` é "o lado das moedas felinas" (o jogador, que é o Cão). Os nomes que aparecem na tela vêm de `CD_RULES.SIDES[chave].label`; as carinhas, de `UI.face(chave)` (símbolos `face-gato` = cão violeta e `face-cao` = gato âmbar em `catdog/index.html`). Nunca escreva "Gato"/"Cão" na mão no código: use `name(side)`.

## Decisões do usuário

- Duas pessoas: **mestre = Gato** (PIN de mestre, moedas caninas) e **jogador = Cão** (PIN de jogador, moedas felinas). Usa o login único do hub (`shared/auth.js`), sem tela de escolha.
- Tarefas **individuais** e **compartilhadas**; a compartilhada tem **três modos** (cada um marca a sua parte · qualquer um conclui · só vale com os dois).
- **Quem dá o valor:** o mestre define o valor das tarefas do jogador e o jogador define o valor das tarefas do mestre.
- **Loja:** cada lado tem a própria loja **e** pode pôr na loja do outro recompensas que ele mesmo vai cumprir.
- Alarmes e timers avisam **com o app fechado** (push). A notificação é testada cedo (Fase 1).
- **Horário:** o mestre mora no Brasil (**Brasília**) e o jogador em **Portugal**. Cada um usa o próprio relógio; o prazo de uma tarefa vale, por padrão, **na hora de quem faz**, e o formulário mostra a mesma hora no outro lugar. Tarefas **compartilhadas repetidas viram o dia à meia-noite de Brasília**. Cada um escolhe em Ajustes a **hora em que o seu dia vira** (o mestre costuma dormir às 5–6 da manhã).
- Visual **escuro e bonito**.

## Regras (como o app funciona hoje)

| Conceito | Como funciona |
|---|---|
| **Lado** | Vem do papel do login (ver a tabela acima). A cor do app muda: o jogador vê violeta/rosa, o mestre vê âmbar/laranja. |
| **Moedas** | Cada lado tem uma carteira. Tudo é um lançamento no **extrato** (`catdog_coin_log`); o saldo é a soma (visão `catdog_wallets`). |
| **Tarefa** | Título, anotação, prazo (data, com ou sem hora) **ou** repetição (todo dia / dias da semana, hora opcional), dificuldade sugerida (fácil/média/difícil, só uma dica para quem vai dar o valor). É **individual** (de um lado) ou **compartilhada**. O dono e o modo não mudam depois de criada. |
| **Valor** | Quem dá o valor da parte do lado X é o **outro** lado (`value_gato`, a parte do jogador, é definido pelo mestre; `value_cao`, a parte do mestre, pelo jogador; 0 a 500 moedas). O app oferece "Definir valor" nos cartões, uma aba **Avaliar** (com contador) e um aviso na tela Hoje. |
| **Pendente** | Concluir antes de ter valor é permitido: as moedas ficam pendentes e entram no extrato quando o valor for definido. Mudar o valor depois ajusta a diferença no extrato. |
| **Modo "cada um a sua parte"** | Cada um ganha o próprio valor ao concluir a sua parte; se os dois concluírem, os dois ganham um **bônus de 50% do próprio valor** (arredondado para cima). |
| **Modo "qualquer um"** | Quem marcar primeiro conclui para os dois e **só quem fez ganha** o próprio valor. Só quem concluiu pode desfazer. |
| **Modo "só vale com os dois"** | Ninguém ganha até os dois concluírem; aí cada um ganha o próprio valor. |
| **Desfazer** | Desmarcar devolve as moedas (lançamento negativo no extrato). Apagar a tarefa **não** tira as moedas já ganhas. |
| **Repetição** | A conclusão vale só para o dia (veja **Horário e fusos**, calculado no banco). Tarefa semanal não pode ser concluída fora dos seus dias. Prazo só com data vence às 23:59 do relógio de quem faz a tarefa. |
| **Tarefas do outro lado** | Aparecem na aba **Do Gato / Do Cão** (e em Avaliar) porque é o outro quem define o valor. Ou seja, o título das tarefas "individuais" é visível para os dois. |
| **Loja — recompensa própria** | Quem cria define título, detalhes, preço (nas **próprias** moedas) e se é "só uma vez". Comprar desconta na hora e já vale (fica no histórico como cumprido). Não dá para comprar sem saldo (o botão mostra "Faltam N"; o banco também recusa). |
| **Loja — presente para o outro** | Quem cria promete cumprir; o preço é nas moedas de **quem compra**. Comprar desconta o saldo do comprador e gera um **vale pendente** para quem ofereceu, que marca **Cumprido** ou **Devolver** (devolve as moedas ao comprador; uma recompensa "só uma vez" volta à loja). As moedas gastas **somem** (não vão para quem ofereceu). |
| **Sequência (streak)** | Dias seguidos (o dia do próprio lado, veja **Horário e fusos**) em que o lado concluiu ao menos uma tarefa **ou uma sessão de foco**. Continua viva se o último dia foi hoje ou ontem. Marcos pagam bônus **uma vez por sequência** ao próprio lado: 3 dias +3, 7 dias +10, 14 dias +20, 30 dias +50, 60 dias +100, 100 dias +200 (valores fixos do app). Desfazer a única conclusão do dia tira o dia da sequência, mas o bônus já pago fica. Apagar tarefas **não** quebra a sequência (os dias ficam em `catdog_activity`). |
| **Timers** | **Foco** (pomodoro: 5 a 180 min, padrão 25; pausa de 5 min e pausa longa de 15 min depois de cada 4ª sessão do dia, configuráveis neste aparelho), **contagem regressiva** (1 s a 24 h) e **cronômetro**. Cada lado tem no máximo **um timer ativo**; dá para pausar, retomar e cancelar. O estado fica no banco, então fechar o app não perde nada; ao terminar com o app aberto toca um som, vibra e mostra o resultado. Foco pode ser ligado a uma tarefa (e oferece "concluir a tarefa" no fim). Enquanto um lado está em foco, o outro vê "X está em foco" na tela Hoje. |
| **Moedas do foco** | Sessão de foco **concluída** (o servidor confere o tempo) com **15 min ou mais** vale `focus_value` moedas do **próprio** lado (padrão 2), **até 8 sessões pagas por dia**. O valor de cada lado é definido pelo **outro** lado (Ajustes → Moedas de foco, 0 a 50). Foco cancelado, curto, pausa, contagem e cronômetro não rendem. |
| **Alarmes** | Cada lado cria os **seus** alarmes (horário, nome opcional): **uma vez**, **todo dia** ou **dias da semana**; liga/desliga, edita e apaga (até 30 por lado). Alarme de uma vez sem data toca hoje (se a hora ainda não passou) ou amanhã, e **desliga sozinho** depois de tocar. Com o app aberto aparece uma tela de alarme com som e vibração (**Parar** ou **Soneca de 5 min**, que cria um alarme de uma vez); com o app fechado chega a notificação. Cartão "Próximo alarme" na tela Hoje. |
| **Avisos automáticos** | Um agendador no banco confere a cada 10 s e manda notificação para o aparelho **do lado certo** quando: toca um **alarme**; **acaba um timer** (foco, pausa, contagem); chega o **prazo de uma tarefa com horário** (aviso **15 min antes** e **na hora**, só se ainda não foi concluída por aquele lado; vale para prazo com hora e para repetição com hora); alguém **compra um presente** seu (aviso "Vale pedido" para quem vai cumprir). Cada aviso só vale numa janela de 10 min depois da hora (não manda coisa velha) e **nunca repete** (tabela `catdog_notified`). Tarefa criada ou editada já dentro da janela não avisa o que ficou para trás. |
| **Horário e fusos** | **Jogador = Portugal** (`Europe/Lisbon`), **mestre = Brasília** (`America/Sao_Paulo`); o horário de verão é automático (hoje 3 h de diferença, no verão português 4 h). <br>• **Dia de cada um:** vira à meia-noite do fuso do lado **mais a "virada do dia"** escolhida em Ajustes (0 a 12 h, de 30 em 30 min; ex.: 06:00 para quem dorme de manhã). Vale para o "Hoje", tarefas repetidas só do lado, sequência e limite diário do foco. <br>• **Tarefas compartilhadas repetidas** viram o dia à **meia-noite de Brasília** (03h/04h em Portugal), para os dois terem o mesmo dia. <br>• **Prazo com hora** é um instante único: por padrão vale na hora de quem faz (compartilhada: de quem criou); o formulário tem a escolha "Hora de Portugal / Hora de Brasília" e mostra a mesma hora no outro lugar (com "dia seguinte/anterior" se mudar o dia). Cada tela mostra a hora local de quem olha; na tarefa do outro lado aparece também a hora dele ("15:00 (18:00 em Portugal)"). Prazo só com data ("o dia todo") fica no dia de quem criou. <br>• **Tarefa repetida com hora** vale no relógio de cada lado (uma hora antes da virada do dia conta como fim do dia anterior). <br>• **Alarmes** tocam no relógio de quem os criou. |
| **Relógio da tela Hoje** | Cartão logo abaixo do cumprimento: **mostrador analógico** (ponteiros de hora, minuto e segundo) com o **relógio digital no meio**. Quando você tem um **timer rodando** (foco, pausa, contagem ou cronômetro), um **aro se forma ao redor** do relógio como barra de progresso (cresce de 0 a 100%; no cronômetro dá uma volta por minuto), o centro mostra o tempo do timer e tocar no relógio abre a aba Tempo. Timer pausado deixa o aro apagado e a pausa fica verde. O botão **"Ver Brasília / Ver Portugal"** troca entre a hora do seu país e a do outro (a cor do cartão muda para a do outro lado e aparece a diferença de horas e a data de lá). Em **Ajustes → Horário** dá para escolher **24 horas ou 12 horas (AM/PM)**; vale só neste aparelho (`localStorage` `catdog.clock24`) e só para o relógio (alarmes e prazos continuam em 24 h). |
| **Ajuste do mestre** | O mestre pode somar/tirar moedas de qualquer lado (tela Moedas → Ajustar); fica no extrato como "Ajuste do mestre". |

Telas (navegação inferior): **Hoje** (saudação, anel de progresso, as duas carteiras, cartão da sequência com chama, aviso de foco do outro, próximo alarme, atrasadas / para hoje / quando der / feitas hoje), **Tarefas** (Minhas · Juntas · Do outro · Avaliar, concluídas recolhidas, detalhe, formulário, definir valor), **Tempo** (Foco · Contagem · Cronômetro · Alarmes, relógio em anel, resultado), **Loja** (Comprar · Minhas ofertas · Vales) e **Ajustes** (perfil, moedas de foco, notificações, regras, sair). A tela **Moedas** (saldos, extrato por dia com filtro, ajuste do mestre) abre pelos selos de moedas no cabeçalho e pelos cartões da tela Hoje.

## Como está montado

Sem build (HTML/CSS/JS puros; só o Supabase por CDN com versão). Módulos globais, como no Pokémon.

| Arquivo | O que faz |
|---|---|
| `catdog/index.html` | Esqueleto: sprite de moedas/carinhas, cabeçalho com carteiras, navegação inferior, scripts |
| `catdog/manifest.json`, `catdog/icons/` | PWA (`start_url` e `scope` `"./"`); ícone = pata violeta→âmbar |
| `catdog/css/app.css` | Todo o visual (tema escuro, vidro, brilhos por lado, folha inferior, relógio, animações; respeita `prefers-reduced-motion`) |
| `catdog/js/rules.js` | Regras puras (lados e nomes, datas e horas por fuso com virada do dia, status da tarefa, grupos de Hoje, valores pendentes, marcos da sequência, loja). Testável no Node |
| `catdog/js/ui.js` | Escape de HTML, toast, folha/modal, confirmação, ícones, moedas, carinhas, efeito de moedas voando, contagem animada |
| `catdog/js/api.js` | Supabase: leituras públicas e RPCs (o mestre manda o token; o jogador não) |
| `catdog/js/tasks.js` | Telas Hoje e Tarefas |
| `catdog/js/tempo.js` | Tela Tempo (timers; corrige o relógio do aparelho com a hora do servidor; conclui sozinho quando acaba, mesmo fora da tela) |
| `catdog/js/alarms.js` | Alarmes (lista, formulário, tela de alarme tocando com Parar/Soneca, "próximo alarme"); o app aberto também confere os próprios alarmes e mostra os avisos que o service worker repassa |
| `catdog/js/clock.js` | Relógio da tela Hoje (mostrador analógico + digital no meio, aro do timer, troca de país, 12/24 h). Lê o timer ativo por `Tempo.progress()` |
| `catdog/js/shop.js` | Tela Loja (comprar, ofertas, vales, formulário de recompensa) |
| `catdog/js/wallet.js` | Tela Moedas |
| `catdog/js/settings.js` | Tela Ajustes |
| `catdog/js/push.js` | Inscrever o aparelho e mandar a notificação de teste |
| `catdog/js/app.js` | Login (`SubrosaAuth.onReady`), dados, rotas (`#hoje #tarefas[/minhas\|juntas\|outro\|avaliar] #tempo[/foco\|contagem\|cronometro\|alarmes] #loja[/comprar\|ofertas\|vales] #moedas #ajustes`), realtime, virada do dia |
| `sw.js` (raiz) | Ganhou os tratadores `push` e `notificationclick` (só acréscimo; continua sem cache). Ao receber um push, além de mostrar a notificação, repassa o aviso às páginas abertas (`postMessage`) para o app tocar o alarme na tela |
| `supabase/functions/catdog-push/index.ts` | Envia Web Push: ação `test` (teste do aparelho) e ação `scan` (reserva o que está na hora de avisar com `catdog_claim_due()` e manda para os aparelhos do lado certo) |

## Banco de dados (prefixo `catdog_`)

- **Tabelas:** `catdog_tasks`, `catdog_completions` (uma linha por tarefa × lado × período), `catdog_coin_log` (extrato; tipos `task`, `adjust`, `reward`, `refund`, `streak`, `focus`; coluna `ref` única por lado para pagar cada marco só uma vez), `catdog_push_subs` (aparelhos inscritos; ninguém lê pela API, só a Edge Function), `catdog_rewards`, `catdog_purchases` (compras/vales: pendente, cumprido, devolvido), `catdog_activity` (dias de atividade de cada lado, base da sequência), `catdog_timers` (cada linha é uma fase: foco, pausa, contagem ou cronômetro; um ativo por lado), `catdog_settings` (valor do foco e virada do dia de cada lado), `catdog_alarms` (alarmes de cada lado), `catdog_notified` (chaves do que já foi avisado; ninguém lê pela API). **Visão:** `catdog_wallets`.
- **Funções (RPC, `security definer`):** tarefas `catdog_save_task`, `catdog_delete_task`, `catdog_set_value`, `catdog_complete`; moedas `catdog_adjust` (só mestre); notificações `catdog_push_subscribe`, `catdog_push_unsubscribe`; loja `catdog_save_reward`, `catdog_delete_reward`, `catdog_buy_reward` (trava a carteira), `catdog_fulfill_purchase`, `catdog_refund_purchase`; sequência `catdog_streaks`; tempo `catdog_now`, `catdog_timer_start`, `catdog_timer_pause`, `catdog_timer_resume`, `catdog_timer_cancel`, `catdog_timer_finish` (o servidor confere se o tempo acabou e paga o foco), `catdog_set_focus_value`; alarmes `catdog_save_alarm`, `catdog_toggle_alarm`, `catdog_delete_alarm`; `catdog_set_day_start` (virada do dia do próprio lado); mais `catdog_today`. Internas (sem acesso público): `catdog_assert_side`, `catdog_period`, `catdog_milestone_bonus`, `catdog_streak_of`, `catdog_streak_touch`, `catdog_streak_untouch`, `catdog_timer_elapsed`, `catdog_next_date(lado, hora)`, `catdog_tz` (fuso do lado), `catdog_day_at` / `catdog_day` (dia do lado, com a virada), `catdog_task_day` (dia de uma tarefa; `catdog_today()` continua sendo o dia de Brasília), `catdog_due_items` (lista o que está na hora de avisar), `catdog_claim_due` (só a Edge Function com a chave de serviço; reserva e devolve só o que ainda não foi avisado), `catdog_ping` (chamada pelo agendador), `catdog_reconcile` (calcula quanto cada lado deveria ter ganho e lança só a diferença).
- **Quem pode o quê:** leitura pública; escrita só por RPC. Toda ação diz o lado (`p_side`); o lado **`cao` (mestre) exige o token de mestre** (`master_sessions`), o lado **`gato` (jogador) não tem token** (o PIN do jogador é só a porta da frente).
- **Realtime:** canal `catdog_live` (tarefas, conclusões, extrato, recompensas, compras, timers, ajustes, alarmes). `localStorage`: `catdog.pomodoro` (durações do foco e das pausas deste aparelho), `catdog.rung` (alarmes/avisos que já tocaram neste aparelho, para não tocar duas vezes).
- **Agendador:** extensões `pg_cron` e `pg_net` instaladas (Fase 4). Tarefa agendada `catdog-ping` a cada **10 segundos** roda `catdog_ping()`, que só chama a Edge Function (`action: scan`) quando existe algo novo para avisar, então a maior parte das execuções não faz nada. Para **desligar** os avisos automáticos: `select cron.unschedule('catdog-ping');` (religar: reexecutar `05_cron.sql`).
- **Edge Function:** `catdog-push` (publicada com `--no-verify-jwt`). Segredos no Supabase: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a privada **nunca** vai para o repositório; a pública está em `catdog/js/push.js`).
- **Limite honesto:** o banco é legível com a chave pública, então as tarefas do outro lado são visíveis para quem souber usar a API, e o jogador consegue lançar moedas felinas para si (as funções do jogador não pedem token). O lado do mestre é protegido de verdade.

### Migrations

| Arquivo | O que faz |
|---|---|
| `01_base.sql` | Tarefas, conclusões, extrato, aparelhos de notificação, visão de saldos e as funções de tarefa e moeda. Testada em transação desfeita (valor, bônus, modos, desfazer, dia da semana, permissões) e aplicada |
| `02_shop_streak.sql` | Loja (recompensas, compras e vales), dias de atividade e sequência com marcos; amplia o extrato (`streak`, `ref`) e recria `catdog_complete`. Testada em transação desfeita e aplicada |
| `03_timers.sql` | Timers (foco, pausa, contagem, cronômetro), valor do foco por lado, tipo `focus` no extrato; foco concluído conta para a sequência. Testada em transação desfeita (um ativo por lado, pausar/retomar, concluir cedo falha, pagamento, valor definido pelo outro, foco curto e pausa sem moedas, limite de 8 pagas por dia, cronômetro, cancelar, validações) e aplicada |
| `04_alarms_push.sql` | Alarmes, lista do que avisar (alarmes, fim de timer, prazos 15 min antes e na hora, vales), reserva sem repetição e `catdog_ping`. Testada em transação desfeita (salvar/validar/ligar/apagar, só mexe nos alarmes do próprio lado, janela de 10 min, alarme editado depois da hora não toca, dias da semana, alarme de uma vez desliga ao tocar, timer ainda correndo ou concluído não avisa, prazo por lado, conclusão do outro modo "qualquer um", prazo 23:59 sem hora ignorado, tarefa repetida com hora, vale próprio não avisa, reservar de novo não repete) e aplicada. Corrigido depois do primeiro teste real: a API do Supabase recusa `DELETE` sem `WHERE` |
| `06_timezones.sql` | Fuso por lado: coluna `catdog_settings.day_start_min`, funções `catdog_tz`/`catdog_day_at`/`catdog_day`/`catdog_task_day`/`catdog_set_day_start` e troca (create or replace) de `catdog_complete`, `catdog_streak_of/touch/untouch`, `catdog_timer_finish`, `catdog_next_date(lado, hora)`, `catdog_save_alarm`, `catdog_toggle_alarm` e `catdog_due_items`. Nenhuma tabela ou dado apagado. Testada em transação desfeita (fusos no inverno e no verão, virada do dia, token errado e faixa inválida, alarme de cada lado no seu relógio, prazos e tarefa repetida por lado, período próprio × dia comum, desfazer conclusão, tarefa semanal, foco concluído, sequência) e aplicada |
| `05_cron.sql` | Instala `pg_net` e `pg_cron` e agenda `catdog-ping` (10 s). Testado de ponta a ponta: alarme de teste do lado do mestre foi reservado pelo agendador, a função respondeu 200 e o alarme de uma vez desligou sozinho |

## Notificação com o app fechado

Em **Ajustes → Notificações** o aparelho pede permissão, se inscreve (chave VAPID pública) e "Enviar teste" chama a Edge Function, que manda um push para aquele aparelho.

- No **iPhone** só funciona com o app **instalado na tela inicial** (iOS 16.4+); sem isso a tela explica como instalar.
- No Android/Chrome funciona instalado ou no navegador. A entrega não é garantida como a de um alarme do sistema (economia de bateria pode atrasar).
- **Testado em celular de verdade (2026-11-05):** iPhone do jogador (app instalado na tela inicial) e Android/Chrome do mestre receberam o teste e o alarme com o app fechado. O envio passa por: agendador → `catdog_ping` → função `scan` → Apple/Google. (O navegador embutido do Claude bloqueia notificações, então o teste real só vale em celular.)
- **Avisos automáticos (Fase 4):** ver "Avisos automáticos" nas regras. O agendador pode atrasar até ~10 s mais o tempo de entrega do serviço de push (Android/iOS podem demorar mais por economia de bateria).
- **Foco com o app fechado:** a notificação avisa que acabou, mas **as moedas só entram quando o app é aberto** (quem confirma o fim é o app chamando `catdog_timer_finish`; o servidor confere o tempo).
- **Duplicidade:** com o app aberto, o aviso chega pela notificação do sistema **e** pela tela de alarme; a chave do aviso (`alarm:<id>:<dia>`) evita tocar duas vezes.
- Sem aparelho inscrito para o lado, o aviso é reservado e se perde (não fica acumulando).

## Como testar sem estragar dados reais

Sessão de mestre temporária em `master_sessions` (token gerado por mim, com OK do usuário), página temporária `catdog/_teste.html` (cópia do `index.html` com `SubrosaAuth` simulado; papel e token em `sessionStorage.cdRole`/`cdToken`, `player` ou `master`), dados de teste com prefixo `ZZ`, tudo apagado pelo nome/token exato no fim (primeiro o extrato ligado às tarefas, depois as tarefas; timers pelo nome; restaurar `catdog_settings` para 2) e contagens conferidas. Antes de apagar, conferir que não há dado real. A notificação push real só se testa nos celulares. Concluir um foco de verdade leva 5+ minutos; o pagamento foi testado no SQL simulando o tempo.

## Fases

| Fase | Entrega |
|---|---|
| 1 ✅ | Base, login por lado, visual, carteira e extrato, tarefas individuais e compartilhadas (3 modos) com valor dado pelo outro lado, repetição, notificação de teste |
| 2 ✅ | Loja de recompensas (própria e para o outro, com vales pendentes), sequência (streak) e marcos |
| 3 ✅ | Timers dentro do app: foco (pomodoro), contagem regressiva, cronômetro, ligados a tarefas, com moedas por sessão de foco |
| 4 ✅ | Alarmes completos (uma vez, todo dia, dias da semana, soneca) e avisos automáticos (`pg_cron` + `catdog-push`) para alarmes, fim de timer, prazos de tarefa (15 min antes e na hora) e vales comprados |

Pontos a confirmar com o usuário: no modo "qualquer um" só quem fez ganha; o bônus de 50% do modo "cada um a sua parte"; nas compartilhadas cada lado define o valor da parte do outro; as moedas gastas na loja somem (não vão para quem ofereceu); os valores dos marcos da sequência (3/7/14/30/60/100 dias → 3/10/20/50/100/200 moedas); regra do foco (2 moedas por sessão de 15+ min, até 8 por dia, valor definido pelo outro lado, foco conta para a sequência); avisos de prazo (15 min antes e na hora, só tarefas com horário); alarmes só do próprio lado (um não cria alarme para o outro); soneca de 5 min.

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-05 | Projeto proposto e planejado (este documento); decisões registradas |
| 2026-11-05 | **Fase 1.** Migration `01_base.sql` (testada e aplicada), Edge Function `catdog-push` e chaves VAPID (segredos no Supabase), `sw.js` com push, app completo (Hoje, Tarefas, Moedas, Ajustes) em tema escuro, ícones, entrada no hub |
| 2026-11-05 | **Fase 2.** Migration `02_shop_streak.sql` (testada e aplicada): loja com recompensas próprias e presentes para o outro, vales (cumprir ou devolver as moedas), compra sem saldo bloqueada, sequência de dias com marcos e bônus, cartão da chama na tela Hoje, aba Loja com contador de vales |
| 2026-11-05 | **Correção de identidade:** o jogador é o Cão e o mestre é o Gato (estava ao contrário). Só nomes, carinhas e textos mudaram; as chaves do banco continuam (ver a seção "Quem é quem"). Edge Function republicada com o texto de teste certo |
| 2026-11-05 | **Fase 3.** Migration `03_timers.sql` (testada e aplicada): foco/pausa/contagem/cronômetro no banco, relógio em anel na tela Tempo (nova aba, no lugar de Moedas na barra), moedas de foco com valor definido pelo outro lado (Ajustes), presença "está em foco" na tela Hoje. Testado como jogador e como mestre (celular); dados de teste, sessão temporária e valores de foco restaurados |
| 2026-11-05 | **Fase 4.** Migrations `04_alarms_push.sql` e `05_cron.sql` (testadas e aplicadas, com OK do usuário para instalar `pg_cron`/`pg_net` e agendar), Edge Function `catdog-push` republicada com a ação `scan`, aba **Alarmes** em Tempo, tela de alarme com Parar/Soneca, cartão "Próximo alarme" na tela Hoje, `sw.js` repassa o push às páginas abertas. Testado de ponta a ponta no banco e como jogador no celular (criar, ligar/desligar, editar, apagar, tela tocando, soneca); alarmes e avisos de teste apagados |
| 2026-11-05 | **Fuso horário por lado.** Tag `antes-fuso` no git. Migration `06_timezones.sql` (testada e aplicada, com OK do usuário), jogador em Portugal e mestre em Brasília, virada do dia por lado em Ajustes (cartão Horário com os dois relógios), dia comum de Brasília nas compartilhadas repetidas, prazo na hora de quem faz com dica da hora no outro lugar no formulário, alarmes e soneca no relógio de quem os criou. Testado no banco e no navegador (jogador e mestre); dados de teste apagados. **Atenção:** tarefas antigas continuam no mesmo instante; "Continuar o livro" (do jogador) foi criada com a hora de Brasília e agora aparece como 12:00 para ele |
| 2026-11-05 | **Relógio da tela Hoje.** Novo `catdog/js/clock.js` + estilos; `Tempo.progress()`; opção 12/24 h em Ajustes. Testado no celular emulado e no desktop (hora de Portugal e de Brasília, 12 h, aro com timer simulado só na tela, abrir o timer pelo relógio). Nenhuma mudança no banco |

## Ideias paradas

Congelar a sequência (dia de folga), avisar o outro quando um vale for cumprido ou devolvido, avisar quando o outro conclui uma tarefa compartilhada, alarme de um lado para o outro, som de alarme escolhido, recompensas com quantidade/estoque, checklist de subitens dentro da tarefa (saiu da Fase 1 por causa das tarefas repetidas), níveis e XP, conquistas/troféus, desafios entre os dois, moedas que viram presentes, estatísticas e gráficos da semana, widgets, modo foco com bloqueio de tela, o outro lado confirmar a conclusão de uma tarefa, voltas (laps) no cronômetro, histórico de sessões de foco por semana.
