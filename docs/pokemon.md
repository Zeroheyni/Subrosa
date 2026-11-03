# Pokémon

Gestor do RPG de Pokémon do mestre: fichas de treinadores, time e box de criaturas, bolsa, e (mais pra frente) controle de combate. Funciona para dois lados: o **mestre** (controla tudo) e o **jogador** (vê a própria ficha e mexe só no que é dele).

> O universo e as criaturas do RPG são **originais**; Pokémon é só inspiração mecânica. O visual do app é inspirado em Pokémon (Pokédex, Bolsa, barras de HP) em tema escuro.

- **Endereço:** `https://zeroheyni.github.io/Subrosa/pokemon/`
- **Pasta:** `pokemon/`  ·  **Migrations:** `supabase/pokemon/`
- **App instalável (PWA):** sim, com manifest próprio (`pokemon/manifest.json`). Nome na tela inicial: **Pokémon**.
- **Tipo no hub:** `rpg`
- **Jogadores:** um único jogador (mais NPCs criados pelo mestre). Login: PIN do hub (`shared/auth.js`).
- **Regras de origem:** dois PDFs que o usuário escreveu (Guia do sistema de RPG e Ficha do treinador). Este documento guarda o resumo das regras que o app implementa.

## Como está montado

Sem build: HTML/CSS/JS puros, vários arquivos pequenos carregados por `<script src>`.

| Arquivo | O que faz |
|---|---|
| `pokemon/index.html` | página: cabeçalho estilo Pokédex, navegação, carrega os scripts |
| `pokemon/css/app.css` | todo o visual (tema escuro, responsivo: barra de abas embaixo no celular, em cima no PC) |
| `pokemon/js/rules.js` | **regras do jogo como funções puras** (HP do treinador, XP, pontos…). Nada de tela aqui |
| `pokemon/js/api.js` | cliente Supabase, RPCs, upload de imagem |
| `pokemon/js/ui.js` | ajudantes de tela: modal, confirmação, toast, escape de HTML |
| `pokemon/js/cropper.js` | **enquadrador de foto** estilo Discord (arrastar, zoom, recorte) |
| `pokemon/js/trainers.js` | lista de treinadores e a ficha |
| `pokemon/js/app.js` | inicialização, abas, rotas (`#treinadores`, `#treinador/<id>`), tempo real |

### Fotos e enquadramento

Toda foto (treinador agora; criaturas depois) guarda **três coisas**: o recorte pronto que aparece na tela (`image_url`, quadrado 512 px), a imagem original reduzida (`image_src_url`, até 1600 px) e o enquadramento (`image_frame` = `{zoom, cx, cy}`, centro normalizado). Assim dá para **reenquadrar depois** sem enviar a foto de novo. O Storage não deixa a chave pública apagar, então fotos trocadas ficam órfãs no bucket (limite conhecido, igual ao Levina).

## Regras do sistema (resumo do guia)

**Treinador**
- Atributos de RP: Carisma, Aparência, Resistência, Mental, Físico. Começam em 0; **10 pontos** na criação e **+2 por nível**.
- HP máximo = **30 + Físico**. Em 0 HP desmaia.
- Nível começa em 1, sem limite. XP para o próximo nível = **nível × 10**; o excedente é mantido.
- Recebe **50% do XP total** ganho pelos seus Pokémon (sem tirar deles; frações em meios pontos).
- Leva **até 3 criaturas**; as outras ficam no PC.

**Criaturas** (fases seguintes)
- 9 atributos: Vitalidade (HP), Força, Destreza, Defesa Física, Defesa Especial, Velocidade, Evasão, Percepção, Precisão. Até 3 tipos por espécie. Nível 1 a 100.
- Atributo final = `arredondar(B(nível) × Potencial ÷ 5 × M(IV))`. Potencial 1 a 10 por atributo (definido pelo mestre na espécie); IV sorteado 1 a 20 por atributo; `B(nível)` interpolada entre 1→15, 10→30, 20→50, 30→75, 40→100, 50→150, 60→300, 70→400, 80→500, 90→750, 100→1000.
- `M(IV) = 0,5 + (IV−1)/18` para IV ≤ 10 e `1 + (IV−10)/20` para IV ≥ 10.
- XP para o próximo nível = nível × 10. Derrotar uma criatura dá XP igual ao nível dela; todas que participaram recebem o XP inteiro.

**Combate** (fase final)
- 5 PA por turno; ordem por Velocidade (empate: cara ou coroa). PA não gasto vira cura: 4% da HP máx por PA, até 20% por turno.
- Movimento por ação: `mín(20, máx(5, 5 + piso(Vel ÷ 200)))` blocos. Acerto: `d20 + Precisão` contra `d20 + Evasão` (empate favorece o atacante). Percepção: bônus de `piso(Percepção ÷ 150)` no d20, máx +20.
- Dano: `Poder bruto = Poder × Ataque ÷ 200`; `Dano = bruto × Ataque ÷ (Ataque + Defesa)`; depois o multiplicador de tipo; mínimo 1 (exceto imunidade).
- 23 tipos; multiplicadores se combinam (regras especiais de 3 resistências e de imunidade + vantagem). Troca voluntária custa os 5 PA de quem sai.

## Banco de dados

- **Tabelas** (prefixo `pkm_`): `pkm_trainers`
- **Funções/RPCs:** `pkm_assert_master`, `pkm_save_trainer`, `pkm_trainer_add_xp`, `pkm_trainer_hp`, `pkm_delete_trainer` (as de mestre exigem o token); `pkm_trainer_set_notes`, `pkm_trainer_set_photo` (qualquer um, são o que o jogador pode mexer)
- **Storage:** bucket público `pokemon-images` (5 MB; png/jpeg/webp). Pastas: `trainers/`
- **Tempo real:** `pkm_trainers` está na publicação do Realtime; o app recarrega ao vivo
- **Chaves do navegador:** prefixo `pokemon.`
- **Quem pode o quê:** leitura pública; escrita só por RPC. O **jogador** muda anotações de RP e fotos; HP, XP, nível e atributos só o mestre. (O PIN do jogador é só a porta da frente, como no resto do site.)

### Migrations (`supabase/pokemon/`)

| Arquivo | O que faz |
|---|---|
| `01_trainers.sql` | bucket de fotos, tabela e funções dos treinadores |

### Telas e comportamentos que não se descobrem lendo o código

- **Treinador novo nasce com vida cheia:** campo "HP atual" vazio na criação = `30 + Físico` (o banco cuida disso). Mudar o Físico depois corta o HP atual no novo máximo, nunca aumenta.
- **Pontos para distribuir** não é guardado: `10 + 2 × (nível − 1) − soma dos atributos`. Se o mestre passar do limite, a ficha mostra "N pontos a mais" em vermelho.
- **XP do treinador** aceita meios pontos. Dar XP sobe de nível sozinho (`pkm_trainer_add_xp`), mantém o excedente e avisa quantos pontos novos chegaram.
- **"XP ganho pelos Pokémon"** é só um registro por enquanto; passa a creditar o treinador sozinho quando as criaturas existirem (fase 3).
- **Jogador com um único treinador** cai direto na ficha dele; NPCs só o mestre vê (esconder na tela, não no banco: leitura é pública).
- **Anotações** salvam 0,9 s depois de parar de digitar, ao sair do campo, ao trocar de aba do app e ao voltar para o hub.
- Cuidado ao mexer no CSS: a classe `.empty` é do estado vazio da tela (tem padding); o avatar sem foto usa `.no-photo`.

## Como testar sem estragar dados reais

Testar a migration num bloco que termina em `raise exception 'RESULTADO …'` (desfaz tudo), depois aplicar. Treinadores de teste levam o nome com prefixo `ZZ` e são removidos pelo nome exato. Para fluxos de mestre, usar uma sessão temporária em `master_sessions` e apagar só aquele token.

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-03 | Projeto criado: plano aprovado em 5 fases (base e fotos → treinadores → bestiário e criaturas → bolsa → técnicas e combate) |
| 2026-11-03 | **Fases 1 e 2 — base, fotos e treinadores.** Visual de Pokédex em tema escuro (responsivo), enquadrador de foto, lista e ficha de treinador (HP, XP com subida de nível, atributos, pontos a distribuir, anotações que salvam sozinhas), tempo real, cartão no hub e PWA. Migration `01_trainers.sql` testada (transação desfeita) e aplicada. Criaturas, bolsa e combate aparecem como "em construção" |

## Ideias paradas (não construir sem pedir)

Tabuleiro quadriculado de combate (peças arrastáveis, movimento por blocos), Pokédex da campanha (vistos/capturados), banner (capa) além do avatar, jogador gastar os próprios pontos de atributo, mais de um jogador.
