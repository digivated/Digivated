// Original decorative illustration. Application controls remain native elements.
const builder = document.querySelector('[data-ascii-field]');
if (builder) {
  const drawing = "\n       .------.        .----------------.\n       | .  . |        | > build_       |\n       |  __  |        |                |\n       '---.--'        |  [======  ]    |\n        __|__          '-------.--------'\n       /     \\                 |\n      / /   \\ \\___       ______|______\n     /_/     \\____)     /_____________/\n    (___   ______=====================.\n        | |      |                    |\n    .---| |      |                    |\n    |___|_|      |                    |\n       /   \\     |                    |\n      /_____\\    |                    |\n";
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const backdrop = document.createElement('pre');
  backdrop.className = 'ascii-ambient';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.prepend(backdrop);
  let frame = 0;
  let timer;
  function draw() {
    builder.textContent = frame % 2 ? drawing.replace('build_', 'build ').replace('[======  ]', '[========]') : drawing;
    const width = Math.min(110, Math.max(32, Math.floor(innerWidth / 11)));
    const lines = [];
    for (let y = 0; y < 38; y++) {
      let line = '';
      for (let x = 0; x < width; x++) {
        const wave = Math.sin(x * .13 + frame * .06) * 3 + Math.cos(x * .06 - frame * .025) * 2;
        const distance = Math.abs((y % 13) - 6 - wave);
        line += distance < .3 ? '.' : distance < .6 && x % 4 === 0 ? ':' : ' ';
      }
      lines.push(line);
    }
    backdrop.textContent = lines.join('\n');
  }
  function sync() {
    clearInterval(timer);
    draw();
    if (!document.hidden && !reduced.matches) timer = setInterval(() => { frame++; draw(); }, 700);
  }
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', sync, { passive: true });
  sync();
}
