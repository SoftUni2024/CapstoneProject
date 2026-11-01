import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderNavigation, renderFooter } from '../utils/navigation.js';
import { renderEmptyState, renderHotelCard, renderLoadingSkeleton } from '../components/ui.js';

const app = document.querySelector('#app');
const maxStayNights = 30;

function todayLocalIso() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function renderSearchForm() {
  return `<form class="search-panel" id="home-search" novalidate>
    <div class="search-panel__heading"><span class="eyebrow">Plan your stay</span><h2 class="h4 mb-1">Where would you like to go?</h2><p class="small text-secondary mb-0">Search live hotel availability in a few details.</p></div>
    <div class="row g-3 align-items-end">
      <div class="col-12 col-lg-3"><label class="form-label" for="destination">Destination</label><input class="form-control" id="destination" name="destination" type="search" placeholder="City or hotel" autocomplete="off"></div>
      <div class="col-6 col-lg-2"><label class="form-label" for="check_in">Check-in</label><input class="form-control" id="check_in" name="check_in" type="date" required></div>
      <div class="col-6 col-lg-2"><label class="form-label" for="check_out">Check-out</label><input class="form-control" id="check_out" name="check_out" type="date" required></div>
      <div class="col-6 col-lg-2"><label class="form-label" for="guests">Guests</label><input class="form-control" id="guests" name="guests" type="number" min="1" step="1" value="2" required></div>
      <div class="col-12 col-lg-3"><button class="btn btn-primary w-100" type="submit"><i class="bi bi-search me-2" aria-hidden="true"></i>Search availability</button></div>
    </div>
    <p class="form-error mb-0" id="search-error" role="alert" hidden></p>
  </form>`;
}

function renderValueProps() {
  return `<div class="row g-3 mt-4">
    <div class="col-md-4"><div class="value-point"><i class="bi bi-calendar2-check" aria-hidden="true"></i><div><h3 class="h6 mb-1">Clear availability</h3><p class="small text-secondary mb-0">See the stay dates and room options that fit your plans.</p></div></div></div>
    <div class="col-md-4"><div class="value-point"><i class="bi bi-shield-check" aria-hidden="true"></i><div><h3 class="h6 mb-1">Straightforward booking</h3><p class="small text-secondary mb-0">Your booking details and price are confirmed before you submit.</p></div></div></div>
    <div class="col-md-4"><div class="value-point"><i class="bi bi-building-check" aria-hidden="true"></i><div><h3 class="h6 mb-1">Pay at the hotel</h3><p class="small text-secondary mb-0">Reserve online and settle payment directly with the property.</p></div></div></div>
  </div>`;
}

function serializeSearch(form) {
  const data = new FormData(form);
  return { destination: String(data.get('destination') || '').trim(), check_in: String(data.get('check_in') || ''), check_out: String(data.get('check_out') || ''), guests: String(data.get('guests') || '') };
}

function validateSearch(search) {
  const guests = Number(search.guests);
  if (!search.check_in || !search.check_out) return 'Choose both check-in and check-out dates.';
  if (search.check_out <= search.check_in) return 'Check-out must be after check-in.';
  const nights = Math.round((Date.parse(`${search.check_out}T00:00:00`) - Date.parse(`${search.check_in}T00:00:00`)) / 86400000);
  if (nights > maxStayNights) return `Stays can be up to ${maxStayNights} nights.`;
  if (!Number.isInteger(guests) || guests <= 0) return 'Guests must be a positive whole number.';
  return '';
}

function attachSearch() {
  const form = document.querySelector('#home-search');
  const today = todayLocalIso();
  form.elements.check_in.min = today;
  form.elements.check_out.min = today;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const search = serializeSearch(form);
    const errorElement = document.querySelector('#search-error');
    const error = validateSearch(search);
    if (error) { errorElement.textContent = error; errorElement.hidden = false; return; }
    errorElement.hidden = true;
    window.location.assign(`/hotels/?${new URLSearchParams(search).toString()}`);
  });
}

function getCoverImage(hotel) {
  const images = hotel.hotel_images || [];
  const image = images.filter((item) => item.is_cover).sort((a, b) => a.position - b.position)[0] || images.sort((a, b) => a.position - b.position)[0];
  if (!image?.storage_path || !/^https?:\/\//i.test(image.storage_path)) return null;
  return { url: image.storage_path, alt: image.alt_text || `${hotel.name} cover` };
}

function currentSearch() {
  const form = document.querySelector('#home-search');
  return form ? serializeSearch(form) : { destination: '', check_in: '', check_out: '', guests: '2' };
}

async function loadFeaturedHotels() {
  const container = document.querySelector('#featured-hotels');
  container.innerHTML = renderLoadingSkeleton(3);
  const { data, error } = await supabaseClient.from('hotels').select('id,name,city,country,hotel_images(id,storage_path,alt_text,position,is_cover),room_types(name,nightly_rate,currency,is_active)').eq('is_active', true).order('name').limit(3);
  if (error) { container.innerHTML = renderEmptyState({ title: 'Featured stays are unavailable', message: 'We could not load active hotels right now. Try the search again shortly.' }); return; }
  if (!data?.length) { container.innerHTML = renderEmptyState({ title: 'No featured stays yet', message: 'Active hotel listings will appear here when they are available.' }); return; }
  container.innerHTML = `<div class="row g-4">${data.map((hotel) => renderHotelCard({ ...hotel, location: `${hotel.city}, ${hotel.country}`, image: getCoverImage(hotel), search: currentSearch() })).join('')}</div>`;
}

app.innerHTML = `${renderNavigation({ active: 'Home' })}<main class="home-page"><section class="hero-section"><div class="page-container"><div class="hero-copy"><span class="eyebrow">StayEasy hotel booking</span><h1>Find a stay that fits the way you travel.</h1><p class="hero-lead">Search active hotels, compare available room options, and reserve with clear dates and pricing. Pay at the hotel when you arrive.</p></div>${renderSearchForm()}${renderValueProps()}</div></section><section class="section featured-section" aria-labelledby="featured-title"><div class="page-container"><div class="section-heading"><span class="eyebrow">Explore the collection</span><h2 id="featured-title">Featured active hotels</h2><p class="text-secondary mb-0">A small selection of properties currently available in the catalog.</p></div><div id="featured-hotels">${renderLoadingSkeleton(3)}</div></div></section><section class="section booking-note"><div class="page-container"><div class="booking-note__inner"><div><span class="eyebrow">Simple from search to stay</span><h2 class="h3 mb-2">Reserve now, pay at the property.</h2><p class="mb-0 text-secondary">Choose your dates and guests, review the current quote, and complete your reservation. Payment is handled directly by the hotel; availability and booking details remain clear in your confirmation.</p></div><a class="btn btn-outline-primary" href="/hotels/">Browse all hotels</a></div></div></section></main>${renderFooter()}`;
attachSearch();
loadFeaturedHotels();
