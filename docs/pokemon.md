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
| `pokemon/js/creatures.js` | bestiário (espécies), lista e ficha de criaturas, formulários, mover entre equipe e PC, trecho "equipe e PC" da ficha do treinador |
| `pokemon/js/app.js` | inicialização, abas, rotas (`#treinadores`, `#treinador/<id>`, `#criaturas`, `#criatura/<id>`, `#bestiario`, `#especie/<id>`), tempo real |

### Fotos e enquadramento

Toda foto (treinador, criatura e espécie) guarda **três coisas**: o recorte pronto que aparece na tela (`image_url`, quadrado 512 px), a imagem original reduzida (`image_src_url`, até 1600 px) e o enquadramento (`image_frame` = `{zoom, cx, cy}`, centro normalizado). Assim dá para **reenquadrar depois** sem enviar a foto de novo. O Storage não deixa a chave pública apagar, então fotos trocadas ficam órfãs no bucket (limite conhecido, igual ao Levina).

## Regras do sistema (resumo do guia)

**Treinador**
- Atributos de RP: Carisma, Aparência, Resistência, Mental, Físico. Começam em 0; **10 pontos** na criação e **+2 por nível**.
- HP máximo = **30 + Físico**. Em 0 HP desmaia.
- Nível começa em 1, sem limite. XP para o próximo nível = **nível × 10**; o excedente é mantido.
- Recebe **50% do XP total** ganho pelos seus Pokémon (sem tirar deles; frações em meios pontos).
- Leva **até 3 criaturas**; as outras ficam no PC.

**Criaturas**
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

- **Tabelas** (prefixo `pkm_`): `pkm_trainers`, `pkm_species`, `pkm_creatures`
- **Funções/RPCs:** `pkm_assert_master`, `pkm_save_trainer`, `pkm_trainer_add_xp`, `pkm_trainer_hp`, `pkm_delete_trainer` (as de mestre exigem o token); `pkm_trainer_set_notes`, `pkm_trainer_set_photo` (qualquer um, são o que o jogador pode mexer).
  - Espécies e criaturas — mestre (token): `pkm_save_species`, `pkm_delete_species`, `pkm_species_set_photo`, `pkm_save_creature`, `pkm_creature_move`, `pkm_creature_set_hp`, `pkm_creature_add_xp`, `pkm_delete_creature`. Qualquer um (jogador): `pkm_creature_set_notes`, `pkm_creature_set_photo`. Ajudantes: `pkm_valid_types`
- **Storage:** bucket público `pokemon-images` (5 MB; png/jpeg/webp). Pastas: `trainers/`, `creatures/`, `species/`
- **Tempo real:** `pkm_trainers`, `pkm_species` e `pkm_creatures` estão na publicação do Realtime; o app recarrega ao vivo
- **Chaves do navegador:** prefixo `pokemon.`
- **Quem pode o quê:** leitura pública; escrita só por RPC. O **jogador** muda anotações de RP e fotos (do treinador e das criaturas); HP, XP, nível, atributos, IVs, equipe/PC e tudo do bestiário só o mestre. (O PIN do jogador é só a porta da frente, como no resto do site.)

### Migrations (`supabase/pokemon/`)

| Arquivo | O que faz |
|---|---|
| `01_trainers.sql` | bucket de fotos, tabela e funções dos treinadores |
| `02_creatures.sql` | espécies, criaturas (IVs, dono, vaga), tipos válidos e as funções de criar, mover, HP e XP |

### Telas e comportamentos que não se descobrem lendo o código

- **Treinador novo nasce com vida cheia:** campo "HP atual" vazio na criação = `30 + Físico` (o banco cuida disso). Mudar o Físico depois corta o HP atual no novo máximo, nunca aumenta.
- **Pontos para distribuir** não é guardado: `10 + 2 × (nível − 1) − soma dos atributos`. Se o mestre passar do limite, a ficha mostra "N pontos a mais" em vermelho.
- **XP do treinador** aceita meios pontos. Dar XP sobe de nível sozinho (`pkm_trainer_add_xp`), mantém o excedente e avisa quantos pontos novos chegaram.
- **XP das criaturas credita o treinador sozinho:** `pkm_creature_add_xp` soma o XP na criatura (sobe de nível até o 100, excedente mantido) e, se ela tem dono, soma o mesmo valor em "XP ganho pelos Pokémon" e dá **metade** ao treinador (meios pontos; ele pode subir de nível). O campo "XP ganho pelos Pokémon" do formulário do treinador continua editável para acertos manuais.
- **Jogador com um único treinador** cai direto na ficha dele; NPCs só o mestre vê (esconder na tela, não no banco: leitura é pública).
- **Anotações** salvam 0,9 s depois de parar de digitar, ao sair do campo, ao trocar de aba do app e ao voltar para o hub.
- Cuidado ao mexer no CSS: a classe `.empty` é do estado vazio da tela (tem padding); o avatar sem foto usa `.no-photo`.
- **Atributos da criatura não são guardados:** saem de `arredondar(B(nível) × Potencial ÷ 5 × M(IV))` (funções em `rules.js`). Por isso subir de nível ou editar o IV muda tudo sozinho. O HP máximo é a Vitalidade final.
- **HP da criatura nulo = vida cheia** (`hp_current` nulo). Dano/cura calculam o valor absoluto no app; curar até o máximo volta para nulo. Assim a vida cheia acompanha o nível. Ao subir de nível, HP parcial fica igual (não cura).
- **IVs:** o formulário de nova criatura já vem com IVs sorteados (1 a 20), editáveis, com a prévia dos valores finais; "Sortear todos" sorteia de novo. Se o app não mandar IV, o banco sorteia.
- **Equipe e PC:** vaga 0 a 2 = equipe carregada; sem vaga = PC; sem dono = solta. Criar com dono ocupa a primeira vaga livre (ou o PC se a equipe estiver cheia). "Mover" numa vaga ocupada troca as duas criaturas (a outra assume a vaga que ficou livre, ou vai pro PC). Apagar o treinador **não** apaga as criaturas: elas ficam soltas.
- **O que o jogador vê:** só criaturas dos treinadores "jogador" (as soltas e as de NPC ficam escondidas na tela, não no banco), atributos finais sem IV nem Potencial, sem Bestiário (`#bestiario` volta para `#criaturas`). Pode trocar foto e escrever anotações.
- **Foto da criatura:** se a criatura não tem foto própria, usa a da espécie.
- **Espécie com criaturas não pode ser apagada** (o banco recusa); primeiro apague ou troque a espécie delas.
- Quando outra pessoa muda algo e a tela está com um campo em foco (anotações, dano, XP, prévia), o app espera para não atropelar a digitação; a tela atualiza na próxima mudança.

### Matriz de tipos (como juntei as duas tabelas do guia)

O guia traz uma tabela **ofensiva** (vantagens 2× e desvantagens 0,5× de quem ataca) e uma **defensiva** (resistências 0,5× e imunidades 0× de quem defende) e diz que elas podem ser assimétricas. A regra implementada em `typeVs(ataque, defesa)`:

1. Imunidade da tabela defensiva vence tudo (0×).
2. Senão vale o que as tabelas dizem; quando as duas falam da mesma coisa (ex.: Fogo contra Água, 0,5× nas duas) não se acumulam.
3. Se uma dissesse 2× e a outra 0,5×, se anulariam em 1× (hoje não acontece em nenhum par).

Contra criaturas de 2 ou 3 tipos os multiplicadores se multiplicam, com as regras especiais do guia: três 0,5× = imunidade; imunidade + um tipo 2× = 0,5×, aplicando depois o terceiro tipo (2× → 1×; 0,5× → 0,25×). Interpretação minha onde o guia é omisso: cada imunidade só é anulada por **um** tipo 2×; imunidade sem 2× para anular continua 0×.

**Pontos do guia para o mestre confirmar** (o app segue o texto como está):
- Elétrico→Terra e Mente→Sombrio: a tabela ofensiva dá 0,5× e a defensiva dá imunidade; vale a imunidade. O mesmo em Veneno→Metal.
- Espaço lista **Dragão** tanto em vantagens quanto em desvantagens na tabela ofensiva; o app trata como 1× (se anulam).
- Normal tem desvantagem (0,5×) contra Físico e Tempo.
- Luz é imune a Luz na tabela defensiva.
- Tabela defensiva de Metal: a linha quebra no PDF; li como resistências Normal, Planta, Gelo, Voador, Inseto, Mente, Dragão e Metal, e imunidade a Veneno.

## Como testar sem estragar dados reais

Testar a migration num bloco que termina em `raise exception 'RESULTADO …'` (desfaz tudo), depois aplicar. Treinadores de teste levam o nome com prefixo `ZZ` e são removidos pelo nome exato. Para fluxos de mestre, usar uma sessão temporária em `master_sessions` e apagar só aquele token.

Para testar a interface sem digitar o PIN: criar uma sessão temporária (com um token que você mesmo gera), copiar `pokemon/index.html` para uma página temporária trocando o `<script src="../shared/auth.js">` por um stub que define `SubrosaAuth` (`get()` devolvendo `{role, token}`, `onReady(cb)` e `logout`), testar pelo `subrosa-static` e, no fim, **apagar a página, a sessão (pelo token exato) e os dados `ZZ`**, conferindo as contagens de `master_sessions`, `pkm_trainers`, `pkm_species` e `pkm_creatures`. Nunca commitar a página de teste.

## Histórico

| Data | O que foi feito |
|---|---|
| 2026-11-03 | Projeto criado: plano aprovado em 5 fases (base e fotos → treinadores → bestiário e criaturas → bolsa → técnicas e combate) |
| 2026-11-03 | **Fases 1 e 2 — base, fotos e treinadores.** Visual de Pokédex em tema escuro (responsivo), enquadrador de foto, lista e ficha de treinador (HP, XP com subida de nível, atributos, pontos a distribuir, anotações que salvam sozinhas), tempo real, cartão no hub e PWA. Migration `01_trainers.sql` testada (transação desfeita) e aplicada. Criaturas, bolsa e combate aparecem como "em construção" |
| 2026-11-03 | **Fase 3 — bestiário e criaturas.** Espécies com até 3 tipos e Potencial 1–10 nos 9 atributos; criaturas com IVs sorteados, nível até 100, XP, HP (nulo = cheio), atributos calculados, quadro de fraquezas/resistências (matriz de tipos juntando as duas tabelas do guia), equipe de 3 + PC com troca de vagas, XP que credita metade ao treinador, fotos com enquadramento (criatura e espécie) e anotações da criatura. Migration `02_creatures.sql` testada (transação desfeita) e aplicada. Também corrigido: campos de Dano/XP da ficha ficavam com largura total |

## Ideias paradas (não construir sem pedir)

Tabuleiro quadriculado de combate (peças arrastáveis, movimento por blocos), Pokédex da campanha (vistos/capturados), banner (capa) além do avatar, jogador gastar os próprios pontos de atributo, mais de um jogador, jogador reorganizar a própria equipe/PC, dar o mesmo XP a várias criaturas de uma vez (vem junto com o combate: "todas que participaram recebem o XP inteiro").
