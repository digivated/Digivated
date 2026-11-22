// Shop: show the live instant-spot price, or say when spots are paused.
const card = document.querySelector('[data-shop-spot]');
if (card) (async () => {
  try {
    const response = await fetch('/api/submissions?action=launch-options', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const { instant } = await response.json();
    const price = card.querySelector('[data-shop-spot-price]'), note = card.querySelector('[data-shop-spot-note]'), cta = card.querySelector('[data-shop-spot-cta]');
    if (instant?.price) {
      price.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger' }).format(instant.price / 100);
      return;
    }
    // Not available right now: keep the card, point people to the free launch.
    card.classList.add('is-paused');
    note.hidden = false;
    note.textContent = 'Instant spots are paused right now. You can still launch free.';
    cta.href = '/submit-project#project-form';
    cta.querySelector('[data-shop-spot-label]').textContent = 'Launch free';
  } catch {}
})();
