drop trigger if exists hotel_images_ensure_cover on public.hotel_images;

create or replace function public.ensure_hotel_cover()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_cover then
    update public.hotel_images
    set is_cover = true
    where id = (
      select id
      from public.hotel_images
      where hotel_id = old.hotel_id
      order by position asc, created_at asc, id asc
      limit 1
    );
  end if;

  return old;
end;
$$;

create trigger hotel_images_ensure_cover
after delete on public.hotel_images
for each row execute function public.ensure_hotel_cover();

revoke execute on function public.ensure_hotel_cover() from public, anon, authenticated;
