// A page visit is counted once per document; retries reuse the same identifier.
// No cookies, browser storage, personal details, or third-party requests.
(() => {
  if (location.hostname !== 'digivated.com') return;
  const visit = crypto.randomUUID();
  const format = new Intl.NumberFormat('en-US');
  let counted = false;
  let pending = false;
  async function update() {
    if (document.visibilityState !== 'visible' || pending) return;
    pending = true;
    try {
      const response = await fetch(`/api/site-activity${counted ? '' : `?view=${visit}`}`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (![data.visits, data.online].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid counts');
      counted = true;
      document.querySelectorAll('[data-site-visits]').forEach(el => { el.textContent = format.format(data.visits); });
      document.querySelectorAll('[data-site-visits-headline]').forEach(el => { el.textContent = `${format.format(data.visits)}+ visitors.`; });
      document.querySelectorAll('[data-site-online]').forEach(el => { el.textContent = format.format(data.online); });
    } catch {
      document.querySelectorAll('[data-site-visits], [data-site-online]').forEach(el => { el.textContent = '—'; });
    } finally { pending = false; }
  }
  update();
  setInterval(update, 30000);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pageshow', update);
})();
