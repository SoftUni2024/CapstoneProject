import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter, getQueryParams } from '../utils/navigation.js';
import { renderEmptyState, renderLoadingSkeleton } from '../components/ui.js';

const app = document.querySelector('#app');
const pageSize = 8;
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function image(path, alt, name) { return path && /^https?:\/\//i.test(path) ? `<img src="${escape(path)}" alt="${escape(alt || name)}" loading="lazy">` : `<div class="hotel-card__fallback booking-image-fallback" role="img" aria-label="${escape(name)} image unavailable"><i class="bi bi-image" aria-hidden="true"></i><span>Image coming soon</span></div>`; }
function pager(filter, page, total) { const pages = Math.ceil(total / pageSize); if (pages <= 1) return ''; return `<nav class="mt-4" aria-label="Booking pages"><ul class="pagination justify-content-center">${Array.from({ length: pages }, (_, i) => i + 1).map((number) => `<li class="page-item"><a class="page-link${number === page ? ' active' : ''}" href="/my-bookings/?filter=${filter}&page=${number}" aria-current="${number === page ? 'page' : 'false'}">${number}</a></li>`).join('')}</ul></nav>`; }

async function main() {
  const session = await supabaseClient.auth.getSession();
  if (!session.data.session) { window.location.assign(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
  const params = getQueryParams(); const filter = ['upcoming', 'past', 'cancelled', 'all'].includes(params.get('filter')) ? params.get('filter') : 'upcoming'; const page = Math.max(Number(params.get('page') || 1), 1);
  app.innerHTML = `${renderNavigation({ active: 'My bookings' })}<main class="page-shell section"><div class="page-container"><div class="section-heading"><span class="eyebrow">Your account</span><h1>My bookings</h1><p class="text-secondary mb-0">View reservations saved for your account. Confirmed means reserved; it does not mean the stay is complete.</p></div><div class="booking-tabs" role="tablist" aria-label="Booking filters">${[['upcoming','Upcoming / current'],['past','Past'],['cancelled','Cancelled'],['all','All']].map(([value,label]) => `<a class="btn ${filter === value ? 'btn-primary' : 'btn-outline-primary'}" href="/my-bookings/?filter=${value}" role="tab" aria-selected="${filter === value}">${label}</a>`).join('')}</div><div id="booking-results" class="mt-4">${renderLoadingSkeleton(3)}</div></div></main>${renderFooter()}`;
  const { data, error } = await supabaseClient.rpc('my_bookings_page', { p_filter: filter, p_page: page, p_page_size: pageSize });
  const container = document.querySelector('#booking-results');
  if (error) { container.innerHTML = renderEmptyState({ title: 'Bookings are unavailable', message: 'We could not load your reservations right now.' }); return; }
  if (!data?.length) { container.innerHTML = renderEmptyState({ title: filter === 'upcoming' ? 'No upcoming bookings' : 'No bookings in this view', message: 'Reservations saved to this account will appear here.' }); return; }
  const total = Number(data[0].total_count || 0);
  container.innerHTML = `<div class="results-summary mb-3"><strong>${total}</strong> reservation${total === 1 ? '' : 's'}</div><div class="booking-list">${data.map((booking) => `<article class="booking-list-card"><div class="booking-list-card__image">${image(booking.cover_path, booking.cover_alt, booking.hotel_name)}</div><div class="booking-list-card__body"><div class="d-flex flex-wrap justify-content-between gap-2"><div><span class="badge ${booking.status === 'cancelled' ? 'text-bg-secondary' : 'badge-soft'}">${booking.status === 'cancelled' ? 'Cancelled' : booking.stay_category === 'past' ? 'Past stay' : 'Confirmed'}</span><h2 class="h5 mt-2 mb-1">${escape(booking.hotel_name)}</h2><p class="text-secondary mb-2">${escape(booking.city)} · ${escape(booking.room_type_name)}</p></div><strong class="booking-reference">${escape(booking.unique_reference)}</strong></div><div class="booking-list-card__facts"><span><i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${escape(booking.check_in)} → ${escape(booking.check_out)}</span><span><i class="bi bi-people me-1" aria-hidden="true"></i>${booking.guest_count} guests</span><span><i class="bi bi-cash-coin me-1" aria-hidden="true"></i>€${Number(booking.total_price).toFixed(2)} ${escape(booking.currency)}</span></div><a class="btn btn-outline-primary mt-3" href="/booking-details/?id=${encodeURIComponent(booking.booking_id)}">View details</a></div></article>`).join('')}</div>${pager(filter, page, total)}`;
}

main();
