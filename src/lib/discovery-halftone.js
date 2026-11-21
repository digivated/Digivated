// The supplied source sheet has two poses per hand, isolated on white.
const crops = [
  [0, .06, .47, .40], [.53, .06, .47, .40],
  [0, .55, .47, .40], [.53, .55, .47, .40],
];
const levels = [0, .26, .52, .78, 1];
const period = 20;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const hash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
function smooth(start, end, value) {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}
const mix = (time, start, end) => smooth(start, start + 1.9, time) * (1 - smooth(end, end + 1.9, time));

export function createHalftoneScene(canvas, image) {
  const output = canvas.getContext('2d');
  const tiles = crops.map(([x, y, width, height]) => {
    const tile = document.createElement('canvas');
    tile.width = 420;
    tile.height = Math.round(tile.width * height * image.naturalHeight / (width * image.naturalWidth));
    const context = tile.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, x * image.naturalWidth, y * image.naturalHeight,
      width * image.naturalWidth, height * image.naturalHeight, 0, 0, tile.width, tile.height);
    return tile;
  });
  const fields = [0, 1].map(() => document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
  let width, height, columns, rows, pitch, rowPitch, scale, mobile, seeds, fades;

  function resize(nextWidth, nextHeight, pixelRatio = window.devicePixelRatio) {
    width = nextWidth;
    height = nextHeight;
    mobile = width <= 640;
    scale = Math.min(2, pixelRatio || 1);
    pitch = Math.max(mobile ? 4 : 5, width / 205);
    rowPitch = pitch * 2.05;
    columns = Math.ceil(width / pitch);
    rows = Math.ceil(height / rowPitch);
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    for (const field of fields) {
      field.canvas.width = columns;
      field.canvas.height = rows;
    }
    seeds = new Float32Array(columns * rows);
    fades = new Float32Array(seeds.length);
    for (let y = 0; y < rows; y++) {
      const rowSeed = hash(y * 3.1, 7.7);
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        const distance = Math.abs((x + .5) / columns - .5);
        seeds[index] = .55 * hash(x, y) + .45 * rowSeed;
        const copyDistance = Math.hypot(distance / (mobile ? .44 : .28), ((y + .5) / rows - .38) / .19);
        fades[index] = smooth(.032, .108, distance) * smooth(.8, 1.25, copyDistance);
      }
    }
  }

  function sample(field, pose, angle) {
    field.setTransform(1, 0, 0, 1, 0, 0);
    field.fillStyle = '#fff';
    field.fillRect(0, 0, columns, rows);
    const handWidth = width * (mobile ? .71 : .54);
    const middle = height * (mobile ? .775 : .70);
    for (let side = 0; side < 2; side++) {
      const right = side === 1;
      const phase = right ? Math.PI : 0;
      const reach = (.027 * Math.sin(angle + phase) + .009 * Math.sin(2 * angle + 1.3 + phase)) * width;
      const breath = 1 + .055 * Math.sin(angle + .9 + phase);
      const pivot = right ? width : 0;
      const tile = tiles[pose * 2 + side];
      const handHeight = handWidth * tile.height / tile.width;
      const inset = width * (mobile ? .18 : .046);
      const left = right ? width - handWidth + inset - reach : reach - inset;
      field.setTransform(columns / width, 0, 0, rows / height, 0, 0);
      field.translate(pivot, middle);
      field.rotate((right ? -1 : 1) * .038 * Math.sin(angle + 2.1 + phase));
      field.scale(breath, breath);
      field.translate(-pivot, -middle);
      field.drawImage(tile, left, middle - handHeight / 2, handWidth, handHeight);
    }
    return field.getImageData(0, 0, columns, rows).data;
  }

  function render(seconds) {
    if (!width || !height) return;
    const time = ((seconds % period) + period) % period;
    const angle = time * 2 * Math.PI / period;
    const switches = [mix(time, 6.2, 14.6), mix(time, 2.4, 10.4)];
    const base = sample(fields[0], 0, angle);
    const changed = switches.some(value => value > 0) ? sample(fields[1], 1, angle) : base;
    const radii = levels.map((level, index) => pitch * .46 * (index === 1 ? .38 : level));
    const dots = levels.map(() => new Path2D());
    const tick = Math.floor(time * 6);
    for (let y = 0; y < rows; y++) {
      const shift = hash(y, tick) > .978 ? Math.round((hash(tick, y) - .5) * 5) : 0;
      const py = (y + .5) * rowPitch;
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        const seed = seeds[index];
        const blend = switches[x < columns / 2 ? 0 : 1];
        const pixel = (y * columns + clamp(x - shift, 0, columns - 1)) * 4;
        const luminance = (seed < blend ? changed : base)[pixel] / 255;
        let value = clamp((1 - luminance - .16) / .42, 0, 1) * fades[index];
        if (value < .13) continue;
        const front = Math.abs(seed - blend);
        if (blend > .001 && blend < .999 && front < .12) {
          value *= (front / .12) * (hash(x + tick, y) < .4 ? .55 : 1);
        }
        value *= .93 + .07 * Math.sin(time * 3.2 + seed * 40);
        let level = levels.length - 1;
        while (level && value < levels[level] - .13) level--;
        if (!level) continue;
        const px = (x + .5) * pitch;
        dots[level].moveTo(px + radii[level], py);
        dots[level].arc(px, py, radii[level], 0, Math.PI * 2);
      }
    }
    output.setTransform(scale, 0, 0, scale, 0, 0);
    output.clearRect(0, 0, width, height);
    output.fillStyle = '#0d0d0d';
    for (const path of dots) output.fill(path);
  }

  return { resize, render };
}
