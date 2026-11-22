const glyphs = ' .,:;+*x#%@';
const opacitySteps = [0, .07, .13, .21, .33];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function smooth(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// Rasterize each character and ink weight once. Every animation frame uses the same atlas.
export function createLaunchScene(canvas, { mode = 'masthead' } = {}) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const atlas = document.createElement('canvas');
  const ink = atlas.getContext('2d');
  if (!ink) return null;

  let width = 0, height = 0, cellWidth = 0, cellHeight = 0;
  let columns = 0, rows = 0;
  let mobile = false, lanes = [];

  function resize(nextWidth, nextHeight, pixelRatio = 1) {
    const density = Math.min(pixelRatio, 1.5);
    width = canvas.width = Math.max(1, Math.round(nextWidth * density));
    height = canvas.height = Math.max(1, Math.round(nextHeight * density));
    mobile = nextWidth < 700;
    const pitch = Math.max(mobile ? 9 : 11, Math.sqrt(nextWidth * nextHeight / 6000));
    cellWidth = Math.round(pitch * density);
    cellHeight = Math.round(pitch * 1.27 * density);
    columns = Math.ceil(width / cellWidth);
    rows = Math.ceil(height / cellHeight);
    lanes = Array.from({ length: columns }, (_, column) => {
      const u = (column + .5) / columns;
      return {
        u,
        edge: Math.max(1 - smooth(.04, .28, u), smooth(.70, .98, u)),
        right: smooth(.45, .86, u),
      };
    });
    atlas.width = glyphs.length * cellWidth;
    atlas.height = opacitySteps.length * cellHeight;
    ink.font = `${Math.round(cellWidth * .96)}px ui-monospace, Menlo, Consolas, monospace`;
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.fillStyle = '#32352f';
    for (const [shade, opacity] of opacitySteps.entries()) {
      if (!opacity) continue;
      ink.globalAlpha = opacity;
      for (let glyph = 1; glyph < glyphs.length; glyph++) {
        ink.fillText(glyphs[glyph], (glyph + .5) * cellWidth, (shade + .5) * cellHeight);
      }
    }
  }

  function render(seconds, { x = 0, y = 0, scroll = 0, attract = 0, approach = 0 } = {}) {
    if (!columns || !rows) return;
    context.clearRect(0, 0, width, height);
    const hero = mode === 'hero';
    const time = seconds * .28;
    const pointerX = .5 + x * .48;
    const pointerY = .5 + y * .48;
    const drift = scroll * .18;

    for (let row = 0; row < rows; row++) {
      const v = (row + .5) / rows;
      const waveY = v + drift + y * .018;
      const phase = waveY * 7.4 + Math.sin(waveY * 9.1 - time * .7) * 1.35 - time;
      const floor = Math.sin(waveY * 14 + time * .5) * .17;
      for (let column = 0; column < columns; column++) {
        const { u, edge, right } = lanes[column];
        const waveX = u + x * .022;
        // Open space around the headline and keep the middle of long pages quiet.
        const reading = hero
          ? mobile ? smooth(.37, .76, v) * .59 + edge * .15
            : right * (1 - scroll * .48) + edge * .15
          : edge * (mode === 'quiet' ? .44 : .67);
        if (reading < .1) continue;

        const field = .49
          + Math.sin(waveX * 10 + phase + approach * .26) * .29
          + Math.sin(waveX * 18 - waveY * 7 + time * .73) * .18
          + Math.cos(waveX * 26 + waveY * 18 - time * .68) * .08
          + floor;
        const dx = (u - pointerX) * 1.25;
        const dy = v - pointerY;
        const glow = (1 - smooth(.02, .21, dx * dx + dy * dy)) * attract * .13;
        const brightness = clamp((field + glow - .22) / .69);
        const glyph = Math.floor(brightness * (glyphs.length - 1));
        const shade = Math.round(clamp(reading * (.48 + .52 * brightness)) * (opacitySteps.length - 1));
        if (!glyph || !shade) continue;
        context.drawImage(
          atlas, glyph * cellWidth, shade * cellHeight, cellWidth, cellHeight,
          column * cellWidth, row * cellHeight, cellWidth, cellHeight,
        );
      }
    }
  }

  return { resize, render };
}
