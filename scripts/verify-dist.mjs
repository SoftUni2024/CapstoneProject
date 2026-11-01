import { access } from 'node:fs/promises';

const pages = [
  'index.html', 'hotels/index.html', 'hotel/index.html', 'login/index.html',
  'register/index.html', 'booking/index.html', 'booking-confirmation/index.html',
  'my-bookings/index.html', 'booking-details/index.html', 'account/index.html',
  'admin/index.html', 'admin/hotels/index.html', 'admin/hotel-edit/index.html',
  'admin/rooms/index.html', 'admin/bookings/index.html'
];

for (const page of pages) await access(`dist/${page}`);
console.log(`Verified ${pages.length} generated page entries in dist.`);
