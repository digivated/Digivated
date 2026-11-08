// A native disclosure keeps navigation usable before scripts load.
const menu = document.querySelector('.explore-menu, .mobile-menu');
if (menu) {
  const trigger = menu.querySelector('summary');
  const panel = menu.querySelector('nav');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let closing = false;
  const positionPanel = () => {
    const header = menu.closest('header');
    if (header) menu.style.setProperty('--navigation-top', `${Math.max(8, Math.ceil(header.getBoundingClientRect().bottom) + 8)}px`);
  };
  const sync = () => {
    if (menu.open) positionPanel();
    trigger.setAttribute('aria-expanded', String(menu.open));
    trigger.setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
  };
  const close = async (restoreFocus = false) => {
    if (!menu.open || closing) return;
    closing = true;
    if (panel && !reducedMotion.matches && typeof panel.animate === 'function') {
      const exit = panel.animate(
        [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-4px) scale(.985)' }],
        { duration: 140, easing: 'cubic-bezier(.4,0,1,1)' },
      );
      await exit.finished.catch(() => {});
    }
    menu.open = false;
    sync();
    closing = false;
    if (restoreFocus && menu.contains(document.activeElement)) trigger.focus();
  };
  menu.addEventListener('toggle', sync);
  window.addEventListener('resize', () => { if (menu.open) positionPanel(); });
  trigger.addEventListener('click', event => {
    if (menu.open) { event.preventDefault(); close(true); }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !closing) {
      event.preventDefault();
      menu.open = true;
      sync();
      panel?.querySelector('a')?.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); close(true); }
  });
  document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (menu.open && !menu.contains(event.target)) close(); });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
  menu.querySelectorAll('[data-open-search]').forEach(button => button.addEventListener('click', () => close()));
  sync();
}
