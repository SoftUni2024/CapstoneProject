create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  phone text,
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'guest' check (role in ('guest', 'admin'))
);

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  city text not null,
  country text not null,
  adress text not null,
  iana_timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  name text not null,
  description text,
  capacity integer not null check (capacity > 0),
  nightly_rate numeric(12, 2) not null check (nightly_rate >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, name)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  room_number text not null,
  is_active boolean not null default true
);

create unique index rooms_room_number_per_room_type_idx
  on public.rooms (room_type_id, room_number);

create or replace function public.enforce_room_number_per_hotel()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hotel_id uuid;
begin
  select hotel_id into v_hotel_id
  from public.room_types
  where id = new.room_type_id;

  if v_hotel_id is null then
    raise exception 'room_type_id must reference an existing room type';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_hotel_id::text || ':' || new.room_number, 0)
  );

  if exists (
    select 1
    from public.rooms r
    join public.room_types rt on rt.id = r.room_type_id
    where rt.hotel_id = v_hotel_id
      and r.room_number = new.room_number
      and r.id <> new.id
  ) then
    raise exception 'room_number must be unique within a hotel';
  end if;

  return new;
end;
$$;

create trigger rooms_room_number_per_hotel_guard
before insert or update of room_type_id, room_number on public.rooms
for each row execute function public.enforce_room_number_per_hotel();

revoke all on function public.enforce_room_number_per_hotel() from public;

create table public.hotel_images (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  storage_path text not null,
  alt_text text not null default '',
  position integer not null default 0 check (position >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  unique_reference text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guest_count integer not null check (guest_count > 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  nightly_rate_snapshot numeric(12, 2) not null check (nightly_rate_snapshot >= 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  guest_name text not null,
  contact_phone text not null,
  special_requests text,
  hotel_name_snapshot text not null,
  room_type_name_snapshot text not null,
  request_id uuid,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (check_out > check_in),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  unique (user_id, request_id)
);

alter table public.bookings
  add constraint bookings_no_confirmed_room_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status = 'confirmed');

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index room_types_hotel_id_idx on public.room_types (hotel_id);
create index rooms_room_type_id_idx on public.rooms (room_type_id);
create index hotel_images_hotel_id_position_idx on public.hotel_images (hotel_id, position);
create index bookings_user_id_created_at_idx on public.bookings (user_id, created_at desc);
create index bookings_room_id_dates_idx on public.bookings (room_id, check_in, check_out);
create index bookings_status_dates_idx on public.bookings (status, check_in, check_out);
create index booking_events_booking_id_created_at_idx on public.booking_events (booking_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hotels_set_updated_at
before update on public.hotels
for each row execute function public.set_updated_at();

create trigger room_types_set_updated_at
before update on public.room_types
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'guest')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'guest' from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_booking(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_guest_name text,
  p_contact_phone text,
  p_special_requests text default null,
  p_request_id uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking public.bookings;
  v_room record;
  v_days integer;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'check_out must be after check_in';
  end if;
  if p_guest_count <= 0 then
    raise exception 'guest_count must be positive';
  end if;

  select r.id, r.room_number, rt.capacity, rt.nightly_rate, rt.currency,
         h.name as hotel_name, rt.name as room_type_name
  into v_room
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.hotels h on h.id = rt.hotel_id
  where r.id = p_room_id
    and r.is_active
    and rt.is_active
    and h.is_active;

  if not found then
    raise exception 'Room is not available for booking';
  end if;
  if p_guest_count > v_room.capacity then
    raise exception 'guest_count exceeds room capacity';
  end if;

  v_days := p_check_out - p_check_in;

  insert into public.bookings (
    unique_reference, user_id, room_id, check_in, check_out, guest_count,
    status, nightly_rate_snapshot, total_price, currency, guest_name,
    contact_phone, special_requests, hotel_name_snapshot,
    room_type_name_snapshot, request_id
  ) values (
    upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12)),
    v_user_id, p_room_id, p_check_in, p_check_out, p_guest_count,
    'confirmed', v_room.nightly_rate, v_room.nightly_rate * v_days,
    v_room.currency, p_guest_name, p_contact_phone, p_special_requests,
    v_room.hotel_name, v_room.room_type_name, p_request_id
  )
  on conflict (user_id, request_id) do nothing
  returning * into v_booking;

  if not found then
    select * into v_booking
    from public.bookings
    where user_id = v_user_id and request_id = p_request_id;
    return v_booking;
  end if;

  insert into public.booking_events (booking_id, actor_id, event_type, details)
  values (v_booking.id, v_user_id, 'created', '{}'::jsonb);

  return v_booking;
exception
  when exclusion_violation then
    raise exception 'Room is already booked for the requested dates';
end;
$$;

revoke all on function public.create_booking(uuid, date, date, integer, text, text, text, uuid) from public;
grant execute on function public.create_booking(uuid, date, date, integer, text, text, text, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.hotels enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.hotel_images enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

revoke all on public.profiles, public.user_roles, public.hotels, public.room_types,
  public.rooms, public.hotel_images, public.bookings, public.booking_events from anon, authenticated;

grant select on public.hotels, public.room_types, public.hotel_images to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.bookings, public.booking_events to authenticated;
grant all on public.hotels, public.room_types, public.rooms, public.hotel_images,
  public.bookings, public.booking_events to authenticated;

create policy hotels_public_read on public.hotels
for select to anon, authenticated using (is_active or (select public.is_admin()));

create policy room_types_public_read on public.room_types
for select to anon, authenticated using (
  (is_active and exists (
    select 1 from public.hotels h
    where h.id = hotel_id and h.is_active
  ))
  or (select public.is_admin())
);

create policy hotel_images_public_read on public.hotel_images
for select to anon, authenticated using (
  exists (
    select 1 from public.hotels h
    where h.id = hotel_id and (h.is_active or (select public.is_admin()))
  )
);

create policy profiles_self_read on public.profiles
for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_self_update on public.profiles
for update to authenticated
using (id = (select auth.uid()) or (select public.is_admin()))
with check (id = (select auth.uid()) or (select public.is_admin()));

create policy user_roles_admin_read on public.user_roles
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy hotels_admin_manage on public.hotels
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy room_types_admin_manage on public.room_types
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy rooms_admin_manage on public.rooms
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy hotel_images_admin_manage on public.hotel_images
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy bookings_guest_read on public.bookings
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy bookings_admin_manage on public.bookings
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy booking_events_guest_read on public.booking_events
for select to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (b.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

create policy booking_events_admin_manage on public.booking_events
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

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
  if not (select public.is_admin()) then
    raise exception 'Only the authorized booking operation may mutate bookings';
  end if;
  return new;
end;
$$;

create trigger bookings_integrity_guard
before update or delete on public.bookings
for each row execute function public.prevent_booking_integrity_bypass();

revoke all on function public.prevent_booking_integrity_bypass() from public;

