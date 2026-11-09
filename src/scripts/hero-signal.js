const canvas = document.querySelector('.home-signal');

if (canvas) {
  const context = canvas.getContext('2d', { alpha: true });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const nodes = Array.from({ length: 11 }, (_, index) => ({ index, from: 0, to: 0, start: 0, end: 0 }));
  let width = 0;
  let height = 0;
  let visible = true;
  let frame = 0;
  let lastFrame = 0;

  const randomTarget = () => height * (0.34 + Math.random() * 0.32);
  const smooth = progress => progress * progress * (3 - 2 * progress);

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const scale = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const now = performance.now();
    nodes.forEach((node, index) => {
      node.from = node.to = height * (0.5 + Math.sin(index * 1.11) * 0.09);
      node.start = now;
      node.end = now + 1700 + Math.random() * 2400;
    });
    draw(now);
  }

  function pointsAt(now) {
    return nodes.map((node, index) => {
      if (!reducedMotion.matches && now >= node.end) {
        node.from = node.to;
        node.to = randomTarget();
        node.start = now;
        node.end = now + 2600 + Math.random() * 4100;
      }
      const progress = reducedMotion.matches ? 0 : smooth(Math.min(1, (now - node.start) / (node.end - node.start)));
      return { x: (index / (nodes.length - 1)) * width, y: node.from + (node.to - node.from) * progress };
    });
  }

  function draw(now) {
    if (!context || !width || !height) return;
    const points = pointsAt(now);
    context.clearRect(0, 0, width, height);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 0; index < points.length - 1; index++) {
      const previous = points[Math.max(0, index - 1)];
      const current = points[index];
      const next = points[index + 1];
      const following = points[Math.min(points.length - 1, index + 2)];
      context.bezierCurveTo(
        current.x + (next.x - previous.x) / 6, current.y + (next.y - previous.y) / 6,
        next.x - (following.x - current.x) / 6, next.y - (following.y - current.y) / 6,
        next.x, next.y,
      );
    }
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(145, 78, 217, .14)';
    context.lineWidth = 12;
    context.stroke();
    context.strokeStyle = 'rgba(195, 145, 250, .62)';
    context.lineWidth = 1.5;
    context.stroke();
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reducedMotion.matches) return;
    if (now - lastFrame >= 32) {
      draw(now);
      lastFrame = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (reducedMotion.matches) draw(performance.now());
    else if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false;
    sync();
  }, { rootMargin: '80px' }).observe(canvas);
  reducedMotion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
}
