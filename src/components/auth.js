import { renderNavigation, renderFooter } from '../utils/navigation.js';

export const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

export function safeNextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function renderAuthPage({ mode, error = '', values = {} }) {
  const isRegister = mode === 'register';
  const title = isRegister ? 'Create your account' : 'Welcome back';
  const intro = isRegister ? 'Save your guest details and manage your stays in one place.' : 'Sign in to view your bookings and continue planning your stay.';
  return `${renderNavigation({ active: isRegister ? 'Register' : 'Log in' })}<main class="auth-page page-shell section"><div class="auth-card"><div class="auth-card__intro"><span class="eyebrow">StayEasy account</span><h1>${title}</h1><p>${intro}</p><div class="auth-card__note"><i class="bi bi-shield-check" aria-hidden="true"></i><span>Your account uses Supabase Auth. We never store passwords in the application database.</span></div></div><form class="auth-form" id="auth-form" novalidate>${isRegister ? `<div><label class="form-label" for="display_name">Display name</label><input class="form-control" id="display_name" name="display_name" type="text" value="${escapeHtml(values.display_name)}" autocomplete="name" maxlength="120" required></div><div><label class="form-label" for="phone">Phone <span class="text-secondary fw-normal">(optional)</span></label><input class="form-control" id="phone" name="phone" type="tel" value="${escapeHtml(values.phone)}" autocomplete="tel" maxlength="40"></div>` : ''}<div><label class="form-label" for="email">Email</label><input class="form-control" id="email" name="email" type="email" value="${escapeHtml(values.email)}" autocomplete="email" required></div><div><label class="form-label" for="password">Password</label><input class="form-control" id="password" name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" required></div>${isRegister ? '<div><label class="form-label" for="confirm_password">Confirm password</label><input class="form-control" id="confirm_password" name="confirm_password" type="password" autocomplete="new-password" minlength="8" required></div>' : ''}<p class="form-error mb-0" id="auth-error" role="alert"${error ? '' : ' hidden'}>${escapeHtml(error)}</p><button class="btn btn-primary w-100" type="submit" id="auth-submit">${isRegister ? 'Create account' : 'Log in'}</button>${isRegister ? '<p class="small text-secondary mb-0">By creating an account, you agree to use accurate contact details for your reservations.</p>' : ''}</form><p class="auth-switch">${isRegister ? 'Already have an account?' : 'New to StayEasy?'} <a href="${isRegister ? '/login/' : '/register/'}">${isRegister ? 'Log in' : 'Create an account'}</a></p></div></main>${renderFooter()}`;
}

export function setAuthBusy(form, busy) {
  const button = form.querySelector('#auth-submit');
  button.disabled = busy;
  button.textContent = busy ? 'Please wait…' : button.dataset.label;
}
