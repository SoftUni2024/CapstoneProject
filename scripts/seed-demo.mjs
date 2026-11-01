import { createClient } from '@supabase/supabase-js';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const expectedProjectRef = 'zzvslyczabejzhvwiwbr';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PROJECT_REF', 'SEED_ADMIN_EMAIL', 'SEED_DEMO_PASSWORD'];
for (const name of requiredEnv) {
  if (!process.env[name]) throw new Error(`Missing required server environment variable: ${name}`);
}

if (process.env.SUPABASE_PROJECT_REF !== expectedProjectRef) {
  throw new Error(`Refusing to seed: SUPABASE_PROJECT_REF must be ${expectedProjectRef}.`);
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const actualProjectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (actualProjectRef !== expectedProjectRef) {
  throw new Error(`Refusing to seed: SUPABASE_URL points to ${actualProjectRef}, not ${expectedProjectRef}.`);
}

const adminEmail = process.env.SEED_ADMIN_EMAIL.trim().toLowerCase();
if (!adminEmail.endsWith('.invalid')) {
  throw new Error('SEED_ADMIN_EMAIL must use the reserved .invalid domain to prevent real email delivery.');
}

const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stats = {
  users: { created: 0, skipped: 0 },
  profiles: { created: 0, skipped: 0 },
  roles: { created: 0, skipped: 0 },
  hotels: { created: 0, skipped: 0 },
  roomTypes: { created: 0, skipped: 0 },
  rooms: { created: 0, skipped: 0 },
  bookings: { created: 0, skipped: 0 },
  events: { created: 0, skipped: 0 },
};

const guests = [
  { email: 'demo.guest.one@capstone.invalid', displayName: 'Demo Guest One', phone: '+359 888 100 101' },
  { email: 'demo.guest.two@capstone.invalid', displayName: 'Demo Guest Two', phone: '+359 888 100 102' },
];

const hotels = [
  {
    name: 'Danube Lantern Hotel', description: 'A fictional riverside hotel in Ruse.', city: 'Ruse', country: 'Bulgaria', adress: '1 River Lantern Square',
    roomTypes: [
      { name: 'Classic Double', description: 'Comfortable room for two.', capacity: 2, nightlyRate: '89.00', rooms: ['101', '102', '103'] },
      { name: 'Family Studio', description: 'Flexible space for a small family.', capacity: 4, nightlyRate: '139.00', rooms: ['201', '202'] },
      { name: 'River Suite', description: 'Large suite with a river-facing lounge.', capacity: 3, nightlyRate: '189.00', rooms: ['301', '302'] },
    ],
  },
  {
    name: 'Rhodope Ember Lodge', description: 'A fictional mountain lodge near Smolyan.', city: 'Smolyan', country: 'Bulgaria', adress: '8 Pine Hearth Road',
    roomTypes: [
      { name: 'Forest Double', description: 'Quiet room overlooking the pines.', capacity: 2, nightlyRate: '79.00', rooms: ['101', '102', '103'] },
      { name: 'Mountain Family Room', description: 'Warm family room for four guests.', capacity: 4, nightlyRate: '129.00', rooms: ['201', '202'] },
      { name: 'Ember Chalet Suite', description: 'Premium suite with a private sitting area.', capacity: 5, nightlyRate: '209.00', rooms: ['301', '302'] },
    ],
  },
  {
    name: 'Black Sea Compass Hotel', description: 'A fictional coastal hotel in Varna.', city: 'Varna', country: 'Bulgaria', adress: '14 Compass Promenade',
    roomTypes: [
      { name: 'Sea Double', description: 'Bright room for two guests.', capacity: 2, nightlyRate: '109.00', rooms: ['101', '102', '103'] },
      { name: 'Coast Family Room', description: 'Family room close to the promenade.', capacity: 4, nightlyRate: '159.00', rooms: ['201', '202'] },
      { name: 'Compass Suite', description: 'A fictional premium sea-view suite.', capacity: 3, nightlyRate: '229.00', rooms: ['301', '302'] },
    ],
  },
];

const isoDate = (offset) => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
};

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function reportMissingImages() {
  const roots = ['public', 'src/assets', 'assets'].map((path) => join(projectRoot, path)).filter(existsSync);
  const images = roots.flatMap((root) => readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => relative(projectRoot, join(root, entry.name))));
  if (images.length === 0) {
    console.log('Images: none found locally; hotel_images was not seeded. Upload catalog images later and add metadata then.');
  } else {
    console.log(`Images: found locally (${images.join(', ')}). No storage URLs were invented; upload them to Storage before adding hotel_images metadata.`);
  }
}

async function listUsersByEmail() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return new Map(users.map((user) => [user.email?.toLowerCase(), user]));
}

async function ensureUser(userMap, user, isAdmin = false) {
  const existing = userMap.get(user.email);
  if (existing) {
    stats.users.skipped += 1;
    return existing;
  }
  if (dryRun) {
    stats.users.created += 1;
    return { id: `dry-run-${user.email}`, email: user.email };
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: process.env.SEED_DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: user.displayName, phone: user.phone, seed_role: isAdmin ? 'admin' : 'guest' },
  });
  if (error) throw error;
  stats.users.created += 1;
  userMap.set(user.email, data.user);
  return data.user;
}

async function ensureProfile(user, displayName, phone) {
  const { data: existing, error: readError } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (readError) throw readError;
  if (existing) { stats.profiles.skipped += 1; return; }
  if (!dryRun) {
    const { error } = await supabase.from('profiles').insert({ id: user.id, display_name: displayName, phone });
    if (error) throw error;
  }
  stats.profiles.created += 1;
}

async function ensureRole(user, role) {
  const { data: existing, error: readError } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    if (role === 'admin' && existing.role !== 'admin' && !dryRun) {
      const { error } = await supabase.from('user_roles').update({ role: 'admin' }).eq('user_id', user.id);
      if (error) throw error;
    }
    stats.roles.skipped += 1;
    return;
  }
  if (!dryRun) {
    const { error } = await supabase.from('user_roles').insert({ user_id: user.id, role });
    if (error) throw error;
  }
  stats.roles.created += 1;
}

async function ensureCatalog() {
  const hotelRows = new Map();
  for (const hotel of hotels) {
    const { data: existing, error: readError } = await supabase.from('hotels').select('id,name').eq('name', hotel.name).maybeSingle();
    if (readError) throw readError;
    let hotelRow = existing;
    if (hotelRow) stats.hotels.skipped += 1;
    else if (dryRun) { stats.hotels.created += 1; hotelRow = { id: `dry-run-${hotel.name}`, name: hotel.name }; }
    else {
      const { data, error } = await supabase.from('hotels').insert({ ...hotel, iana_timezone: 'Europe/Sofia', is_active: true }).select('id,name').single();
      if (error) throw error;
      stats.hotels.created += 1; hotelRow = data;
    }
    hotelRows.set(hotel.name, hotelRow);

    for (const type of hotel.roomTypes) {
      const { data: existingType, error: typeReadError } = await supabase.from('room_types').select('id,name').eq('hotel_id', hotelRow.id).eq('name', type.name).maybeSingle();
      if (typeReadError) throw typeReadError;
      let typeRow = existingType;
      if (typeRow) stats.roomTypes.skipped += 1;
      else if (dryRun) { stats.roomTypes.created += 1; typeRow = { id: `dry-run-${hotel.name}-${type.name}`, name: type.name }; }
      else {
        const { data, error } = await supabase.from('room_types').insert({ hotel_id: hotelRow.id, name: type.name, description: type.description, capacity: type.capacity, nightly_rate: type.nightlyRate, currency: 'EUR', is_active: true }).select('id,name').single();
        if (error) throw error;
        stats.roomTypes.created += 1; typeRow = data;
      }
      for (const roomNumber of type.rooms) {
        const { data: existingRoom, error: roomReadError } = await supabase.from('rooms').select('id').eq('room_type_id', typeRow.id).eq('room_number', roomNumber).maybeSingle();
        if (roomReadError) throw roomReadError;
        if (existingRoom) stats.rooms.skipped += 1;
        else {
          if (!dryRun) {
            const { error } = await supabase.from('rooms').insert({ room_type_id: typeRow.id, room_number: roomNumber, is_active: true });
            if (error) throw error;
          }
          stats.rooms.created += 1;
        }
      }
    }
  }
  return hotelRows;
}

async function ensureBooking({ user, hotelName, roomTypeName, roomNumber, checkInOffset, checkOutOffset, requestId, reference }) {
  if (dryRun) {
    stats.bookings.created += 1;
    stats.events.created += 1;
    return;
  }
  const { data: existing, error: readError } = await supabase.from('bookings').select('id').eq('unique_reference', reference).maybeSingle();
  if (readError) throw readError;
  if (existing) { stats.bookings.skipped += 1; return; }
  const checkIn = isoDate(checkInOffset);
  const checkOut = isoDate(checkOutOffset);
  const { data: room, error: roomError } = await supabase.from('rooms').select('id,room_type_id,room_types!inner(name,nightly_rate,currency,hotels!inner(name))').eq('room_number', roomNumber).eq('room_types.name', roomTypeName).eq('room_types.hotels.name', hotelName).single();
  if (roomError) throw roomError;
  const rate = Number(room.room_types.nightly_rate);
  const nights = daysBetween(checkIn, checkOut);
  const row = {
    unique_reference: reference, user_id: user.id, room_id: room.id, check_in: checkIn, check_out: checkOut,
    guest_count: 2, status: 'confirmed', nightly_rate_snapshot: rate.toFixed(2), total_price: (rate * nights).toFixed(2), currency: 'EUR',
    guest_name: user.email, contact_phone: '+359 888 100 199', special_requests: 'Seeded demo booking', hotel_name_snapshot: hotelName,
    room_type_name_snapshot: roomTypeName, request_id: requestId,
  };
  const { data: booking, error } = await supabase.from('bookings').insert(row).select('id').single();
  if (error) throw error;
  const { error: eventError } = await supabase.from('booking_events').insert({ booking_id: booking.id, actor_id: user.id, event_type: 'created', details: { source: 'demo-seed' } });
  if (eventError) throw eventError;
  stats.events.created += 1;
  stats.bookings.created += 1;
}

async function main() {
  console.log(`Demo seed ${dryRun ? 'dry run' : 'execution'} for ${expectedProjectRef}`);
  reportMissingImages();
  const users = await listUsersByEmail();
  const admin = await ensureUser(users, { email: adminEmail, displayName: 'Demo Admin', phone: '+359 888 100 100' }, true);
  await ensureProfile(admin, 'Demo Admin', '+359 888 100 100');
  await ensureRole(admin, 'admin');
  const guestUsers = [];
  for (const guest of guests) {
    const user = await ensureUser(users, guest);
    await ensureProfile(user, guest.displayName, guest.phone);
    await ensureRole(user, 'guest');
    guestUsers.push(user);
  }
  await ensureCatalog();
  await ensureBooking({ user: guestUsers[0], hotelName: 'Danube Lantern Hotel', roomTypeName: 'Classic Double', roomNumber: '101', checkInOffset: 14, checkOutOffset: 17, requestId: '00000000-0000-4000-8000-000000000101', reference: 'DEMO-RUSE-101' });
  await ensureBooking({ user: guestUsers[1], hotelName: 'Black Sea Compass Hotel', roomTypeName: 'Sea Double', roomNumber: '101', checkInOffset: 21, checkOutOffset: 25, requestId: '00000000-0000-4000-8000-000000000102', reference: 'DEMO-VARNA-101' });
  console.log(JSON.stringify({ dryRun, projectRef: expectedProjectRef, stats }, null, 2));
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
