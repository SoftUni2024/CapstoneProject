import { supabaseClient } from './supabase-client.js';

export async function requireAdmin() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) { window.location.assign(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return null; }
  const { data: role, error } = await supabaseClient.from('user_roles').select('role').eq('user_id', sessionData.session.user.id).maybeSingle();
  if (error || role?.role !== 'admin') { window.location.assign('/'); return null; }
  return sessionData.session.user;
}

export const escapeAdminHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
