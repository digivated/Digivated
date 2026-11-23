// A native disclosure keeps navigation usable before scripts load.
const menu = document.querySelector('[data-navigation]');
if (menu) {
  const trigger = menu.querySelector('summary');
  const panel = menu.querySelector('nav');
  const sync = () => trigger.setAttribute('aria-expanded', String(menu.open));
  // On phones the menu is a side drawer; let it slide away before it is put away.
  const drawer = matchMedia('(max-width: 1119px) and (prefers-reduced-motion: no-preference)');
  let closing = 0;
  const close = (restoreFocus = false) => {
    if (!menu.open || closing) return;
    const finish = () => {
      clearTimeout(closing); closing = 0;
      delete menu.dataset.closing;
      menu.open = false;
      sync();
      if (restoreFocus) trigger.focus();
    };
    if (restoreFocus && !menu.contains(document.activeElement)) restoreFocus = false;
    if (!drawer.matches) return finish();
    menu.dataset.closing = '';
    closing = setTimeout(finish, 230);
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
  // A tap on the dimmed page behind the drawer lands on the disclosure itself.
  document.addEventListener('click', event => { if (menu.open && (event.target === menu || !menu.contains(event.target))) close(); });
  document.addEventListener('focusin', event => { if (menu.open && !menu.contains(event.target)) close(); });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
  menu.querySelectorAll('[data-open-search]').forEach(button => button.addEventListener('click', () => close()));
  sync();
}
