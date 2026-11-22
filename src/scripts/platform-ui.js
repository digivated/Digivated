// A native disclosure keeps navigation usable before scripts load.
const menu = document.querySelector('[data-navigation]');
if (menu) {
  const trigger = menu.querySelector('summary');
  const panel = menu.querySelector('nav');
  const sync = () => trigger.setAttribute('aria-expanded', String(menu.open));
  const close = (restoreFocus = false) => {
    if (!menu.open) return;
    menu.open = false;
    sync();
    if (restoreFocus && menu.contains(document.activeElement)) trigger.focus();
  };
  const closeButton = panel.querySelector('[data-menu-close]');
  closeButton.hidden = false;
  closeButton.addEventListener('click', () => close(true));
  menu.addEventListener('toggle', sync);
  trigger.addEventListener('click', event => {
    if (menu.open) { event.preventDefault(); close(true); }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      menu.open = true;
      sync();
      panel.querySelector('.navigation-tree a')?.focus();
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
