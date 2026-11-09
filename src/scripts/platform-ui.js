// A native disclosure keeps navigation usable before scripts load.
const menu = document.querySelector('.explore-menu, .mobile-menu');
if (menu) {
  const trigger = menu.querySelector('summary');
  const panel = menu.querySelector('nav');
  const positionPanel = () => {
    const header = menu.closest('header');
    if (header) menu.style.setProperty('--navigation-top', `${Math.max(8, Math.ceil(header.getBoundingClientRect().bottom) + 8)}px`);
  };
  const sync = () => {
    if (menu.open) positionPanel();
    trigger.setAttribute('aria-expanded', String(menu.open));
    trigger.setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
  };
  const close = (restoreFocus = false) => {
    if (!menu.open) return;
    menu.open = false;
    sync();
    if (restoreFocus && menu.contains(document.activeElement)) trigger.focus();
  };
  menu.addEventListener('toggle', sync);
  window.addEventListener('resize', () => { if (menu.open) positionPanel(); });
  trigger.addEventListener('click', event => {
    if (menu.open) { event.preventDefault(); close(true); }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
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
