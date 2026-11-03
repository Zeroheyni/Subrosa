/* ============================================================
   SUBROSA — lista de projetos do hub

   Pra adicionar um projeto novo:
     1. crie a pasta do projeto (ex: minha-ferramenta/index.html)
     2. adicione um objeto aqui embaixo
     3. crie o documento dele: docs/<id>.md (modelo em docs/_MODELO_PROJETO.md)

   kind:  'rpg' (aparece em "RPGs") ou 'app' (aparece em "Aplicativos")
   path:  pasta do projeto, relativa a esta página (sempre termina com /)
   icon:  imagem do cartão, relativa a esta página
   accent: cor de destaque do cartão
   ============================================================ */
window.SUBROSA_PROJECTS = [
  {
    id: 'levina',
    kind: 'rpg',
    name: 'Levina',
    tagline: 'Painel financeiro, inventário, codex, mensagens e diário da campanha cyberpunk.',
    tags: ['Cyberpunk', 'Mestre + jogador'],
    path: 'levina/',
    icon: 'levina/icons/icon-192.png',
    accent: '#00d4ff'
  }
];
