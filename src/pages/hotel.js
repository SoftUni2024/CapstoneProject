import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState, renderLoadingSkeleton } from '../components/ui.js';

const app = document.querySelector('#app');
const maxStayNights = 30;
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function todayLocalIso() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function searchFromUrl() {
  const params = getQueryParams();
  return { check_in: params.get('check_in') || '', check_out: params.get('check_out') || '', guests: params.get('guests') || '2' };
}

function validateSearch(search) {
  const hasDates = Boolean(search.check_in || search.check_out);
  if (!hasDates) return '';
  if (!search.check_in || !search.check_out) return 'Choose both check-in and check-out dates.';
  if (search.check_out <= search.check_in) return 'Check-out must be after check-in.';
  if (search.check_in < todayLocalIso()) return 'Check-in cannot be before today.';
  const nights = Math.round((Date.parse(`${search.check_out}T00:00:00`) - Date.parse(`${search.check_in}T00:00:00`)) / 86400000);
  if (nights > maxStayNights) return `Stays can be up to ${maxStayNights} nights.`;
  if (!Number.isInteger(Number(search.guests)) || Number(search.guests) <= 0) return 'Guests must be a positive whole number.';
  return '';
}

function searchForm(search) {
  return `<form class="search-panel detail-search" id="detail-search" novalidate><div class="row g-3 align-items-end"><div class="col-6 col-lg-4"><label class="form-label" for="check_in">Check-in</label><input class="form-control" id="check_in" name="check_in" type="date" value="${escape(search.check_in)}"></div><div class="col-6 col-lg-4"><label class="form-label" for="check_out">Check-out</label><input class="form-control" id="check_out" name="check_out" type="date" value="${escape(search.check_out)}"></div><div class="col-6 col-lg-2"><label class="form-label" for="guests">Guests</label><input class="form-control" id="guests" name="guests" type="number" min="1" step="1" value="${escape(search.guests)}"></div><div class="col-6 col-lg-2"><button class="btn btn-primary w-100" type="submit">Check availability</button></div></div><p class="form-error mb-0" id="detail-error" role="alert" hidden></p></form>`;
}

function imageMarkup(image, hotelName, className = '') {
  if (image?.storage_path) { const url = /^https?:\/\//i.test(image.storage_path) ? image.storage_path : supabaseClient.storage.from('hotel-images').getPublicUrl(image.storage_path).data.publicUrl; return `<img class="${className}" src="${escape(url)}" alt="${escape(image.alt_text || `${hotelName} image`)}" loading="lazy">`; }
  return `<div class="hotel-card__fallback detail-image-fallback" role="img" aria-label="${escape(hotelName)} image unavailable"><i class="bi bi-image" aria-hidden="true"></i><span>Image coming soon</span></div>`;
}

function renderGallery(hotel, images) {
  if (!images.length) return `<div class="detail-gallery detail-gallery--empty">${imageMarkup(null, hotel.name)}</div>`;
  return `<div class="detail-gallery" aria-label="Images of ${escape(hotel.name)}">${images.map((image) => `<figure class="detail-gallery__item">${imageMarkup(image, hotel.name, 'detail-gallery__image')}${image.alt_text ? `<figcaption>${escape(image.alt_text)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}

function reservationTarget(roomTypeId, search) {
  return `/booking/?${new URLSearchParams({ room_type_id: roomTypeId, check_in: search.check_in, check_out: search.check_out, guests: search.guests }).toString()}`;
}

function renderRoomCard(room, quote, search, hotelName) {
  const hasDates = Boolean(search.check_in && search.check_out);
  const suitable = !hasDates || (quote && Number(quote.available_rooms) > 0);
  const currentQuote = quote && suitable ? `<div class="quote-box"><span>Current stay quote</span><strong>€${Number(quote.total_price).toFixed(2)}</strong><small>€${Number(quote.nightly_rate).toFixed(2)} × ${quote.nights} nights · ${search.guests} guests</small></div>` : `<div class="quote-box quote-box--muted"><span>${hasDates ? 'Not available for these dates' : 'Select dates for a current quote'}</span><strong>${hasDates ? 'Unavailable' : `From €${Number(room.nightly_rate).toFixed(2)} / night`}</strong><small>${hasDates ? 'Try different dates or guest count.' : 'Indicative catalog rate · EUR'}</small></div>`;
  const action = suitable && hasDates ? `<a class="btn btn-primary" data-reserve-room="${room.id}" href="${reservationTarget(room.id, search)}">Reserve this room type</a>` : `<button class="btn btn-outline-secondary" type="button" disabled>${hasDates ? 'Unavailable' : 'Select dates to reserve'}</button>`;
  return `<article class="room-type-card"><div><span class="eyebrow">Room type</span><h3>${escape(room.name)}</h3><p class="text-secondary">${escape(room.description || 'A published room option at this property.')}</p><p class="small mb-0"><i class="bi bi-people me-1" aria-hidden="true"></i>Up to ${room.capacity} guests</p></div>${currentQuote}<div class="room-type-card__action">${action}</div></article>`;
}

async function loadHotel(hotelId) {
  const { data, error } = await supabaseClient.from('hotels').select('id,name,description,city,country,adress,room_types(id,name,description,capacity,nightly_rate,currency,is_active),hotel_images(id,storage_path,alt_text,position,is_cover)').eq('id', hotelId).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.room_types = (data.room_types || []).filter((room) => room.is_active);
  data.hotel_images = (data.hotel_images || []).sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position);
  return data;
}

async function loadQuotes(hotel, search, requestToken) {
  const errorElement = document.querySelector('#detail-error');
  const hasDates = Boolean(search.check_in && search.check_out);
  if (!hasDates) { renderRooms(hotel, new Map(), search); return; }
  const error = validateSearch(search);
  if (error) { errorElement.textContent = error; errorElement.hidden = false; renderRooms(hotel, new Map(), search); return; }
  errorElement.hidden = true;
  document.querySelector('#room-results').innerHTML = renderLoadingSkeleton(Math.min(hotel.room_types.length, 3));
  const { data, error: quoteError } = await supabaseClient.rpc('search_availability', { p_check_in: search.check_in, p_check_out: search.check_out, p_guest_count: Number(search.guests), p_hotel_id: hotel.id });
  if (requestToken !== window.__hotelQuoteToken) return;
  if (quoteError) { errorElement.textContent = 'Availability could not be checked right now.'; errorElement.hidden = false; renderRooms(hotel, new Map(), search); return; }
  const quotes = new Map((data || []).map((row) => [row.room_type_id, row]));
  renderRooms(hotel, quotes, search);
}

function renderRooms(hotel, quotes, search) {
  const container = document.querySelector('#room-results');
  if (!hotel.room_types.length) { container.innerHTML = renderEmptyState({ title: 'No published room types', message: 'This property is not currently offering room types.' }); return; }
  container.innerHTML = `<div class="room-type-grid">${hotel.room_types.map((room) => renderRoomCard(room, quotes.get(room.id), search, hotel.name)).join('')}</div>`;
  document.querySelectorAll('[data-reserve-room]').forEach((link) => link.addEventListener('click', () => { link.setAttribute('aria-disabled', 'true'); }));
}

function attachSearch(hotel, search) {
  const form = document.querySelector('#detail-search');
  const today = todayLocalIso(); form.elements.check_in.min = today; form.elements.check_out.min = today;
  form.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(form); const next = { check_in: String(data.get('check_in') || ''), check_out: String(data.get('check_out') || ''), guests: String(data.get('guests') || '') }; const error = validateSearch(next); const errorElement = document.querySelector('#detail-error'); if (error) { errorElement.textContent = error; errorElement.hidden = false; return; } const params = new URLSearchParams({ id: hotel.id, ...next }); window.location.assign(`/hotel/?${params.toString()}`); });
}

async function applyLoginContext(hotel, search) {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) return;
  document.querySelectorAll('[data-reserve-room]').forEach((link) => { const target = reservationTarget(link.dataset.reserveRoom, search); link.href = `/login/?next=${encodeURIComponent(target)}`; });
}

async function main() {
  const params = getQueryParams();
  const hotelId = params.get('id') || params.get('hotel_id');
  const search = searchFromUrl();
  app.innerHTML = `${renderNavigation({ active: 'Hotels' })}<main class="page-shell section"><div class="page-container" id="hotel-content">${renderLoadingSkeleton(2)}</div></main>${renderFooter()}`;
  if (!hotelId) { document.querySelector('#hotel-content').innerHTML = renderEmptyState({ title: 'Hotel not found', message: 'This hotel link is missing its identifier.' }); return; }
  let hotel;
  try { hotel = await loadHotel(hotelId); } catch { document.querySelector('#hotel-content').innerHTML = renderEmptyState({ title: 'Hotel unavailable', message: 'We could not load this property right now.' }); return; }
  if (!hotel) { document.querySelector('#hotel-content').innerHTML = renderEmptyState({ title: 'Hotel unavailable', message: 'This property is not published or no longer available.' }); return; }
  document.title = `${hotel.name} | StayEasy`;
  document.querySelector('#hotel-content').innerHTML = `<div class="detail-header"><a class="small" href="/hotels/">← Back to hotels</a><div class="detail-header__copy"><span class="eyebrow">Published property</span><h1>${escape(hotel.name)}</h1><p class="lead mb-2">${escape(hotel.city)}, ${escape(hotel.country)}</p><p class="text-secondary mb-0"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${escape(hotel.adress)}</p></div></div>${renderGallery(hotel, hotel.hotel_images)}<section class="detail-overview"><div><h2 class="h3">About this property</h2><p class="text-secondary mb-0">${escape(hotel.description || 'A published hotel property with room options available to review.')}</p></div>${searchForm(search)}</section><section class="mt-5" aria-labelledby="rooms-title"><div class="section-heading"><span class="eyebrow">Stay options</span><h2 id="rooms-title">Room types</h2><p class="text-secondary mb-0">Indicative rates are shown until dates are selected. Current quotes are rechecked against live availability.</p></div><div id="room-results"></div></section>`;
  attachSearch(hotel, search);
  window.__hotelQuoteToken = (window.__hotelQuoteToken || 0) + 1;
  await loadQuotes(hotel, search, window.__hotelQuoteToken);
  await applyLoginContext(hotel, search);
}

main();
