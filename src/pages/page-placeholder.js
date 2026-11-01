import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { mountPage } from '../components/page.js';

const page = document.body.dataset.page;
const pages = {
  home: ['Home', 'Find your next stay', 'Search comfortable hotels and manage your reservations in one place.', 'Home'],
  hotels: ['Hotels', 'Browse hotels', 'Availability search and hotel results will appear here.', 'Hotels'],
  hotel: ['Hotel details', 'Hotel details', 'Room types, images, and availability will appear here.', 'Hotels'],
  login: ['Log in', 'Welcome back', 'Guest authentication will be available here.', ''],
  register: ['Register', 'Create your account', 'Guest registration will be available here.', ''],
  booking: ['Booking', 'Complete your booking', 'Reservation details and pay-at-hotel confirmation will appear here.', 'Hotels'],
  bookingConfirmation: ['Booking confirmation', 'Booking confirmed', 'Your confirmed reservation summary will appear here.', 'My bookings'],
  myBookings: ['My bookings', 'Your bookings', 'Your booking history and eligible cancellations will appear here.', 'My bookings'],
  bookingDetails: ['Booking details', 'Reservation details', 'The selected reservation details will appear here.', 'My bookings'],
  account: ['Account', 'Your account', 'Account settings will appear here.', 'Account'],
  admin: ['Admin', 'Administration', 'Admin management tools will appear here.', 'Admin'],
  adminHotels: ['Admin hotels', 'Manage hotels', 'Hotel management will appear here.', 'Admin'],
  adminHotelEdit: ['Edit hotel', 'Edit hotel', 'Hotel editing will appear here.', 'Admin'],
  adminRooms: ['Admin rooms', 'Manage rooms', 'Room type and physical room management will appear here.', 'Admin'],
  adminBookings: ['Admin bookings', 'Manage bookings', 'Reservation management will appear here.', 'Admin']
};

const [title, heading, description, active] = pages[page] ?? pages.home;
mountPage({ title, heading, description, active });
