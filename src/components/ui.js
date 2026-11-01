const icon = (name, label = '') => `<i class="bi bi-${name}" aria-hidden="true"></i>${label ? `<span class="visually-hidden">${label}</span>` : ''}`;

export function renderHotelCard({ id = '', name = 'Hotel', location = '', room_types = [], image = null, search = {} } = {}) {
  const escape = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const activeRates = room_types.filter((room) => room.is_active !== false && room.nightly_rate !== null).map((room) => Number(room.nightly_rate)).filter(Number.isFinite);
  const price = activeRates.length ? `From €${Math.min(...activeRates).toFixed(2)} / night` : 'Pricing shown after selecting a room';
  const params = new URLSearchParams({ hotel_id: id, ...Object.fromEntries(Object.entries(search).filter(([, value]) => value)) });
  const media = image ? `<img src="${escape(image.url)}" alt="${escape(image.alt)}" loading="lazy">` : `<div class="hotel-card__fallback" role="img" aria-label="${escape(name)} image unavailable"><i class="bi bi-image" aria-hidden="true"></i><span>Image coming soon</span></div>`;
  return `<article class="hotel-card"><div class="hotel-card__media">${media}</div><div class="hotel-card__body"><span class="badge badge-soft mb-3">Active property</span><h3 class="hotel-card__title h5">${escape(name)}</h3><p class="text-secondary mb-3"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${escape(location)}</p><p class="price mb-3"><span class="small fw-normal text-secondary">${activeRates.length ? 'Indicative ' : ''}</span>${escape(price)}</p><a class="btn btn-outline-primary" href="/hotel/?${params.toString()}">View hotel details</a></div></article>`;
}

export function renderLoadingSkeleton(count = 3) {
  return `<div class="row g-4" aria-label="Loading placeholder" aria-busy="true">${Array.from({ length: count }, () => '<div class="col-md-4"><div class="hotel-card placeholder-glow"><div class="hotel-card__media"><span class="placeholder col-5"></span></div><div class="hotel-card__body"><span class="placeholder col-5"></span><span class="placeholder col-9 mt-3"></span><span class="placeholder col-6 mt-3"></span></div></div></div>').join('')}</div>`;
}

export function renderEmptyState({ title = 'Nothing to show yet', message = 'Placeholder content will appear here when data is connected.' } = {}) {
  return `<div class="state-card" role="status">${icon('inbox')}<h2 class="h4 mt-3">${title}</h2><p class="text-secondary mb-0">${message}</p></div>`;
}

export function showToast(message, { title = 'Placeholder notification', variant = 'info' } = {}) {
  let container = document.querySelector('#toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'toast-container position-fixed top-0 end-0 p-3'; container.setAttribute('aria-live', 'polite'); container.setAttribute('aria-atomic', 'true'); document.body.append(container); }
  const toast = document.createElement('div'); toast.className = `toast show border-start border-4 border-${variant}`; toast.setAttribute('role', 'status');
  toast.innerHTML = `<div class="toast-header"><strong class="me-auto">${title}</strong><button type="button" class="btn-close" aria-label="Close notification"></button></div><div class="toast-body">${message}</div>`;
  toast.querySelector('button').addEventListener('click', () => toast.remove()); container.append(toast); return toast;
}

export function showConfirmation({ title = 'Confirm action', message = 'This action is not connected yet.', confirmLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div'); backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `<section class="dialog bg-white p-4" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title" class="h4">${title}</h2><p class="text-secondary">${message}</p><div class="d-flex justify-content-end gap-2"><button class="btn btn-outline-secondary" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm>${confirmLabel}</button></div></section>`;
    const close = (value) => { backdrop.remove(); document.removeEventListener('keydown', onKeydown); resolve(value); };
    const onKeydown = (event) => { if (event.key === 'Escape') close(false); };
    backdrop.querySelector('[data-cancel]').addEventListener('click', () => close(false)); backdrop.querySelector('[data-confirm]').addEventListener('click', () => close(true)); document.addEventListener('keydown', onKeydown); document.body.append(backdrop); backdrop.querySelector('[data-confirm]').focus();
  });
}
