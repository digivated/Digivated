const art = document.querySelector('[data-ascii-field]');

if (art) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const glyphs = ' .,:;+=ox%#@';
  const points = [];
  for (let a = 0; a < Math.PI * 2; a += .055) {
    for (let b = 0; b < Math.PI * 2; b += .075) {
      const radius = 1 + .38 * Math.cos(b);
      points.push([radius * Math.cos(a), radius * Math.sin(a), .38 * Math.sin(b),
        Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)]);
    }
  }

  let columns = 0;
  let rows = 0;
  let visible = true;
  let angle = .7;
  let timer;

  function draw() {
    if (!columns || !rows) return;
    const output = Array(columns * rows).fill(' ');
    const depth = new Float32Array(output.length).fill(-Infinity);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tilt = .82 + .22 * Math.sin(angle * .62);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const scale = Math.min(columns / 3.25, rows / 1.73);

    for (const [x, y, z, nx, ny, nz] of points) {
      const u = x * ca - z * sa;
      const w = x * sa + z * ca;
      const v = y * ct - w * st;
      const d = y * st + w * ct;
      const perspective = 4.7 / (4.7 - d);
      const col = Math.round(columns / 2 + u * scale * perspective);
      const row = Math.round(rows / 2 + v * scale * .49 * perspective);
      if (col < 0 || col >= columns || row < 0 || row >= rows) continue;
      const index = row * columns + col;
      if (d <= depth[index]) continue;
      depth[index] = d;
      const normalX = nx * ca - nz * sa;
      const normalZ = nx * sa + nz * ca;
      const normalY = ny * ct - normalZ * st;
      const facing = ny * st + normalZ * ct;
      const diffuse = Math.max(0, -.36 * normalX - .55 * normalY + .67 * facing);
      const reflection = Math.pow(Math.max(0, -.24 * normalX + .18 * normalY + .95 * facing), 12);
      const light = Math.min(1, .11 + diffuse * .58 + reflection * .39);
      output[index] = glyphs[Math.floor(light * (glyphs.length - 1))];
    }

    const lines = [];
    for (let row = 0; row < rows; row++) {
      lines.push(output.slice(row * columns, (row + 1) * columns).join(''));
    }
    art.textContent = lines.join('\n');
  }

  function sync() {
    clearInterval(timer);
    if (!visible || document.hidden) return;
    draw();
    if (!reduced.matches) timer = setInterval(() => {
      angle += .021;
      draw();
    }, 85);
  }

  function resize() {
    const font = parseFloat(getComputedStyle(art).fontSize);
    columns = Math.min(100, Math.floor(art.clientWidth / (font * .62)));
    rows = Math.min(42, Math.floor(art.clientHeight / (font * 1.12)));
    sync();
  }

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(art);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(art);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  resize();
}
