create or replace function public.my_bookings_page(
  p_filter text default 'upcoming',
  p_page integer default 1,
  p_page_size integer default 10
)
returns table (
  booking_id uuid,
  unique_reference text,
  hotel_name text,
  city text,
  room_type_name text,
  check_in date,
  check_out date,
  guest_count integer,
  status text,
  total_price numeric(12, 2),
  currency text,
  cover_path text,
  cover_alt text,
  stay_category text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if coalesce(p_filter, 'upcoming') not in ('upcoming', 'past', 'cancelled', 'all') then raise exception 'Unsupported booking filter'; end if;

  return query
  with scoped as (
    select b.id, b.unique_reference, b.hotel_name_snapshot, h.city,
      b.room_type_name_snapshot, b.check_in, b.check_out, b.guest_count,
      b.status, b.total_price, b.currency, hi.storage_path, hi.alt_text,
      case
        when b.status = 'cancelled' then 'cancelled'
        when b.check_out <= (now() at time zone h.iana_timezone)::date then 'past'
        else 'upcoming'
      end as category
    from public.bookings b
    join public.rooms r on r.id = b.room_id
    join public.room_types rt on rt.id = r.room_type_id
    join public.hotels h on h.id = rt.hotel_id
    left join lateral (
      select i.storage_path, i.alt_text
      from public.hotel_images i
      where i.hotel_id = h.id
      order by i.is_cover desc, i.position asc, i.created_at asc
      limit 1
    ) hi on true
    where b.user_id = v_user_id
  ), filtered as (
    select * from scoped
    where p_filter = 'all' or category = p_filter
  )
  select f.id, f.unique_reference, f.hotel_name_snapshot, f.city,
    f.room_type_name_snapshot, f.check_in, f.check_out, f.guest_count,
    f.status, f.total_price, f.currency, f.storage_path, f.alt_text,
    f.category, count(*) over ()
  from filtered f
  order by
    case when f.category = 'upcoming' then 0 when f.category = 'past' then 1 else 2 end,
    case when f.category = 'upcoming' then f.check_in end asc,
    case when f.category <> 'upcoming' then f.check_in end desc,
    f.id asc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.booking_details(p_booking_id uuid)
returns table (
  booking_id uuid,
  unique_reference text,
  hotel_name text,
  city text,
  country text,
  hotel_timezone text,
  room_type_name text,
  check_in date,
  check_out date,
  guest_count integer,
  status text,
  nightly_rate_snapshot numeric(12, 2),
  total_price numeric(12, 2),
  currency text,
  guest_name text,
  contact_phone text,
  special_requests text,
  created_at timestamptz,
  cancelled_at timestamptz,
  can_cancel boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  return query
  select b.id, b.unique_reference, b.hotel_name_snapshot, h.city, h.country,
    h.iana_timezone, b.room_type_name_snapshot, b.check_in, b.check_out,
    b.guest_count, b.status, b.nightly_rate_snapshot, b.total_price, b.currency,
    b.guest_name, b.contact_phone, b.special_requests, b.created_at, b.cancelled_at,
    (b.status = 'confirmed' and (b.user_id = v_user_id or (select private.is_admin()))
      and ((select private.is_admin()) or b.check_in >= (now() at time zone h.iana_timezone)::date))
  from public.bookings b
  join public.rooms r on r.id = b.room_id
  join public.room_types rt on rt.id = r.room_type_id
  join public.hotels h on h.id = rt.hotel_id
  where b.id = p_booking_id
    and (b.user_id = v_user_id or (select private.is_admin()));
end;
$$;

revoke all on function public.my_bookings_page(text, integer, integer) from public, anon, authenticated;
grant execute on function public.my_bookings_page(text, integer, integer) to authenticated;
revoke all on function public.booking_details(uuid) from public, anon, authenticated;
grant execute on function public.booking_details(uuid) to authenticated;
