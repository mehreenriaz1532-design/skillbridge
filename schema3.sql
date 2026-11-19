-- Run ONCE in Supabase > SQL Editor (after schema.sql and schema2.sql).
-- 1) public storage bucket for gallery photos, hero photos and PDFs uploaded from the admin panel
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 3145728, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
-- 2) a gallery item may now be just a document/link without a photo
alter table gallery alter column image_url drop not null;
