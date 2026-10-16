-- =============================================================================
-- Migration 5: armazenamento de fotos dos produtos (bucket privado)
-- Caminho dos arquivos: products/<product_id>/<arquivo>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy product_images_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_member());

create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_member());

create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_member());

create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role('diretoria', 'supervisao'));
