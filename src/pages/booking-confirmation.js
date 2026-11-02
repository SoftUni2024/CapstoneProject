import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState } from '../components/ui.js';

const app = document.querySelector('#app');
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

async function main() {
  const sessionResult = await supabaseClient.auth.getSession();
  if (!sessionResult.data.session) { window.location.assign(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
  const id = getQueryParams().get('id');
  app.innerHTML = `${renderNavigation({ active: 'My bookings' })}<main class="page-shell section"><div class="page-container"><div class="booking-confirmation-card">${id ? '<p class="text-secondary mb-0">Loading your saved booking…</p>' : renderEmptyState({ title: 'Confirmation unavailable', message: 'This confirmation link is missing its booking reference.' })}</div></div></main>${renderFooter()}`;
  if (!id) return;
  const { data: booking, error } = await supabaseClient.from('bookings').select('id,unique_reference,check_in,check_out,guest_count,status,nightly_rate_snapshot,total_price,currency,guest_name,hotel_name_snapshot,room_type_name_snapshot,created_at').eq('id', id).maybeSingle();
  const card = document.querySelector('.booking-confirmation-card');
  if (error || !booking) { card.innerHTML = renderEmptyState({ title: 'Booking not found', message: 'This booking is not available for the signed-in account.' }); return; }
  document.title = `Booking ${booking.unique_reference} | StayEasy`;
  card.innerHTML = `<div class="confirmation-icon"><i class="bi bi-check2-circle" aria-hidden="true"></i></div><span class="eyebrow">Reservation saved</span><h1>Booking confirmed</h1><p class="lead text-secondary">Your reservation has been saved. Payment is handled directly at the hotel.</p><div class="confirmation-reference"><span>Reference</span><strong>${escape(booking.unique_reference)}</strong></div><dl class="booking-facts confirmation-facts"><div><dt>Property</dt><dd>${escape(booking.hotel_name_snapshot)}</dd></div><div><dt>Room type</dt><dd>${escape(booking.room_type_name_snapshot)}</dd></div><div><dt>Stay</dt><dd>${escape(booking.check_in)} → ${escape(booking.check_out)}</dd></div><div><dt>Guests</dt><dd>${booking.guest_count}</dd></div><div><dt>Nightly rate</dt><dd>€${Number(booking.nightly_rate_snapshot).toFixed(2)}</dd></div><div><dt>Total</dt><dd>€${Number(booking.total_price).toFixed(2)} ${escape(booking.currency)}</dd></div></dl><div class="d-flex flex-wrap justify-content-center gap-2 mt-4"><a class="btn btn-primary" href="/booking-details/?id=${encodeURIComponent(booking.id)}">Booking details</a><a class="btn btn-outline-primary" href="/my-bookings/">My bookings</a></div>`;
}

main();
