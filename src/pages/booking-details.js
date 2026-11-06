import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState, showConfirmation, showToast } from '../components/ui.js';

const app = document.querySelector('#app');
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

async function loadBooking(id) {
  const { data, error } = await supabaseClient.rpc('booking_details', { p_booking_id: id });
  if (error) throw error;
  return data?.[0] || null;
}

async function loadEvents(id) {
  const { data } = await supabaseClient.from('booking_events').select('id,event_type,created_at,details').eq('booking_id', id).order('created_at', { ascending: true });
  return data || [];
}

function renderEvents(events) { return events.length ? `<ol class="event-list">${events.map((event) => `<li><span class="event-list__dot" aria-hidden="true"></span><div><strong>${escape(event.event_type.replaceAll('_', ' '))}</strong><time datetime="${escape(event.created_at)}">${new Date(event.created_at).toLocaleString()}</time></div></li>`).join('')}</ol>` : '<p class="text-secondary mb-0">No booking events are available.</p>'; }

async function cancel(id) {
  if (!await showConfirmation({ title: 'Cancel this booking?', message: 'The booking will be preserved in your history and marked cancelled. This cannot be undone.', confirmLabel: 'Cancel booking' })) return;
  const { data, error } = await supabaseClient.rpc('cancel_booking', { p_booking_id: id });
  if (error) { showToast('This booking could not be cancelled. It may already be ineligible.', { title: 'Cancellation unavailable', variant: 'danger' }); return; }
  if (data?.status === 'already_cancelled') showToast('This booking was already cancelled.', { title: 'No change', variant: 'info' });
  else showToast('The booking was cancelled and preserved in your history.', { title: 'Booking cancelled', variant: 'success' });
  await render(id);
}

async function render(id) {
  const booking = await loadBooking(id);
  const container = document.querySelector('#booking-detail-content');
  if (!booking) { container.innerHTML = renderEmptyState({ title: 'Booking not found', message: 'This reservation is not available for the signed-in account.' }); return; }
  const events = await loadEvents(id);
  document.title = `Booking ${booking.unique_reference} | StayEasy`;
  container.innerHTML = `<div class="booking-detail-heading"><a class="small" href="/my-bookings/">← Back to my bookings</a><span class="eyebrow d-block mt-4">Reservation details</span><h1>${escape(booking.hotel_name)}</h1><p class="lead text-secondary mb-0">${escape(booking.room_type_name)} · ${escape(booking.city)}, ${escape(booking.country)}</p></div><div class="booking-detail-grid"><section class="booking-summary"><div class="d-flex flex-wrap justify-content-between gap-2"><span class="badge ${booking.status === 'cancelled' ? 'text-bg-secondary' : 'badge-soft'}">${booking.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</span><strong class="booking-reference">${escape(booking.unique_reference)}</strong></div><dl class="booking-facts"><div><dt>Stay</dt><dd>${escape(booking.check_in)} → ${escape(booking.check_out)}</dd></div><div><dt>Guests</dt><dd>${booking.guest_count}</dd></div><div><dt>Guest name</dt><dd>${escape(booking.guest_name)}</dd></div><div><dt>Phone</dt><dd>${escape(booking.contact_phone || 'Not provided')}</dd></div><div><dt>Nightly rate</dt><dd>€${Number(booking.nightly_rate_snapshot).toFixed(2)}</dd></div><div><dt>Saved total</dt><dd>€${Number(booking.total_price).toFixed(2)} ${escape(booking.currency)}</dd></div></dl>${booking.special_requests ? `<div class="detail-note"><strong>Special requests</strong><p class="mb-0 mt-1">${escape(booking.special_requests)}</p></div>` : ''}<p class="small text-secondary mt-3 mb-0">Payment is handled directly at the hotel. Cancellation eligibility uses the hotel's local calendar date.</p>${booking.can_cancel ? `<button class="btn btn-outline-danger mt-4" id="cancel-booking" type="button">Cancel booking</button>` : booking.status === 'cancelled' ? '<p class="small text-secondary mt-4 mb-0">This booking has already been cancelled.</p>' : '<p class="small text-secondary mt-4 mb-0">This booking can no longer be cancelled under the hotel-local cancellation rule.</p>'}</section><aside class="event-card"><span class="eyebrow">Authorized history</span><h2 class="h4 mt-2">Booking events</h2>${renderEvents(events)}</aside></div>`;
  document.querySelector('#cancel-booking')?.addEventListener('click', () => cancel(id));
}

async function main() {
  const session = await supabaseClient.auth.getSession();
  if (!session.data.session) { window.location.assign(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
  const id = getQueryParams().get('id');
  app.innerHTML = `${renderNavigation({ active: 'My bookings' })}<main class="page-shell section"><div class="page-container" id="booking-detail-content">${id ? '<p class="text-secondary">Loading reservation…</p>' : renderEmptyState({ title: 'Booking details are missing', message: 'Choose a reservation from My Bookings.' })}</div></main>${renderFooter()}`;
  if (id) { try { await render(id); } catch { document.querySelector('#booking-detail-content').innerHTML = renderEmptyState({ title: 'Booking details are unavailable', message: 'We could not load this reservation right now.' }); } }
}

main();
