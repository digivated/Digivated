// Optics are limited to the glass surface. Text and controls stay on top of it.
const surfaces = [...document.querySelectorAll('[data-nav-reflection]')];
const svgNS = 'http://www.w3.org/2000/svg';
// Safari and Firefox may accept a filter URL in CSS without applying it to the backdrop.
const chromium = /(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent) && !/CriOS|EdgiOS/.test(navigator.userAgent);

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(svgNS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, String(value));
  parent.append(element);
  return element;
}

function displacementMap(canvas, width, height, radius, rim) {
  const density = Math.min(1, 640 / width, 380 / height);
  const columns = Math.ceil(width * density);
  const rows = Math.ceil(height * density);
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(columns, rows);
  const innerX = width / 2 - radius;
  const innerY = height / 2 - radius;

  for (let row = 0; row < rows; row++) {
    const y = (row + .5) * height / rows - height / 2;
    const dy = Math.abs(y) - innerY;
    for (let col = 0; col < columns; col++) {
      const x = (col + .5) * width / columns - width / 2;
      const dx = Math.abs(x) - innerX;
      const cornerX = Math.max(dx, 0);
      const cornerY = Math.max(dy, 0);
      const length = Math.hypot(cornerX, cornerY);
      const distance = radius - length - Math.min(Math.max(dx, dy), 0);
      let bendX = 0;
      let bendY = 0;
      if (distance > 0 && distance < rim) {
        const depth = distance / rim;
        // A rounded bevel is steepest near the edge and flattens toward the center.
        const bend = Math.min(1, depth * 8) * Math.pow(1 - depth, 1.65);
        if (length > 0) {
          bendX = Math.sign(x) * cornerX / length * bend;
          bendY = Math.sign(y) * cornerY / length * bend;
        } else if (dx > dy) {
          bendX = Math.sign(x) * bend;
        } else {
          bendY = Math.sign(y) * bend;
        }
      }
      const offset = (row * columns + col) * 4;
      pixels.data[offset] = 128 + bendX * 127;
      pixels.data[offset + 1] = 128 + bendY * 127;
      pixels.data[offset + 2] = 128;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

if (surfaces.length && chromium && 'ResizeObserver' in window && CSS.supports('backdrop-filter', 'url("#glass")')) {
  const svg = svgElement('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false', class: 'dg-glass-definitions' }, document.body);
  const defs = svgElement('defs', {}, svg);
  const canvas = document.createElement('canvas');
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const surface = entry.target;
      const panel = !surface.classList.contains('dg-shell-bar');
      const width = surface.offsetWidth;
      const height = surface.offsetHeight;
      if (!width || !height) continue;
      const geometry = `${width}:${height}`;
      if (surface.dataset.glassSize === geometry) continue;

      const id = `dg-glass-${surfaces.indexOf(surface)}`;
      const url = displacementMap(canvas, width, height, panel ? 16 : 14, panel ? 23 : 17);
      if (!url) continue;
      let filter = document.getElementById(id);
      if (!filter) {
        filter = svgElement('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, defs);
        svgElement('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'normals' }, filter);
        svgElement('feDisplacementMap', { in: 'SourceGraphic', in2: 'normals', scale: panel ? 43 : 34, xChannelSelector: 'R', yChannelSelector: 'G' }, filter);
      }
      const map = filter.firstElementChild;
      map.setAttribute('width', String(width));
      map.setAttribute('height', String(height));
      map.setAttribute('href', url);
      surface.style.setProperty('--shell-lens', `url("#${id}")`);
      surface.dataset.glassSize = geometry;
      surface.setAttribute('data-glass-refraction', '');
    }
  });
  surfaces.forEach(surface => observer.observe(surface));
}
