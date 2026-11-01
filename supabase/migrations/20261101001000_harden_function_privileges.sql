create schema if not exists private;

alter extension btree_gist set schema extensions;

alter function public.is_admin() set schema private;
alter function public.handle_new_user() set schema private;

revoke all on function private.is_admin() from anon, authenticated;
grant execute on function private.is_admin() to authenticated;

revoke all on function private.handle_new_user() from anon, authenticated;
revoke all on function public.enforce_room_number_per_hotel() from anon, authenticated;
revoke all on function public.prevent_booking_integrity_bypass() from anon, authenticated;
revoke all on function public.create_booking(uuid, date, date, integer, text, text, text, uuid) from anon;
grant execute on function public.create_booking(uuid, date, date, integer, text, text, text, uuid) to authenticated;

create index booking_events_actor_id_idx
  on public.booking_events (actor_id);
