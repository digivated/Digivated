const turn = Math.PI * 2;
const loopSeconds = 24;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const lerp = (a, b, amount) => a + (b - a) * amount;

function ease(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function random(index) {
  const value = Math.sin(index * 127.1 + 19.17) * 43758.5453;
  return value - Math.floor(value);
}

function lens(index, u, v, w) {
  const angle = turn * u;
  if (index % 10 < 6) {
    const tube = turn * v;
    const radius = .69 + .066 * Math.cos(tube);
    return [Math.cos(angle) * radius - .12, Math.sin(angle) * radius - .15, .14 * Math.sin(tube)];
  }
  if (index % 10 < 8) {
    const radius = .47 * Math.sqrt(v);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const wave = .11 * Math.sin(x * 8 + y * 10);
    return [x - .12, y - .15, wave];
  }
  const cross = (v - .5) * .15;
  return [.38 + u * .46 + cross, .34 + u * .55 - cross, (w - .5) * .14];
}

function orbit(index, u, v, w) {
  if (index % 8 < 2) {
    const y = 2 * u - 1;
    const radius = .33 * Math.sqrt(1 - y * y);
    return [radius * Math.cos(v * turn), y * .33, radius * Math.sin(v * turn)];
  }
  const angle = u * turn, tilt = (index % 3 - 1) * .86;
  const radius = .83 + (v - .5) * .105;
  return [radius * Math.cos(angle), Math.sin(angle) * radius * Math.sin(tilt) + (w - .5) * .09, Math.sin(angle) * radius * Math.cos(tilt)];
}

function lift(index, u, v, w) {
  if (index % 7 < 2) {
    const y = u * 1.5 - .8;
    const radius = (.17 + .25 * u) * Math.sqrt(v);
    return [radius * Math.cos(w * turn), y, radius * Math.sin(w * turn)];
  }
  const level = index % 5;
  const angle = turn * u;
  const radius = .33 + level * .105 + (v - .5) * .12;
  const square = value => Math.sign(value) * Math.sqrt(Math.abs(value));
  return [square(Math.cos(angle)) * radius, level * .25 - .49 + (w - .5) * .07, square(Math.sin(angle)) * radius];
}

const models = { lens, orbit, lift };

export function createLaunchScene(canvas, { mode = 'lens', compact = false } = {}) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const count = compact ? 580 : 1680;
  const home = mode === 'lens' && !compact;
  const origin = models[mode] || lens;
  const destination = mode === 'lift' ? orbit : lift;
  const dots = Array.from({ length: count }, (_, index) => {
    const id = index * 7, u = random(id), v = random(id + 1), w = random(id + 2);
    return {
      from: origin(index, u, v, w),
      to: destination(index, u, v, w),
      offset: random(id + 3) - .5,
      drift: random(id + 4) - .5,
      size: .7 + random(id + 5) * .8,
      phase: random(id + 6) * turn,
    };
  });
  let width = 0, height = 0, pixelRatio = 1;

  function resize(nextWidth, nextHeight, density = 1) {
    width = nextWidth;
    height = nextHeight;
    pixelRatio = Math.min(density, compact ? 1.25 : 1.6);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
  }

  function render(time, { x: pointerX = 0, y: pointerY = 0, scroll = 0, attract = 0, approach = 0 } = {}) {
    if (!width || !height) return;
    const seconds = (time % loopSeconds + loopSeconds) % loopSeconds;
    const phase = seconds * turn / loopSeconds;
    const yaw = Math.sin(phase) * (home ? .66 : .9) + pointerX * .28;
    const pitch = -.22 + .18 * Math.sin(phase * 2) + pointerY * .18;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinX = Math.sin(pitch), cosX = Math.cos(pitch);
    const unit = Math.min(width * .46, height * .49) * (1 + .09 * Math.sin(phase) + scroll * .16);
    const centerX = width * .51;
    const centerY = height * (.49 - scroll * .1);
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const dissolve = ease((seconds - 5) / 3.8) * (1 - ease((seconds - 15) / 4.8));

    for (const dot of dots) {
      const stagger = dissolve + dot.offset * .85 * Math.sin(dissolve * Math.PI);
      const blend = ease(stagger);
      const burst = Math.sin(blend * Math.PI) * (home ? .7 : .43) + approach * .26;
      // Both poses share a set of particles. A staggered burst opens each
      // silhouette into a cloud before the dots gather into the next form.
      const [startX, startY, startZ] = dot.from;
      const [endX, endY, endZ] = dot.to;
      const x = lerp(startX, endX, blend) + Math.cos(dot.phase) * burst;
      const y = lerp(startY, endY, blend) + Math.sin(dot.phase) * burst * .63;
      const z = lerp(startZ, endZ, blend) + dot.drift * burst;
      const depthY = z * cosY - x * sinY;
      const depth = y * sinX + depthY * cosX;
      const perspective = 2.85 / (2.85 - depth);
      let px = centerX + (x * cosY + z * sinY) * unit * perspective;
      let py = centerY + (y * cosX - depthY * sinX) * unit * perspective;
      if (attract > .01) {
        const dx = px - (centerX + pointerX * width * .43);
        const dy = py - (centerY + pointerY * height * .43);
        const energy = Math.exp(-(dx * dx + dy * dy) / (unit * unit * .28)) * attract * .38;
        px += dx * energy;
        py += dy * energy;
      }
      const radius = dot.size * (compact ? .93 : 1.24) * perspective;
      const tone = clamp(Math.floor((depth + .72) * 2.4 + dot.drift), 0, 3);
      paths[tone].moveTo(px + radius, py);
      paths[tone].arc(px, py, radius, 0, turn);
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const ink = ['#24262032', '#24262068', '#242620a6', '#181a16e0'];
    paths.forEach((path, index) => {
      context.fillStyle = ink[index];
      context.fill(path);
    });
  }

  return { resize, render };
}
