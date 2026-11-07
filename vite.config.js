import { cp } from 'node:fs/promises';
import { defineConfig } from 'vite';

const pageDirectories = [
  'hotel', 'hotels', 'login', 'register', 'booking', 'booking-confirmation',
  'my-bookings', 'booking-details', 'account', 'admin',
];

function publishPageDirectories() {
  return {
    name: 'publish-page-directories',
    apply: 'build',
    async closeBundle() {
      for (const directory of pageDirectories) {
        await cp(`dist/pages/${directory}`, `dist/${directory}`, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [publishPageDirectories()],
  root: '.',
  build: {
    rollupOptions: {
      input: {
        home: 'index.html', hotels: 'pages/hotels/index.html', hotel: 'pages/hotel/index.html',
        login: 'pages/login/index.html', register: 'pages/register/index.html', booking: 'pages/booking/index.html',
        bookingConfirmation: 'pages/booking-confirmation/index.html', myBookings: 'pages/my-bookings/index.html',
        bookingDetails: 'pages/booking-details/index.html', account: 'pages/account/index.html', admin: 'pages/admin/index.html',
        adminHotels: 'pages/admin/hotels/index.html', adminHotelEdit: 'pages/admin/hotel-edit/index.html',
        adminRooms: 'pages/admin/rooms/index.html', adminBookings: 'pages/admin/bookings/index.html'
      }
    }
  }
});
