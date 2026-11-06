import { createClient } from '@supabase/supabase-js';

const expectedProjectRef = 'zzvslyczabejzhvwiwbr';
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PROJECT_REF', 'BOOTSTRAP_ADMIN_USER_ID'];
for (const name of required) if (!process.env[name]) throw new Error(`Missing required server environment variable: ${name}`);
if (process.env.SUPABASE_PROJECT_REF !== expectedProjectRef) throw new Error(`Refusing to bootstrap: SUPABASE_PROJECT_REF must be ${expectedProjectRef}.`);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.BOOTSTRAP_ADMIN_USER_ID)) throw new Error('BOOTSTRAP_ADMIN_USER_ID must be an explicit UUID.');
const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== expectedProjectRef) throw new Error(`Refusing to bootstrap: SUPABASE_URL points to ${projectRef}.`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const userId = process.env.BOOTSTRAP_ADMIN_USER_ID;
const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
if (userError || !user.user) throw new Error(userError?.message || 'The supplied user UUID does not exist.');
const { data: existing, error: readError } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
if (readError) throw readError;
if (existing?.role === 'admin') { console.log(JSON.stringify({ status: 'skipped', user_id: userId, reason: 'already_admin' })); process.exit(0); }
const { error } = existing
  ? await supabase.from('user_roles').update({ role: 'admin' }).eq('user_id', userId)
  : await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
if (error) throw error;
console.log(JSON.stringify({ status: 'promoted', user_id: userId }));
