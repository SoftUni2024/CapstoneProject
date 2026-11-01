create or replace function public.search_availability_page(
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_destination text default null,
  p_max_nightly_rate numeric default null,
  p_sort text default 'name',
  p_page integer default 1,
  p_page_size integer default 9
)
returns table (
  hotel_id uuid,
  room_type_id uuid,
  hotel_name text,
  city text,
  country text,
  room_type_name text,
  capacity integer,
  nightly_rate numeric(12, 2),
  currency text,
  nights integer,
  total_price numeric(12, 2),
  available_rooms bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 9), 1), 50);
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;
  if p_check_out - p_check_in > 30 then
    raise exception 'Maximum stay is 30 nights';
  end if;
  if p_guest_count is null or p_guest_count <= 0 then
    raise exception 'guest_count must be positive';
  end if;
  if p_max_nightly_rate is not null and p_max_nightly_rate < 0 then
    raise exception 'max nightly price cannot be negative';
  end if;
  if coalesce(p_sort, 'name') not in ('name', 'price_asc', 'price_desc') then
    raise exception 'Unsupported sort option';
  end if;

  return query
  with eligible as (
    select h.id as hotel_id, rt.id as room_type_id, h.name as hotel_name,
      h.city, h.country, rt.name as room_type_name, rt.capacity,
      rt.nightly_rate, rt.currency, (p_check_out - p_check_in)::integer as nights,
      (rt.nightly_rate * (p_check_out - p_check_in))::numeric(12, 2) as total_price,
      count(r.id) filter (where r.is_active and not exists (
        select 1 from public.bookings b
        where b.room_id = r.id and b.status = 'confirmed'
          and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
      ))::bigint as available_rooms
    from public.hotels h
    join public.room_types rt on rt.hotel_id = h.id
    join public.rooms r on r.room_type_id = rt.id
    where h.is_active and rt.is_active and rt.capacity >= p_guest_count
      and p_check_in >= (now() at time zone h.iana_timezone)::date
      and (p_destination is null or p_destination = '' or h.city ilike '%' || p_destination || '%' or h.name ilike '%' || p_destination || '%')
      and (p_max_nightly_rate is null or rt.nightly_rate <= p_max_nightly_rate)
    group by h.id, rt.id, h.name, h.city, h.country, rt.name, rt.capacity, rt.nightly_rate, rt.currency
    having count(r.id) filter (where r.is_active and not exists (
      select 1 from public.bookings b
      where b.room_id = r.id and b.status = 'confirmed'
        and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
    )) > 0
  )
  select e.hotel_id, e.room_type_id, e.hotel_name, e.city, e.country,
    e.room_type_name, e.capacity, e.nightly_rate, e.currency, e.nights,
    e.total_price, e.available_rooms, count(*) over ()
  from eligible e
  order by
    case when coalesce(p_sort, 'name') = 'name' then e.hotel_name end asc,
    case when p_sort = 'price_asc' then e.nightly_rate end asc,
    case when p_sort = 'price_desc' then e.nightly_rate end desc,
    e.hotel_name asc, e.room_type_name asc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;

revoke all on function public.search_availability_page(date, date, integer, text, numeric, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_availability_page(date, date, integer, text, numeric, text, integer, integer) to anon, authenticated;
