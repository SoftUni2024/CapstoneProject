import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { requireAdmin, escapeAdminHtml } from '../services/admin.js';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter } from '../utils/navigation.js';
import { renderEmptyState, showConfirmation, showToast } from '../components/ui.js';

async function main() {
  if (!await requireAdmin()) return;
  document.title = 'Manage hotels | StayEasy';
  document.querySelector('#app').innerHTML = `${renderNavigation({ active: 'Admin' })}<main class="page-shell section"><div class="page-container"><div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div class="section-heading mb-0"><span class="eyebrow">Admin catalog</span><h1>Hotels</h1><p class="text-secondary mb-0">Only authenticated admins can manage published properties.</p></div><a class="btn btn-primary" href="/admin/hotel-edit/">Create hotel</a></div><div id="admin-hotel-list" class="admin-list">Loading hotels…</div></div></main>${renderFooter()}`;
  await loadHotels();
}

async function loadHotels() {
  const list = document.querySelector('#admin-hotel-list');
  const { data, error } = await supabaseClient.from('hotels').select('id,name,city,country,adress,iana_timezone,is_active,room_types(id,name,is_active)').order('name');
  if (error) { list.innerHTML = renderEmptyState({ title: 'Hotels unavailable', message: 'The catalog could not be loaded.' }); return; }
  if (!data?.length) { list.innerHTML = renderEmptyState({ title: 'No hotels yet', message: 'Create the first hotel to start the catalog.' }); return; }
  list.innerHTML = data.map((hotel) => `<article class="admin-list-card"><div><span class="badge ${hotel.is_active ? 'badge-soft' : 'text-bg-secondary'}">${hotel.is_active ? 'Published' : 'Inactive'}</span><h2 class="h4 mt-2 mb-1">${escapeAdminHtml(hotel.name)}</h2><p class="text-secondary mb-2">${escapeAdminHtml(hotel.city)}, ${escapeAdminHtml(hotel.country)} · ${escapeAdminHtml(hotel.iana_timezone)}</p><p class="small text-secondary mb-0">${hotel.room_types?.length || 0} room types · ${escapeAdminHtml(hotel.adress)}</p></div><div class="d-flex flex-wrap gap-2"><a class="btn btn-outline-primary" href="/admin/hotel-edit/?id=${encodeURIComponent(hotel.id)}">Edit</a><button class="btn btn-outline-secondary" data-toggle-hotel="${hotel.id}" data-active="${hotel.is_active}" type="button">${hotel.is_active ? 'Deactivate' : 'Publish'}</button><button class="btn btn-outline-danger" data-delete-hotel="${hotel.id}" type="button">Delete</button></div></article>`).join('');
  list.querySelectorAll('[data-toggle-hotel]').forEach((button) => button.addEventListener('click', () => toggleHotel(button.dataset.toggleHotel, button.dataset.active === 'true')));
  list.querySelectorAll('[data-delete-hotel]').forEach((button) => button.addEventListener('click', () => deleteHotel(button.dataset.deleteHotel)));
}

async function toggleHotel(id, currentlyActive) { if (!await showConfirmation({ title: currentlyActive ? 'Deactivate this hotel?' : 'Publish this hotel?', message: currentlyActive ? 'The property will no longer appear in public catalog searches.' : 'The property will become visible to public visitors.', confirmLabel: currentlyActive ? 'Deactivate' : 'Publish' })) return; const { error } = await supabaseClient.from('hotels').update({ is_active: !currentlyActive }).eq('id', id); if (error) showToast('The hotel could not be updated.', { title: 'Update failed', variant: 'danger' }); else { showToast(currentlyActive ? 'Hotel deactivated.' : 'Hotel published.', { title: 'Catalog updated', variant: 'success' }); await loadHotels(); } }

async function deleteHotel(id) { if (!await showConfirmation({ title: 'Delete this hotel?', message: 'Deletion is allowed only when no related catalog or reservation records exist. Otherwise the hotel will be deactivated.', confirmLabel: 'Continue' })) return; const { error } = await supabaseClient.from('hotels').delete().eq('id', id); if (error) { const { error: deactivateError } = await supabaseClient.from('hotels').update({ is_active: false }).eq('id', id); if (deactivateError) showToast('The hotel could not be deleted or deactivated.', { title: 'Action failed', variant: 'danger' }); else showToast('The hotel has related records and was deactivated instead.', { title: 'Hotel deactivated', variant: 'info' }); } else showToast('Unreferenced hotel deleted.', { title: 'Hotel deleted', variant: 'success' }); await loadHotels(); }

main();
