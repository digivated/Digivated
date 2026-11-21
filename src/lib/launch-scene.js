const tau = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function smooth(start, end, value) {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createLaunchScene(canvas, { compact = false } = {}) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  let width = 0;
  let height = 0;
  let density = 1;
  let columns = 0;
  const strands = compact ? 20 : 33;
  const shades = ['#34333a1c', '#34333a31', '#34333a56', '#28272f80', '#28272faa'];

  function resize(nextWidth, nextHeight, pixelRatio = 1) {
    width = nextWidth;
    height = nextHeight;
    density = Math.min(pixelRatio, 1.5);
    columns = Math.min(142, Math.max(66, Math.round(width / 8)));
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
  }

  function render(seconds, { x = 0, y = 0, scroll = 0, attract = 0, approach = 0 } = {}) {
    if (!width || !height) return;
    const mobile = width < 700;
    const paths = shades.map(() => new Path2D());
    const time = seconds * tau / 24;
    const reach = mobile ? .82 : .89;
    const spread = mobile ? .16 : compact ? .23 : .32;

    for (let col = 0; col < columns; col++) {
      const u = col / (columns - 1);
      const travel = (u - .5) * tau * .92;
      const baseX = width * (1.04 - (mobile ? u * 1.1 : Math.pow(u, 1.48) * 1.16));
      const fold = Math.sin(travel - time * .8) * .42 + .56;
      const fall = Math.pow(u, .87) * reach;
      const ridge = (mobile ? .23 : .12) + fall + Math.sin(u * 7.2 - time) * .077;
      const depthWave = Math.sin(u * 10 - time * 1.6);
      const scale = .62 + .38 * Math.sin(u * Math.PI);

      for (let row = 0; row < strands; row++) {
        const cross = row / (strands - 1) - .5;
        const roll = Math.sin(time + u * 9 + cross * .9);
        let px = baseX + cross * width * .12 * roll + depthWave * width * .016;
        let py = height * (ridge + cross * spread * (fold + .5) - scroll * .07);
        py += Math.sin(u * 23 + cross * 5 - time * 1.3) * height * .019;
        py += depthWave * cross * height * .08;
        px += x * width * .017 * scale;
        py += y * height * .035 * scale;
        if (attract > .01) {
          const dx = px - width * (.5 + x * .48), dy = py - height * (.5 + y * .48);
          const falloff = Math.exp(-(dx * dx + dy * dy) / Math.pow(Math.min(width, height) * .15, 2));
          px += dx * falloff * attract * .34;
          py += dy * falloff * attract * .34;
        }
        py += approach * cross * height * .08;

        // Keep the black typography clear, even as the ribbon turns toward it.
        const readingArea = mobile
          ? smooth(.45, .71, py / height)
          : Math.max(smooth(.46, .77, px / width), smooth(.62, .88, py / height) * .7);
        const edge = smooth(0, .16, u) * (1 - smooth(.76, 1, u)) * (1 - Math.abs(cross) * .8);
        const weight = readingArea * edge;
        if (weight < .048) continue;
        const shade = clamp(Math.floor(weight * 4.85 + roll * .36), 0, shades.length - 1);
        const radius = (.65 + weight * 1.34) * (compact ? .86 : 1) * (1 + depthWave * .14);
        paths[shade].moveTo(px + radius, py);
        paths[shade].arc(px, py, radius, 0, tau);
      }
    }

    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, width, height);
    paths.forEach((path, index) => {
      context.fillStyle = shades[index];
      context.fill(path);
    });
  }

  return { resize, render };
}
