// Original ASCII artwork. One non-interactive ambient layer in every layout.
if (!document.querySelector('.ascii-ambient')) {
  const drawing = "\n       .------.        .----------------.\n       | .  . |        | > build_       |\n       |  __  |        |                |\n       '---.--'        |  [======  ]    |\n        __|__          '-------.--------'\n       /     \\                 |\n      / /   \\ \\___       ______|______\n     /_/     \\____)     /_____________/\n    (___   ______=====================.\n        | |      |                    |\n    .---| |      |                    |\n    |___|_|      |                    |\n       /   \\     |                    |\n      /_____\\    |                    |\n";

  const builder = document.querySelector('[data-ascii-field]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ambient = document.createElement('div');
  ambient.className = 'ascii-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  const art = [String.raw`
       . . : : . .
    . : + + + + : .
   : + .       . + :
  . +   .---.   + .
   : + '     ' + :
    ' : + + + : '
        | : |
        : | :
       /  :  \
      :   |   :
       .  :  .`, String.raw`
          .
       .     .
    .    /\    .
       / /\ \
  .   / /  \ \   .
      \ \  / /
       \ \/ /
    .    \/    .
       .     .
          .`, String.raw`
     .                  .
        .  .      .  .
      . : : : .. : : : .
    . : : : : :: : : : : .
  . : : : : : :: : : : : : .
    ' : : : : :: : : : : '
      ' : : : '' : : : '
        '  '      '  '`, String.raw`
       .----.
    .-' .--. '-.
   /  .'    '.  \
  |  /   +    \  |
   \  '.    .'  /
    '-. '--' .-'
       '----'`];
  art.forEach(text => {
    const piece = document.createElement('pre');
    piece.className = 'ascii-drift';
    piece.textContent = text;
    ambient.append(piece);
  });
  document.body.prepend(ambient);
  let tick = false;
  let timer;
  function sync() {
    clearInterval(timer);
    ambient.toggleAttribute('data-paused', document.hidden);
    if (builder) builder.textContent = drawing;
    if (!document.hidden && !reduced.matches && document.body.classList.contains('home-refresh')) {
      timer = setInterval(() => {
        tick = !tick;
        builder.textContent = tick ? drawing.replace('build_', 'build ').replace('[======  ]', '[======= ]') : drawing;
      }, 1400);
    }
  }
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
}
