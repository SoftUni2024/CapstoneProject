create or replace function public.search_availability(
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_hotel_id uuid default null
)
returns table (
  hotel_id uuid,
  room_type_id uuid,
  hotel_name text,
  room_type_name text,
  capacity integer,
  nightly_rate numeric(12, 2),
  currency text,
  nights integer,
  total_price numeric(12, 2),
  available_rooms bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;
  if p_guest_count is null or p_guest_count <= 0 then
    raise exception 'guest_count must be positive';
  end if;
  if p_check_out - p_check_in > 30 then
    raise exception 'Maximum stay is 30 nights';
  end if;

  return query
  select h.id, rt.id, h.name, rt.name, rt.capacity, rt.nightly_rate,
         rt.currency, (p_check_out - p_check_in)::integer,
         (rt.nightly_rate * (p_check_out - p_check_in))::numeric(12, 2),
         count(r.id) filter (where r.is_active and not exists (
           select 1 from public.bookings b
           where b.room_id = r.id and b.status = 'confirmed'
             and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
         ))::bigint
  from public.hotels h
  join public.room_types rt on rt.hotel_id = h.id
  join public.rooms r on r.room_type_id = rt.id
  where h.is_active and rt.is_active and rt.capacity >= p_guest_count
    and p_check_in >= (now() at time zone h.iana_timezone)::date
    and (p_hotel_id is null or h.id = p_hotel_id)
  group by h.id, rt.id, h.name, rt.name, rt.capacity, rt.nightly_rate, rt.currency
  having count(r.id) filter (where r.is_active and not exists (
    select 1 from public.bookings b
    where b.room_id = r.id and b.status = 'confirmed'
      and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
  )) > 0
  order by h.name, rt.name;
end;
$$;

create or replace function public.quote_booking(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_count integer
)
returns table (
  room_type_id uuid,
  hotel_id uuid,
  hotel_name text,
  room_type_name text,
  capacity integer,
  nightly_rate numeric(12, 2),
  currency text,
  nights integer,
  total_price numeric(12, 2),
  available_rooms bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return query
  select a.room_type_id, a.hotel_id, a.hotel_name, a.room_type_name,
         a.capacity, a.nightly_rate, a.currency, a.nights,
         a.total_price, a.available_rooms
  from public.search_availability(p_check_in, p_check_out, p_guest_count, null) a
  where a.room_type_id = p_room_type_id;
end;
$$;

revoke all on function public.search_availability(date, date, integer, uuid) from public, anon, authenticated;
grant execute on function public.search_availability(date, date, integer, uuid) to anon, authenticated;
revoke all on function public.quote_booking(uuid, date, date, integer) from public, anon, authenticated;
grant execute on function public.quote_booking(uuid, date, date, integer) to anon, authenticated;
