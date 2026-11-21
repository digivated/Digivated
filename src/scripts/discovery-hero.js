import { createHalftoneScene } from '../lib/discovery-halftone.js';

const sheet = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85';
const hero = document.querySelector('[data-discovery-hero]');
const canvas = hero?.querySelector('[data-discovery-lights]');

if (canvas && canvas.getContext('2d') && 'IntersectionObserver' in window && 'ResizeObserver' in window) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scene;
  let requested = false;
  let visible = false;
  let recording = false;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  const allowed = () => !reduced.matches && !navigator.connection?.saveData;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }

  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (previous && now - previous < 33) return;
    elapsed += previous ? Math.min(80, now - previous) / 1000 : 0;
    previous = now;
    scene.render(elapsed);
  }

  function sync() {
    if (!allowed()) delete hero.dataset.halftoneReady;
    if (!visible || !allowed() || document.hidden || recording) {
      stop();
      return;
    }
    if (scene) {
      hero.dataset.halftoneReady = '';
      if (!frame) frame = requestAnimationFrame(animate);
      return;
    }
    if (requested) return;
    requested = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      try {
        scene = createHalftoneScene(canvas, image);
        const resize = () => {
          scene.resize(hero.clientWidth, hero.clientHeight);
          if (visible && allowed()) scene.render(elapsed);
        };
        resize();
        new ResizeObserver(resize).observe(hero);
        window.__render = seconds => {
          if (!allowed()) return;
          recording = true;
          stop();
          elapsed = seconds;
          scene.render(seconds);
        };
        sync();
      } catch {
        scene = undefined;
      }
    }, { once: true });
    image.src = sheet;
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(hero);
  reduced.addEventListener('change', sync);
  navigator.connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', sync);
}
