insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hotel-images', 'hotel-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']::text[])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hotel_images_public_storage_read on storage.objects;
create policy hotel_images_public_storage_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'hotel-images');

drop policy if exists hotel_images_admin_storage_insert on storage.objects;
create policy hotel_images_admin_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'hotel-images' and (select private.is_admin()));

drop policy if exists hotel_images_admin_storage_update on storage.objects;
create policy hotel_images_admin_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'hotel-images' and (select private.is_admin()))
with check (bucket_id = 'hotel-images' and (select private.is_admin()));

drop policy if exists hotel_images_admin_storage_delete on storage.objects;
create policy hotel_images_admin_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'hotel-images' and (select private.is_admin()));

create unique index if not exists hotel_images_one_cover_per_hotel_idx
  on public.hotel_images (hotel_id) where is_cover;

create or replace function public.ensure_hotel_cover()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.is_cover and not new.is_cover) then
    if not exists (select 1 from public.hotel_images where hotel_id = coalesce(new.hotel_id, old.hotel_id) and is_cover) then
      update public.hotel_images
      set is_cover = true
      where id = (
        select id from public.hotel_images
        where hotel_id = coalesce(new.hotel_id, old.hotel_id)
        order by position asc, created_at asc, id asc
        limit 1
      );
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists hotel_images_ensure_cover on public.hotel_images;
create trigger hotel_images_ensure_cover
after delete or update of is_cover on public.hotel_images
for each row execute function public.ensure_hotel_cover();

revoke all on function public.ensure_hotel_cover() from public, anon, authenticated;
