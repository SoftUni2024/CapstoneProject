import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState, showConfirmation, showToast } from '../components/ui.js';

const app = document.querySelector('#app');
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
let requestKey = 'stayeasy-booking-request';
let bookingContext;
let latestQuoteToken = 0;
let submitting = false;

function todayLocalIso() { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); }
function nightsBetween(checkIn, checkOut) { return Math.round((Date.parse(`${checkOut}T00:00:00`) - Date.parse(`${checkIn}T00:00:00`)) / 86400000); }
function getRequestId() { const saved = localStorage.getItem(requestKey); if (saved) return saved; const id = crypto.randomUUID(); localStorage.setItem(requestKey, id); return id; }
function preserveRequestId(id) { localStorage.setItem(requestKey, id); }
function clearRequestId() { localStorage.removeItem(requestKey); }

function validateStay(stay) {
  if (!stay.check_in || !stay.check_out) return 'Choose check-in and check-out dates.';
  if (stay.check_in < todayLocalIso()) return 'Check-in cannot be before today.';
  if (stay.check_out <= stay.check_in) return 'Check-out must be after check-in.';
  if (nightsBetween(stay.check_in, stay.check_out) > 30) return 'Stays can be up to 30 nights.';
  if (!Number.isInteger(Number(stay.guests)) || Number(stay.guests) <= 0) return 'Guests must be a positive whole number.';
  return '';
}

async function loadContext(roomTypeId) {
  const { data, error } = await supabaseClient.from('room_types').select('id,name,description,capacity,nightly_rate,currency,is_active,hotels!inner(id,name,city,country,is_active)').eq('id', roomTypeId).eq('is_active', true).eq('hotels.is_active', true).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadProfile(userId) {
  const { data } = await supabaseClient.from('profiles').select('display_name,phone').eq('id', userId).maybeSingle();
  return data || {};
}

async function loadQuote(search, token) {
  const errorElement = document.querySelector('#booking-error');
  const error = validateStay(search);
  if (error) { errorElement.textContent = error; errorElement.hidden = false; updateQuote(null); return; }
  errorElement.hidden = true;
  updateQuoteLoading();
  const { data, error: quoteError } = await supabaseClient.rpc('quote_booking', { p_room_type_id: bookingContext.roomType.id, p_check_in: search.check_in, p_check_out: search.check_out, p_guest_count: Number(search.guests) });
  if (token !== latestQuoteToken) return;
  if (quoteError) { errorElement.textContent = 'We could not refresh the quote. Try again.'; errorElement.hidden = false; updateQuote(null); return; }
  const quote = data?.[0] || null;
  updateQuote(quote);
}

function updateQuoteLoading() { document.querySelector('#quote-panel').innerHTML = '<span class="text-secondary">Refreshing current quote…</span>'; document.querySelector('#submit-booking').disabled = true; }
function updateQuote(quote) {
  bookingContext.quote = quote;
  const panel = document.querySelector('#quote-panel');
  if (!quote) { panel.innerHTML = '<span class="text-secondary">No available stay quote for these details.</span>'; document.querySelector('#submit-booking').disabled = true; return; }
  panel.innerHTML = `<span>Current quote</span><strong>€${Number(quote.total_price).toFixed(2)}</strong><small>€${Number(quote.nightly_rate).toFixed(2)} × ${quote.nights} nights · ${bookingContext.search.guests} guests</small><small>${quote.available_rooms} room${Number(quote.available_rooms) === 1 ? '' : 's'} currently available</small>`;
  document.querySelector('#submit-booking').disabled = false;
}

function renderPage(profile) {
  const room = bookingContext.roomType;
  const search = bookingContext.search;
  app.innerHTML = `${renderNavigation({ active: 'Hotels' })}<main class="page-shell section"><div class="page-container booking-layout"><div class="booking-heading"><button class="btn btn-link p-0" id="discard-booking" type="button">← Back to hotel</button><span class="eyebrow d-block mt-4">Review your stay</span><h1>Complete your reservation</h1><p class="text-secondary">Review the current quote before reserving. Payment is handled directly at the hotel.</p></div><div class="booking-grid"><section class="booking-summary"><span class="badge badge-soft mb-3">Pay at the hotel</span><h2 class="h4">${escape(room.hotels.name)}</h2><p class="text-secondary mb-4">${escape(room.hotels.city)}, ${escape(room.hotels.country)} · ${escape(room.name)}</p><dl class="booking-facts"><div><dt>Stay</dt><dd>${escape(search.check_in)} → ${escape(search.check_out)}</dd></div><div><dt>Nights</dt><dd>${nightsBetween(search.check_in, search.check_out)}</dd></div><div><dt>Guests</dt><dd>${escape(search.guests)}</dd></div><div><dt>Rate</dt><dd>Current EUR quote</dd></div></dl><div class="quote-box" id="quote-panel"><span class="text-secondary">Loading current quote…</span></div><p class="small text-secondary mt-3 mb-0">No payment is collected online. Payment arrangements are made with the property. Guests can cancel before the hotel-local check-in date.</p></section><section class="booking-form-card"><form id="booking-form" novalidate><div><label class="form-label" for="guest_name">Guest name</label><input class="form-control" id="guest_name" name="guest_name" value="${escape(profile.display_name || '')}" maxlength="120" required><p class="field-error" data-error-for="guest_name" hidden></p></div><div><label class="form-label" for="contact_phone">Phone <span class="text-secondary fw-normal">(optional)</span></label><input class="form-control" id="contact_phone" name="contact_phone" type="tel" value="${escape(profile.phone || '')}" maxlength="40"><p class="field-error" data-error-for="contact_phone" hidden></p></div><div><label class="form-label" for="special_requests">Special requests <span class="text-secondary fw-normal">(optional)</span></label><textarea class="form-control" id="special_requests" name="special_requests" rows="4" maxlength="1000"></textarea><p class="field-error" data-error-for="special_requests" hidden></p></div><p class="form-error mb-0" id="booking-error" role="alert" hidden></p><button class="btn btn-primary w-100" id="submit-booking" type="submit" disabled>Reserve stay</button></form></section></div></div></main>${renderFooter()}`;
  attachHandlers();
}

function setFieldError(name, message) { const field = document.querySelector(`#${name}`); const error = document.querySelector(`[data-error-for="${name}"]`); field.classList.toggle('is-invalid', Boolean(message)); error.textContent = message || ''; error.hidden = !message; }
function readForm() { const data = new FormData(document.querySelector('#booking-form')); return { guest_name: String(data.get('guest_name') || '').trim(), contact_phone: String(data.get('contact_phone') || '').trim(), special_requests: String(data.get('special_requests') || '').trim() }; }
function validateForm(values) { setFieldError('guest_name', values.guest_name ? '' : 'Enter the guest name.'); if (values.contact_phone.length > 40) setFieldError('contact_phone', 'Phone number is too long.'); else setFieldError('contact_phone', ''); return Boolean(values.guest_name && values.contact_phone.length <= 40); }

async function reconcile(requestId, userId) { const { data } = await supabaseClient.from('bookings').select('id').eq('request_id', requestId).eq('user_id', userId).maybeSingle(); return data; }

async function submitBooking(event) {
  event.preventDefault();
  if (submitting) return;
  const values = readForm();
  if (!validateForm(values) || !bookingContext.quote) { showToast('Review the highlighted fields and current availability.', { title: 'Booking needs attention', variant: 'warning' }); return; }
  submitting = true;
  const button = document.querySelector('#submit-booking'); button.disabled = true; button.textContent = 'Reserving…';
  const requestId = getRequestId(); preserveRequestId(requestId);
  const { data, error } = await supabaseClient.rpc('create_booking', { p_room_type_id: bookingContext.roomType.id, p_check_in: bookingContext.search.check_in, p_check_out: bookingContext.search.check_out, p_guest_count: Number(bookingContext.search.guests), p_guest_name: values.guest_name, p_contact_phone: values.contact_phone || 'Not provided', p_special_requests: values.special_requests || null, p_request_id: requestId, p_expected_nightly_rate: bookingContext.quote.nightly_rate, p_expected_total_price: bookingContext.quote.total_price });
  if (error) {
    const persisted = await reconcile(requestId, bookingContext.user.id);
    if (persisted) { window.location.assign(`/booking-confirmation/?id=${encodeURIComponent(persisted.id)}`); return; }
    showToast('The booking did not return a confirmation. Your request is still available to retry safely.', { title: 'Connection issue', variant: 'danger' });
    submitting = false; button.disabled = false; button.textContent = 'Reserve stay'; return;
  }
  if (data?.status === 'requote_required') { showToast('The rate changed. Review the refreshed quote before trying again.', { title: 'Quote changed', variant: 'warning' }); bookingContext.search = { ...bookingContext.search }; await loadQuote(bookingContext.search, ++latestQuoteToken); submitting = false; return; }
  if (data?.status === 'unavailable') { showToast('That room type is no longer available for these dates.', { title: 'No availability', variant: 'warning' }); await loadQuote(bookingContext.search, ++latestQuoteToken); submitting = false; return; }
  if (data?.booking?.id) { clearRequestId(); window.location.assign(`/booking-confirmation/?id=${encodeURIComponent(data.booking.id)}`); return; }
  showToast('We could not confirm the booking. Retry with the same request safely.', { title: 'Booking not confirmed', variant: 'danger' }); submitting = false; button.disabled = false; button.textContent = 'Reserve stay';
}

function attachHandlers() {
  document.querySelector('#booking-form').addEventListener('submit', submitBooking);
  document.querySelector('#discard-booking').addEventListener('click', async () => { if (await showConfirmation({ title: 'Discard this reservation?', message: 'Your entered guest details will be discarded.', confirmLabel: 'Discard' })) window.location.assign(`/hotel/?id=${encodeURIComponent(bookingContext.roomType.hotels.id)}&${new URLSearchParams(bookingContext.search).toString()}`); });
  ['check_in', 'check_out', 'guests'].forEach((name) => document.querySelector(`#${name}`)?.addEventListener('change', () => { const form = document.querySelector('#booking-form'); const data = new FormData(form); bookingContext.search = { ...bookingContext.search, check_in: String(data.get('check_in') || bookingContext.search.check_in), check_out: String(data.get('check_out') || bookingContext.search.check_out), guests: String(data.get('guests') || bookingContext.search.guests) }; }));
}

async function main() {
  const params = getQueryParams(); const roomTypeId = params.get('room_type_id'); const sessionResult = await supabaseClient.auth.getSession();
  if (!sessionResult.data.session) { window.location.assign(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
  if (!roomTypeId) { app.innerHTML = `${renderNavigation({ active: 'Hotels' })}<main class="page-shell section"><div class="page-container">${renderEmptyState({ title: 'Booking details are missing', message: 'Return to a hotel and choose a room type before booking.' })}</div></main>${renderFooter()}`; return; }
  bookingContext = { user: sessionResult.data.session.user, search: { check_in: params.get('check_in') || '', check_out: params.get('check_out') || '', guests: params.get('guests') || '2' } };
  requestKey = `stayeasy-booking-request:${roomTypeId}:${bookingContext.search.check_in}:${bookingContext.search.check_out}:${bookingContext.search.guests}`;
  try { bookingContext.roomType = await loadContext(roomTypeId); } catch { bookingContext.roomType = null; }
  if (!bookingContext.roomType) { app.innerHTML = `${renderNavigation({ active: 'Hotels' })}<main class="page-shell section"><div class="page-container">${renderEmptyState({ title: 'Room type unavailable', message: 'This room type is not currently eligible for booking.' })}</div></main>${renderFooter()}`; return; }
  const profile = await loadProfile(bookingContext.user.id); renderPage(profile); await loadQuote(bookingContext.search, ++latestQuoteToken);
}

main();
