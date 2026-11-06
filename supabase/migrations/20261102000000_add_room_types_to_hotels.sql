alter table public.hotels
  add column if not exists "roomTypes" jsonb;
