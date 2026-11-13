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
    const height = Math.max(36, Math.min(64, Math.ceil(innerHeight / 20)));
    const grid = Array.from({ length: height }, () => Array(width).fill(' '));
    const shapes = [
      ['    .     ', '   / \\    ', '  /___\\   ', '  | + |   ', ' /|___|\\  ', '   : :    '],
      ['   .----.   ', ' / .  .  \\ ', '|   --    | ', ' \\______/  ', '   /  \\    '],
      ['      /| ', '  ___/ | ', ' <_____| ', '    /    '],
      ['  .  +  .  ', ' +  .:.  + ', '  .: + :.  ', ' +  .:.  + ', '  .  +  .  ']
    ];
    for (let index = 0; index < shapes.length; index++) {
      const shape = shapes[index];
      const left = Math.round((width - 14) * (index % 2 ? .85 : .08) + Math.sin(frame * .018 + index) * 3);
      const top = Math.round(4 + index * (height - 14) / shapes.length + Math.cos(frame * .014 + index * 2) * 2);
      shape.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          if (grid[top + y] && left + x >= 0 && left + x < width) grid[top + y][left + x] = line[x];
        }
      });
    }
    const lines = grid.map(row => row.join(''));
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
