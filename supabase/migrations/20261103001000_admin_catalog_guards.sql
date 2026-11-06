create or replace function public.validate_hotel_timezone()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.iana_timezone) then
    raise exception 'iana_timezone must be a supported IANA timezone name';
  end if;
  return new;
end;
$$;

drop trigger if exists hotels_validate_timezone on public.hotels;
create trigger hotels_validate_timezone
before insert or update of iana_timezone on public.hotels
for each row execute function public.validate_hotel_timezone();

revoke all on function public.validate_hotel_timezone() from public, anon, authenticated;
