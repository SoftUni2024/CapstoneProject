import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../styles/main.css';
import { supabaseClient } from '../services/supabase-client.js';
import { renderAuthPage, safeNextPath, setAuthBusy } from '../components/auth.js';

document.title = 'Log in | StayEasy';
document.querySelector('#app').innerHTML = renderAuthPage({ mode: 'login' });
const form = document.querySelector('#auth-form');
const submit = form.querySelector('#auth-submit');
submit.dataset.label = submit.textContent;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const errorElement = form.querySelector('#auth-error');
  if (!email || !password) { errorElement.textContent = 'Enter your email and password.'; errorElement.hidden = false; return; }
  errorElement.hidden = true;
  setAuthBusy(form, true);
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { errorElement.textContent = 'We could not log you in with those details.'; errorElement.hidden = false; setAuthBusy(form, false); return; }
  window.location.assign(safeNextPath());
});
