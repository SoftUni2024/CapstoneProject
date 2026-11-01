drop function if exists public.create_booking(uuid, date, date, integer, text, text, text, uuid);

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
security invoker
set search_path = public
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
  select
    h.id,
    rt.id,
    h.name,
    rt.name,
    rt.capacity,
    rt.nightly_rate,
    rt.currency,
    (p_check_out - p_check_in)::integer,
    (rt.nightly_rate * (p_check_out - p_check_in))::numeric(12, 2),
    count(r.id) filter (where r.is_active and not exists (
      select 1
      from public.bookings b
      where b.room_id = r.id
        and b.status = 'confirmed'
        and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
    ))::bigint
  from public.hotels h
  join public.room_types rt on rt.hotel_id = h.id
  join public.rooms r on r.room_type_id = rt.id
  where h.is_active
    and rt.is_active
    and rt.capacity >= p_guest_count
    and (p_hotel_id is null or h.id = p_hotel_id)
  group by h.id, rt.id, h.name, rt.name, rt.capacity, rt.nightly_rate, rt.currency
  having count(r.id) filter (where r.is_active and not exists (
    select 1
    from public.bookings b
    where b.room_id = r.id
      and b.status = 'confirmed'
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
security invoker
set search_path = public
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

create or replace function public.create_booking(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_guest_name text,
  p_contact_phone text,
  p_special_requests text,
  p_request_id uuid,
  p_expected_nightly_rate numeric,
  p_expected_total_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.bookings;
  v_room record;
  v_booking public.bookings;
  v_nights integer;
  v_actual_total numeric(12, 2);
  v_lock_key bigint;
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_room_type_id is null or p_check_in is null or p_check_out is null then
    raise exception 'Room type and stay dates are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;
  v_nights := p_check_out - p_check_in;
  if v_nights > 30 then
    raise exception 'Maximum stay is 30 nights';
  end if;
  if p_guest_count is null or p_guest_count <= 0 then
    raise exception 'guest_count must be positive';
  end if;
  if nullif(trim(p_guest_name), '') is null or nullif(trim(p_contact_phone), '') is null then
    raise exception 'Guest name and contact phone are required';
  end if;
  if p_request_id is null then
    raise exception 'request_id is required for idempotent booking creation';
  end if;
  if p_expected_nightly_rate is null or p_expected_total_price is null then
    raise exception 'Expected quote is required';
  end if;

  v_lock_key := hashtextextended(v_user_id::text || ':' || p_request_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_existing
  from public.bookings
  where user_id = v_user_id and request_id = p_request_id;

  if found then
    if (v_existing.check_in, v_existing.check_out, v_existing.guest_count,
        v_existing.guest_name, v_existing.contact_phone, v_existing.special_requests)
       is distinct from
       (p_check_in, p_check_out, p_guest_count, trim(p_guest_name),
        trim(p_contact_phone), p_special_requests) then
      raise exception 'request_id has already been used with a different payload';
    end if;
    return jsonb_build_object('status', 'already_created', 'booking', to_jsonb(v_existing));
  end if;

  for v_attempt in 1..3 loop
    select r.id as room_id, rt.capacity, rt.nightly_rate, rt.currency,
           h.id as hotel_id, h.name as hotel_name, rt.name as room_type_name,
           h.iana_timezone
    into v_room
    from public.rooms r
    join public.room_types rt on rt.id = r.room_type_id
    join public.hotels h on h.id = rt.hotel_id
    where rt.id = p_room_type_id
      and h.is_active
      and rt.is_active
      and r.is_active
      and rt.capacity >= p_guest_count
      and p_check_in >= (now() at time zone h.iana_timezone)::date
      and not exists (
        select 1 from public.bookings b
        where b.room_id = r.id
          and b.status = 'confirmed'
          and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
      )
    order by r.id
    for update of r skip locked
    limit 1;

    if found then
      exit;
    end if;

    if v_attempt < 3 then
      perform pg_sleep(0.01);
    end if;
  end loop;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  v_actual_total := (v_room.nightly_rate * v_nights)::numeric(12, 2);
  if v_room.nightly_rate is distinct from p_expected_nightly_rate
     or v_actual_total is distinct from p_expected_total_price then
    return jsonb_build_object(
      'status', 'requote_required',
      'room_type_id', p_room_type_id,
      'nightly_rate', v_room.nightly_rate,
      'currency', v_room.currency,
      'nights', v_nights,
      'total_price', v_actual_total
    );
  end if;

  insert into public.bookings (
    unique_reference, user_id, room_id, check_in, check_out, guest_count,
    status, nightly_rate_snapshot, total_price, currency, guest_name,
    contact_phone, special_requests, hotel_name_snapshot,
    room_type_name_snapshot, request_id
  ) values (
    upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12)), v_user_id,
    v_room.room_id, p_check_in, p_check_out, p_guest_count, 'confirmed',
    v_room.nightly_rate, v_actual_total, v_room.currency, trim(p_guest_name),
    trim(p_contact_phone), p_special_requests, v_room.hotel_name,
    v_room.room_type_name, p_request_id
  )
  on conflict (user_id, request_id) do nothing
  returning * into v_booking;

  if not found then
    select * into v_existing from public.bookings
    where user_id = v_user_id and request_id = p_request_id;
    if (v_existing.check_in, v_existing.check_out, v_existing.guest_count,
        v_existing.guest_name, v_existing.contact_phone, v_existing.special_requests)
       is distinct from
       (p_check_in, p_check_out, p_guest_count, trim(p_guest_name),
        trim(p_contact_phone), p_special_requests) then
      raise exception 'request_id has already been used with a different payload';
    end if;
    return jsonb_build_object('status', 'already_created', 'booking', to_jsonb(v_existing));
  end if;

  insert into public.booking_events (booking_id, actor_id, event_type, details)
  values (v_booking.id, v_user_id, 'created', '{}'::jsonb);

  return jsonb_build_object('status', 'created', 'booking', to_jsonb(v_booking));
exception
  when exclusion_violation then
    return jsonb_build_object('status', 'unavailable');
end;
$$;

revoke all on function public.create_booking(uuid, date, date, integer, text, text, text, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_booking(uuid, date, date, integer, text, text, text, uuid, numeric, numeric) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking public.bookings;
  v_today date;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.user_id <> v_user_id and not (select private.is_admin()) then
    raise exception 'Not authorized to cancel this booking';
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('status', 'already_cancelled', 'booking', to_jsonb(v_booking));
  end if;

  select (now() at time zone h.iana_timezone)::date into v_today
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.hotels h on h.id = rt.hotel_id
  where r.id = v_booking.room_id;

  if v_booking.user_id = v_user_id and v_booking.check_in < v_today then
    raise exception 'Guests can cancel only before hotel-local check-in date';
  end if;

  perform set_config('app.booking_operation', 'cancel', true);
  update public.bookings
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where id = v_booking.id;

  insert into public.booking_events (booking_id, actor_id, event_type, details)
  values (v_booking.id, v_user_id, 'cancelled', '{}'::jsonb);

  select * into v_booking from public.bookings where id = v_booking.id;
  return jsonb_build_object('status', 'cancelled', 'booking', to_jsonb(v_booking));
end;
$$;

revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

create or replace function public.prevent_booking_integrity_bypass()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Bookings are historical records and cannot be deleted';
  end if;
  if current_setting('app.booking_operation', true) = 'cancel' then
    return new;
  end if;
  if not (select private.is_admin()) then
    raise exception 'Only an authorized booking operation may mutate bookings';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_booking_integrity_bypass() from public, anon, authenticated;
