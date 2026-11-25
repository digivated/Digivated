// Lattice loader: a small grid of dots that lights up in sequence while content loads.
// Vanilla port of the LatticeLoader "orbit" pattern (3x3, round cells, 90ms step). Styles are inline so the
// loader needs no stylesheet. Mount with <span data-lattice data-label="Loading"></span>.
const ORBIT = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]];

export function mountLattice(root, options = {}) {
  if (!root || root.dataset.latticeReady) return;
  root.dataset.latticeReady = '1';
  const o = { grid: 3, cellSize: 6, gap: 2, step: 90, idleOpacity: 0.15, fontSize: 14, label: 'Loading', color: 'var(--fl-ink, #171717)', ...options };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { display: 'inline-flex', alignItems: 'center', gap: '10px', color: o.color, fontSize: `${o.fontSize}px`, lineHeight: '1' });
  const grid = document.createElement('span');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: `repeat(${o.grid}, ${o.cellSize}px)`, gap: `${o.gap}px` });
  const cells = [];
  for (let r = 0; r < o.grid; r += 1) for (let c = 0; c < o.grid; c += 1) {
    const cell = document.createElement('span');
    Object.assign(cell.style, { width: `${o.cellSize}px`, height: `${o.cellSize}px`, borderRadius: '50%', background: 'currentColor', opacity: String(o.idleOpacity), transition: 'opacity 140ms ease' });
    cells.push({ r, c, cell });
    grid.append(cell);
  }
  root.append(grid);
  if (o.label) { const text = document.createElement('span'); text.textContent = o.label; root.append(text); }

  const ring = grid.childElementCount === 9 && o.grid === 3 ? ORBIT : [];
  const at = (r, c) => cells.find((x) => x.r === r && x.c === c)?.cell;
  const trail = [1, 0.55, 0.3];
  let tick = 0;
  const paint = () => {
    if (!root.isConnected) { clearInterval(timer); return; }
    if (!root.offsetParent) return; // hidden (skeleton toggled off): skip work
    cells.forEach(({ cell }) => { cell.style.opacity = String(o.idleOpacity); });
    trail.forEach((opacity, i) => {
      const [r, c] = ring[(tick - i + ring.length * 4) % ring.length];
      const cell = at(r, c);
      if (cell) cell.style.opacity = String(opacity);
    });
    tick += 1;
  };
  let timer = 0;
  if (!ring.length) return;
  paint();
  if (!reduce) timer = setInterval(paint, o.step);
}

export function mountAllLattices(scope = document) {
  scope.querySelectorAll('[data-lattice]').forEach((node) => mountLattice(node, node.dataset.label ? { label: node.dataset.label } : {}));
}

mountAllLattices();
