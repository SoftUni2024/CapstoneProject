import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState, renderLoadingSkeleton } from '../components/ui.js';

const app = document.querySelector('#app');
const maxStayNights = 30;
const pageSize = 6;
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function todayLocalIso() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function parseSearch() {
  const params = getQueryParams();
  const search = { destination: (params.get('destination') || '').trim(), check_in: params.get('check_in') || '', check_out: params.get('check_out') || '', guests: params.get('guests') || '', max_price: params.get('max_price') || '', sort: params.get('sort') || 'name', page: Math.max(Number(params.get('page') || 1), 1) };
  const hasDates = Boolean(search.check_in || search.check_out);
  if (hasDates && (!search.check_in || !search.check_out)) return { search, error: 'Choose both check-in and check-out dates.' };
  if (hasDates && search.check_out <= search.check_in) return { search, error: 'Check-out must be after check-in.' };
  if (hasDates) {
    const nights = Math.round((Date.parse(`${search.check_out}T00:00:00`) - Date.parse(`${search.check_in}T00:00:00`)) / 86400000);
    if (nights > maxStayNights) return { search, error: `Stays can be up to ${maxStayNights} nights.` };
    if (search.check_in < todayLocalIso()) return { search, error: 'Check-in cannot be before today.' };
    const guests = Number(search.guests);
    if (!Number.isInteger(guests) || guests <= 0) return { search, error: 'Guests must be a positive whole number.' };
    search.nights = nights;
  }
  if (search.max_price && (!Number.isFinite(Number(search.max_price)) || Number(search.max_price) < 0)) return { search, error: 'Maximum nightly price must be zero or more.' };
  if (!['name', 'price_asc', 'price_desc'].includes(search.sort)) return { search, error: 'Choose a supported sort option.' };
  return { search, error: '' };
}

function searchForm(search) {
  return `<form class="search-panel results-search" id="results-search" novalidate><div class="row g-3 align-items-end">
    <div class="col-12 col-lg-3"><label class="form-label" for="destination">Destination</label><input class="form-control" id="destination" name="destination" type="search" value="${escape(search.destination)}" placeholder="City or hotel"></div>
    <div class="col-6 col-lg-2"><label class="form-label" for="check_in">Check-in</label><input class="form-control" id="check_in" name="check_in" type="date" value="${escape(search.check_in)}"></div>
    <div class="col-6 col-lg-2"><label class="form-label" for="check_out">Check-out</label><input class="form-control" id="check_out" name="check_out" type="date" value="${escape(search.check_out)}"></div>
    <div class="col-6 col-lg-1"><label class="form-label" for="guests">Guests</label><input class="form-control" id="guests" name="guests" type="number" min="1" step="1" value="${escape(search.guests || '2')}"></div>
    <div class="col-6 col-lg-2"><label class="form-label" for="max_price">Max €/night</label><input class="form-control" id="max_price" name="max_price" type="number" min="0" step="0.01" value="${escape(search.max_price)}" placeholder="Any"></div>
    <div class="col-6 col-lg-2"><label class="form-label" for="sort">Sort by</label><select class="form-select" id="sort" name="sort"><option value="name"${search.sort === 'name' ? ' selected' : ''}>Name</option><option value="price_asc"${search.sort === 'price_asc' ? ' selected' : ''}>Price: low to high</option><option value="price_desc"${search.sort === 'price_desc' ? ' selected' : ''}>Price: high to low</option></select></div>
    <div class="col-12 col-lg-2"><button class="btn btn-primary w-100" type="submit"><i class="bi bi-search me-2" aria-hidden="true"></i>Update search</button></div>
  </div><p class="form-error mb-0" id="results-error" role="alert" hidden></p></form>`;
}

function contextParams(search, extra = {}) {
  return new URLSearchParams({ ...Object.fromEntries(Object.entries(search).filter(([key, value]) => value && !['nights', 'page'].includes(key))), ...extra });
}

function card({ hotel, roomTypes = [], search, indicativeRate, coverPath, coverAlt, dateMode }) {
  const coverUrl = coverPath ? (/^https?:\/\//i.test(coverPath) ? coverPath : supabaseClient.storage.from('hotel-images').getPublicUrl(coverPath).data.publicUrl) : null;
  const image = coverUrl ? `<img src="${escape(coverUrl)}" alt="${escape(coverAlt || `${hotel.name} cover`)}" loading="lazy">` : `<div class="hotel-card__fallback" role="img" aria-label="${escape(hotel.name)} image unavailable"><i class="bi bi-image" aria-hidden="true"></i><span>Image coming soon</span></div>`;
  const summaries = roomTypes.map((room) => `<li><span>${escape(room.room_type_name || room.name)}</span><span>${dateMode ? `${room.available_rooms} available` : `up to ${room.capacity} guests`}</span></li>`).join('');
  const rate = indicativeRate ?? roomTypes.reduce((min, room) => Math.min(min, Number(room.nightly_rate)), Number.POSITIVE_INFINITY);
  const price = Number.isFinite(rate) ? `From €${rate.toFixed(2)} / night` : 'Pricing shown after selecting a room';
  const link = `/hotel/?${contextParams(search, { hotel_id: hotel.id }).toString()}`;
  const totalPrice = roomTypes.length ? Math.min(...roomTypes.map((room) => Number(room.total_price)).filter(Number.isFinite)) : null;
  return `<article class="hotel-card"><div class="hotel-card__media">${image}</div><div class="hotel-card__body"><span class="badge badge-soft mb-3">${dateMode ? 'Available for your dates' : 'Published property'}</span><h2 class="hotel-card__title h5">${escape(hotel.name)}</h2><p class="text-secondary mb-3"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${escape(hotel.city)}, ${escape(hotel.country)}</p>${dateMode ? `<p class="small text-secondary mb-2">${search.nights} nights · ${search.guests} guests</p><ul class="room-summary">${summaries}</ul><p class="price mb-3">€${Number.isFinite(totalPrice) ? totalPrice.toFixed(2) : '—'} total stay</p>` : `<p class="price mb-3"><span class="small fw-normal text-secondary">Indicative </span>${escape(price)}</p>`}<a class="btn btn-outline-primary" href="${link}">View hotel</a></div></article>`;
}

function renderPager(search, totalCount) {
  const pages = Math.max(Math.ceil(totalCount / pageSize), 1);
  if (pages <= 1) return '';
  const links = Array.from({ length: pages }, (_, index) => index + 1).map((page) => `<a class="page-link${page === search.page ? ' active' : ''}" href="/hotels/?${contextParams(search, { page }).toString()}" aria-label="Page ${page}"${page === search.page ? ' aria-current="page"' : ''}>${page}</a>`).join('');
  return `<nav class="mt-4" aria-label="Hotel results pages"><ul class="pagination justify-content-center">${links}</ul></nav>`;
}

async function loadResults(search) {
  const result = document.querySelector('#hotel-results');
  result.innerHTML = renderLoadingSkeleton(3);
  const dateMode = Boolean(search.check_in && search.check_out);
  if (dateMode) {
    const { data: rows, error } = await supabaseClient.rpc('search_availability_page', { p_check_in: search.check_in, p_check_out: search.check_out, p_guest_count: Number(search.guests), p_destination: search.destination || null, p_max_nightly_rate: search.max_price ? Number(search.max_price) : null, p_sort: search.sort, p_page: search.page, p_page_size: pageSize });
    if (error) { result.innerHTML = renderEmptyState({ title: 'Search is unavailable', message: 'We could not load availability right now. Please try again.' }); return; }
    const grouped = new Map();
    (rows || []).forEach((row) => { if (!grouped.has(row.hotel_id)) grouped.set(row.hotel_id, { hotel: { id: row.hotel_id, name: row.hotel_name, city: row.city, country: row.country }, roomTypes: [], totalCount: Number(row.total_count || 0) }); grouped.get(row.hotel_id).roomTypes.push(row); });
    const groups = [...grouped.values()];
    const totalCount = Number(rows?.[0]?.total_count || 0);
    if (!groups.length) { result.innerHTML = renderEmptyState({ title: 'No stays match those details', message: 'Try different dates, a wider destination, or a higher nightly price.' }); return; }
    const ids = groups.map((group) => group.hotel.id);
    const { data: images, error: imageError } = await supabaseClient.from('hotel_images').select('hotel_id,storage_path,alt_text,position,is_cover').in('hotel_id', ids).order('is_cover', { ascending: false }).order('position', { ascending: true });
    if (imageError) { result.innerHTML = renderEmptyState({ title: 'Results loaded without images', message: 'Hotel availability is available, but images could not be loaded.' }); return; }
    const imageMap = new Map(); (images || []).forEach((image) => { if (!imageMap.has(image.hotel_id)) imageMap.set(image.hotel_id, image); });
    result.innerHTML = `<div class="results-summary mb-3"><strong>${totalCount}</strong> matching hotel${totalCount === 1 ? '' : 's'} · ${search.nights} nights · ${search.guests} guests</div><div class="row g-4">${groups.map((group) => { const image = imageMap.get(group.hotel.id); return `<div class="col-md-6 col-xl-4">${card({ hotel: group.hotel, roomTypes: group.roomTypes, search, coverPath: image?.storage_path, coverAlt: image?.alt_text, dateMode: true })}</div>`; }).join('')}</div>${renderPager(search, totalCount)}`;
    return;
  }
  const { data, error } = await supabaseClient.rpc('published_hotels_page', { p_destination: search.destination || null, p_max_nightly_rate: search.max_price ? Number(search.max_price) : null, p_sort: search.sort, p_page: search.page, p_page_size: pageSize });
  if (error) { result.innerHTML = renderEmptyState({ title: 'Hotels are unavailable', message: 'We could not load published hotels right now. Please try again.' }); return; }
  const totalCount = Number(data?.[0]?.total_count || 0);
  if (!data?.length) { result.innerHTML = renderEmptyState({ title: 'No published hotels match', message: 'Try a different destination or remove the nightly price filter.' }); return; }
  result.innerHTML = `<div class="results-summary mb-3"><strong>${totalCount}</strong> published hotel${totalCount === 1 ? '' : 's'} · Indicative prices only until dates are selected.</div><div class="row g-4">${data.map((row) => `<div class="col-md-6 col-xl-4">${card({ hotel: { id: row.hotel_id, name: row.hotel_name, city: row.city, country: row.country }, search, indicativeRate: Number(row.indicative_nightly_rate), coverPath: row.cover_path, coverAlt: row.cover_alt, dateMode: false })}</div>`).join('')}</div>${renderPager(search, totalCount)}`;
}

function attachForm(search) {
  const form = document.querySelector('#results-search');
  const today = todayLocalIso(); form.elements.check_in.min = today; form.elements.check_out.min = today;
  form.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(form); const next = { destination: String(data.get('destination') || '').trim(), check_in: String(data.get('check_in') || ''), check_out: String(data.get('check_out') || ''), guests: String(data.get('guests') || ''), max_price: String(data.get('max_price') || ''), sort: String(data.get('sort') || 'name'), page: 1 }; const parsed = parseSearchFromObject(next); const error = document.querySelector('#results-error'); if (parsed.error) { error.textContent = parsed.error; error.hidden = false; return; } window.location.assign(`/hotels/?${contextParams(parsed.search).toString()}`); });
}

function parseSearchFromObject(search) { const dates = Boolean(search.check_in || search.check_out); if (dates && (!search.check_in || !search.check_out)) return { search, error: 'Choose both check-in and check-out dates.' }; if (dates && search.check_out <= search.check_in) return { search, error: 'Check-out must be after check-in.' }; if (dates) { const nights = Math.round((Date.parse(`${search.check_out}T00:00:00`) - Date.parse(`${search.check_in}T00:00:00`)) / 86400000); if (nights > maxStayNights) return { search, error: `Stays can be up to ${maxStayNights} nights.` }; if (search.check_in < todayLocalIso()) return { search, error: 'Check-in cannot be before today.' }; if (!Number.isInteger(Number(search.guests)) || Number(search.guests) <= 0) return { search, error: 'Guests must be a positive whole number.' }; } if (search.max_price && (!Number.isFinite(Number(search.max_price)) || Number(search.max_price) < 0)) return { search, error: 'Maximum nightly price must be zero or more.' }; if (!['name', 'price_asc', 'price_desc'].includes(search.sort)) return { search, error: 'Choose a supported sort option.' }; return { search: { ...search, nights: dates ? Math.round((Date.parse(`${search.check_out}T00:00:00`) - Date.parse(`${search.check_in}T00:00:00`)) / 86400000) : 0 }, error: '' }; }

const parsed = parseSearch();
app.innerHTML = `${renderNavigation({ active: 'Hotels' })}<main class="page-shell section"><div class="page-container"><div class="section-heading"><span class="eyebrow">StayEasy search</span><h1>Find your next stay</h1><p class="text-secondary mb-0">Search published properties or add dates to see aggregate room availability.</p></div>${searchForm(parsed.search)}${parsed.error ? `<div class="state-card mt-4" role="alert"><i class="bi bi-exclamation-circle" aria-hidden="true"></i><h2 class="h4 mt-3">Search details need attention</h2><p class="text-secondary mb-0">${escape(parsed.error)}</p></div>` : '<div id="hotel-results" class="mt-5"></div>'}</div></main>${renderFooter()}`;
if (!parsed.error) { attachForm(parsed.search); loadResults(parsed.search); }
