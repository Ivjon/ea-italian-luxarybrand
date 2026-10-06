// CRM sign-in: an already signed-in admin goes straight to the CRM; otherwise the form signs in and opens it.
const $ = s => document.querySelector(s);

fetch('/api/auth/me').then(r => (r.ok ? location.replace('/admin/') : r.body?.cancel())).catch(() => {});

$('#showPassword').addEventListener('click', e => {
  const input = $('#password'), show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
  e.currentTarget.setAttribute('aria-pressed', show);
  input.focus();
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, btn = $('#loginSubmit'), error = $('#loginError');
  const username = form.username.value.trim(), password = form.password.value;
  error.textContent = '';
  if (!username || !password) {
    error.textContent = `Enter your ${!username ? 'username or email' : 'password'}.`;
    (!username ? form.username : form.password).focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `Sign-in failed (${r.status}).`);
    location.replace('/admin/');
  } catch (err) {
    error.textContent = err.message === 'Failed to fetch' ? 'The server could not be reached. Is it running?' : err.message;
    form.password.select();
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('#username').focus();
