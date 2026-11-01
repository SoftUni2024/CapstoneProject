import { defineConfig } from 'vite';
export default defineConfig({
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
