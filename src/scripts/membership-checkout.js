import { membership } from '../data/membership.mjs';
// Public readiness only. This endpoint never receives a license or seller key.
const button = document.querySelector('button.membership-checkout');
if (button) (async () => {
  try {
    const response = await fetch('/api/membership-checkout', {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});
    const state = response.ok ? await response.json() : null;
    if (!state?.ready || state.priceUSD !== 5 || state.billing !== 'one-time' || state.checkoutUrl !== membership.checkoutUrl) return;
    const link = document.createElement('a');
    link.className = button.className; link.href = membership.checkoutUrl;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Get membership · $5 once ↗';
    button.replaceWith(link);
    const note = document.querySelector('.membership-checkout-note');
    if (note) note.hidden = true;
  } catch { /* Checkout remains paused until the complete offer is verified. */ }
})();
