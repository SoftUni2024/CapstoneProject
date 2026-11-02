import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderAuthPage, safeNextPath, setAuthBusy } from '../components/auth.js';

document.title = 'Register | StayEasy';
document.querySelector('#app').innerHTML = renderAuthPage({ mode: 'register' });
const form = document.querySelector('#auth-form');
const submit = form.querySelector('#auth-submit');
submit.dataset.label = submit.textContent;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const values = { display_name: String(data.get('display_name') || '').trim(), phone: String(data.get('phone') || '').trim(), email: String(data.get('email') || '').trim().toLowerCase() };
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirm_password') || '');
  const errorElement = form.querySelector('#auth-error');
  if (!values.display_name || !values.email || !password || !confirmation) { errorElement.textContent = 'Complete all required fields.'; errorElement.hidden = false; return; }
  if (password.length < 8) { errorElement.textContent = 'Your password must be at least 8 characters.'; errorElement.hidden = false; return; }
  if (password !== confirmation) { errorElement.textContent = 'Passwords do not match.'; errorElement.hidden = false; return; }
  errorElement.hidden = true;
  setAuthBusy(form, true);
  const { data: result, error } = await supabaseClient.auth.signUp({ email: values.email, password, options: { data: { display_name: values.display_name, phone: values.phone || null } } });
  if (error) { errorElement.textContent = 'We could not create your account. Check the details and try again.'; errorElement.hidden = false; setAuthBusy(form, false); return; }
  if (result.session) { window.location.assign(safeNextPath()); return; }
  form.innerHTML = `<div class="auth-success" role="status"><i class="bi bi-envelope-check" aria-hidden="true"></i><h2 class="h4 mt-3">Check your email</h2><p class="text-secondary mb-0">Your account was created. Follow the confirmation link before logging in.</p></div>`;
});
