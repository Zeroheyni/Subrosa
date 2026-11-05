-- Projeto Cat & Dog (id catdog) — marca "tem imagem" nas recompensas
-- O app lista as recompensas SEM o texto da imagem (que é grande) e só baixa as imagens que ainda não tem
-- guardadas; esta coluna calculada diz quais recompensas têm imagem. Só acrescenta; nada é apagado.
alter table catdog_rewards add column if not exists has_image boolean generated always as (image is not null) stored;
