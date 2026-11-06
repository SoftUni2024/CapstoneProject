create or replace function public.admin_reservations_page(
  p_hotel_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_status text default null,
  p_reference text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  booking_id uuid, unique_reference text, guest_name text, contact_phone text,
  hotel_name text, room_type_name text, check_in date, check_out date,
  guest_count integer, nightly_rate_snapshot numeric(12,2), total_price numeric(12,2),
  currency text, status text, created_at timestamptz, cancelled_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = public, auth
as $$
declare v_page integer := greatest(coalesce(p_page, 1), 1); v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not (select private.is_admin()) then raise exception 'Admin authorization required'; end if;
  if p_status is not null and p_status not in ('confirmed','cancelled') then raise exception 'Unsupported booking status'; end if;
  if p_from is not null and p_to is not null and p_to <= p_from then raise exception 'Invalid stay date range'; end if;
  return query
  with filtered as (
    select b.id, b.unique_reference, b.guest_name, b.contact_phone,
      b.hotel_name_snapshot, b.room_type_name_snapshot, b.check_in, b.check_out,
      b.guest_count, b.nightly_rate_snapshot, b.total_price, b.currency,
      b.status, b.created_at, b.cancelled_at
    from public.bookings b
    join public.rooms r on r.id = b.room_id
    join public.room_types rt on rt.id = r.room_type_id
    join public.hotels h on h.id = rt.hotel_id
    where (p_hotel_id is null or h.id = p_hotel_id)
      and (p_status is null or b.status = p_status)
      and (p_reference is null or b.unique_reference ilike '%' || trim(p_reference) || '%')
      and (p_from is null or b.check_out > p_from)
      and (p_to is null or b.check_in < p_to)
  )
  select f.id, f.unique_reference, f.guest_name, f.contact_phone, f.hotel_name_snapshot,
    f.room_type_name_snapshot, f.check_in, f.check_out, f.guest_count,
    f.nightly_rate_snapshot, f.total_price, f.currency, f.status, f.created_at,
    f.cancelled_at, count(*) over ()
  from filtered f order by f.created_at desc, f.id desc
  limit v_size offset (v_page - 1) * v_size;
end; $$;

create or replace function public.admin_booking_details(p_booking_id uuid)
returns table (
  booking_id uuid, unique_reference text, guest_name text, contact_phone text,
  special_requests text, hotel_name text, room_type_name text, check_in date,
  check_out date, guest_count integer, nightly_rate_snapshot numeric(12,2),
  total_price numeric(12,2), currency text, status text, created_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not (select private.is_admin()) then raise exception 'Admin authorization required'; end if;
  return query select b.id, b.unique_reference, b.guest_name, b.contact_phone,
    b.special_requests, b.hotel_name_snapshot, b.room_type_name_snapshot,
    b.check_in, b.check_out, b.guest_count, b.nightly_rate_snapshot,
    b.total_price, b.currency, b.status, b.created_at, b.cancelled_at
  from public.bookings b where b.id = p_booking_id;
end; $$;

create or replace function public.admin_dashboard_summary(p_hotel_id uuid default null, p_local_day date default null)
returns table (published_hotels bigint, active_rooms bigint, confirmed_reservations bigint, arrivals bigint, departures bigint, confirmed_booking_value numeric(14,2))
language plpgsql stable security definer set search_path = public, auth
as $$
declare v_day date;
begin
  if not (select private.is_admin()) then raise exception 'Admin authorization required'; end if;
  select coalesce(p_local_day, (now() at time zone h.iana_timezone)::date) into v_day
  from public.hotels h where h.id = p_hotel_id;
  if p_hotel_id is not null and v_day is null then raise exception 'Hotel not found'; end if;
  return query
  select (select count(*) from public.hotels h where h.is_active and (p_hotel_id is null or h.id = p_hotel_id)),
    (select count(*) from public.rooms r join public.room_types rt on rt.id=r.room_type_id join public.hotels h on h.id=rt.hotel_id where r.is_active and rt.is_active and h.is_active and (p_hotel_id is null or h.id=p_hotel_id)),
    (select count(*) from public.bookings b join public.rooms r on r.id=b.room_id join public.room_types rt on rt.id=r.room_type_id where b.status='confirmed' and (p_hotel_id is null or rt.hotel_id=p_hotel_id)),
    (select count(*) from public.bookings b join public.rooms r on r.id=b.room_id join public.room_types rt on rt.id=r.room_type_id where b.status='confirmed' and b.check_in=v_day and (p_hotel_id is null or rt.hotel_id=p_hotel_id)),
    (select count(*) from public.bookings b join public.rooms r on r.id=b.room_id join public.room_types rt on rt.id=r.room_type_id where b.status='confirmed' and b.check_out=v_day and (p_hotel_id is null or rt.hotel_id=p_hotel_id)),
    (select coalesce(sum(b.total_price),0) from public.bookings b join public.rooms r on r.id=b.room_id join public.room_types rt on rt.id=r.room_type_id where b.status='confirmed' and (p_hotel_id is null or rt.hotel_id=p_hotel_id));
end; $$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare v_user_id uuid := (select auth.uid()); v_booking public.bookings; v_admin boolean := (select private.is_admin()); v_today date;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not v_admin then raise exception 'Admin authorization required'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status='cancelled' then return jsonb_build_object('status','already_cancelled','booking',to_jsonb(v_booking)); end if;
  perform set_config('app.booking_operation','cancel',true);
  update public.bookings set status='cancelled', cancelled_at=coalesce(cancelled_at,now()) where id=p_booking_id;
  insert into public.booking_events(booking_id,actor_id,event_type,details) values (p_booking_id,v_user_id,'cancelled',jsonb_build_object('reason',left(coalesce(trim(p_reason),''),500),'source','admin'));
  select * into v_booking from public.bookings where id=p_booking_id;
  return jsonb_build_object('status','cancelled','booking',to_jsonb(v_booking));
end; $$;

revoke all on function public.admin_reservations_page(uuid,date,date,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_booking_details(uuid) from public, anon, authenticated;
revoke all on function public.admin_dashboard_summary(uuid,date) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_reservations_page(uuid,date,date,text,text,integer,integer) to authenticated;
grant execute on function public.admin_booking_details(uuid) to authenticated;
grant execute on function public.admin_dashboard_summary(uuid,date) to authenticated;
grant execute on function public.cancel_booking(uuid,text) to authenticated;
