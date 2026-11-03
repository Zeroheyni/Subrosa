-- ============================================================
-- Bucket público pras fotos de personagens (e outras features
-- futuras do lado do jogo, fora do diário) — separado do
-- diary-images de propósito, pra não misturar os dois assuntos.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-images', 'game-images', true, 5242880, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do nothing;

drop policy if exists "game_images_insert_open" on storage.objects;
create policy "game_images_insert_open" on storage.objects
  for insert
  with check (bucket_id = 'game-images');
