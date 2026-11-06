import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { requireAdmin } from '../services/admin.js';
import { renderNavigation, renderFooter } from '../utils/navigation.js';
import { supabaseClient } from '../services/supabase-client.js';

async function main() {
  if (!await requireAdmin()) return;
  document.title = 'Admin | StayEasy';
  document.querySelector('#app').innerHTML = `${renderNavigation({ active: 'Admin' })}<main class="page-shell section"><div class="page-container"><div class="section-heading"><span class="eyebrow">Restricted workspace</span><h1>Administration</h1><p class="text-secondary">Manage published hotel catalog data, private inventory, and reservations.</p></div><section class="admin-card-grid mb-5" id="admin-summary"><p class="text-secondary">Loading dashboard summary…</p></section><div class="admin-card-grid"><a class="admin-card" href="/admin/hotels/"><i class="bi bi-building" aria-hidden="true"></i><h2 class="h4">Hotels</h2><p class="text-secondary mb-0">Create, edit, publish, deactivate, and manage room types.</p></a><a class="admin-card" href="/admin/rooms/"><i class="bi bi-door-open" aria-hidden="true"></i><h2 class="h4">Physical rooms</h2><p class="text-secondary mb-0">Manage private inventory and room numbers.</p></a><a class="admin-card" href="/admin/bookings/"><i class="bi bi-calendar-check" aria-hidden="true"></i><h2 class="h4">Reservations</h2><p class="text-secondary mb-0">Review guest details, stay dates, status, and permitted cancellation.</p></a></div></div></main>${renderFooter()}`;
  const { data } = await supabaseClient.rpc('admin_dashboard_summary', { p_hotel_id: null, p_local_day: new Date().toISOString().slice(0, 10) });
  if (data?.[0]) { const d = data[0]; document.querySelector('#admin-summary').innerHTML = [['Published hotels', d.published_hotels], ['Active physical rooms', d.active_rooms], ['Confirmed reservations', d.confirmed_reservations], ['Arrivals today', d.arrivals], ['Departures today', d.departures], ['Confirmed booking value', `€${Number(d.confirmed_booking_value).toFixed(2)}`]].map(([label, value]) => `<div class="admin-card"><span class="eyebrow">${label}</span><strong class="display-6 d-block mt-2">${value}</strong>${label === 'Confirmed booking value' ? '<small class="text-secondary">Not collected revenue</small>' : ''}</div>`).join(''); }
}
main();
