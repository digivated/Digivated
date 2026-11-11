const form = document.getElementById('founding-access-form');
const signOut = document.getElementById('founding-sign-out');
const verified = document.getElementById('membership-verified');
const status = document.getElementById('founding-access-status');

async function updateMembershipStatus() {
  if (!form) return;
  try {
    const response = await fetch('/api/member-status', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return;
    const data = await response.json();
    const member = data.member === true;
    form.hidden = member;
    if (signOut) signOut.hidden = !member;
    if (verified) verified.hidden = !member;
  } catch { /* The sign-in form stays available if status cannot be checked. */ }
}

if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const license = form.querySelector('[name=license]').value.trim();
    const email = form.querySelector('[name=email]').value.trim();
    if ((license && email) || (!license && !email)) {
      if (status) status.textContent = 'Enter a license key or a purchase email.';
      return;
    }
    const button = form.querySelector('button[type=submit]');
    if (button.disabled) return;
    button.disabled = true;
    if (status) status.textContent = 'Checking your purchase…';
    try {
      const response = await fetch('/api/founding-access', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(license ? { license } : { email }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (status) status.textContent = data.error || 'That purchase could not be verified.'; return; }
      location.reload();
    } catch { if (status) status.textContent = 'We couldn’t check membership access right now. Please try again shortly.'; }
    finally { button.disabled = false; }
  });
  signOut?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/founding-logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      location.reload();
    } catch { if (status) status.textContent = 'We couldn’t sign you out. Please try again.'; }
  });
  updateMembershipStatus();
}
