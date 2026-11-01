create or replace function public.published_hotels_page(
  p_destination text default null,
  p_max_nightly_rate numeric default null,
  p_sort text default 'name',
  p_page integer default 1,
  p_page_size integer default 9
)
returns table (
  hotel_id uuid,
  hotel_name text,
  city text,
  country text,
  indicative_nightly_rate numeric(12, 2),
  currency text,
  cover_path text,
  cover_alt text,
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
  if p_max_nightly_rate is not null and p_max_nightly_rate < 0 then
    raise exception 'max nightly price cannot be negative';
  end if;
  if coalesce(p_sort, 'name') not in ('name', 'price_asc', 'price_desc') then
    raise exception 'Unsupported sort option';
  end if;

  return query
  with catalog as (
    select h.id as hotel_id, h.name as hotel_name, h.city, h.country,
      rates.indicative_nightly_rate, rates.currency, cover.cover_path, cover.cover_alt
    from public.hotels h
    left join lateral (
      select min(rt.nightly_rate)::numeric(12, 2) as indicative_nightly_rate,
             'EUR'::text as currency
      from public.room_types rt
      where rt.hotel_id = h.id and rt.is_active
    ) rates on true
    left join lateral (
      select hi.storage_path as cover_path, hi.alt_text as cover_alt
      from public.hotel_images hi
      where hi.hotel_id = h.id
      order by hi.is_cover desc, hi.position asc, hi.created_at asc
      limit 1
    ) cover on true
    where h.is_active
      and rates.indicative_nightly_rate is not null
      and (p_destination is null or p_destination = '' or h.city ilike '%' || p_destination || '%' or h.name ilike '%' || p_destination || '%')
      and (p_max_nightly_rate is null or rates.indicative_nightly_rate <= p_max_nightly_rate)
  )
  select c.hotel_id, c.hotel_name, c.city, c.country, c.indicative_nightly_rate,
    c.currency, c.cover_path, c.cover_alt, count(*) over ()
  from catalog c
  order by
    case when coalesce(p_sort, 'name') = 'name' then c.hotel_name end asc,
    case when p_sort = 'price_asc' then c.indicative_nightly_rate end asc,
    case when p_sort = 'price_desc' then c.indicative_nightly_rate end desc,
    c.hotel_name asc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;

revoke all on function public.published_hotels_page(text, numeric, text, integer, integer) from public, anon, authenticated;
grant execute on function public.published_hotels_page(text, numeric, text, integer, integer) to anon, authenticated;
