import { createLaunchScene } from '../lib/launch-scene.js';

const preference = matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');
const connection = navigator.connection;
const scenes = [...document.querySelectorAll('[data-launch-scene]')];
const motionEnabled = () => !preference.matches && !forcedColors.matches && !connection?.saveData;
const permitted = () => motionEnabled() && !document.hidden;
const scenesOnscreen = new Set();
const state = new Map();
let frame = 0;
let previous = 0;

function render(now) {
  frame = requestAnimationFrame(render);
  if (previous && now - previous < 50) return;
  const elapsed = previous ? Math.min(100, now - previous) / 1000 : 0;
  previous = now;
  for (const element of scenesOnscreen) {
    const scene = state.get(element);
    if (!scene) continue;
    scene.approach += (scene.targetApproach - scene.approach) * .08;
    scene.time += elapsed * (1 - .68 * scene.approach);
    scene.x += (scene.targetX - scene.x) * .12;
    scene.y += (scene.targetY - scene.y) * .12;
    scene.attract += (scene.targetEnergy - scene.attract) * .13;
    // The scene responds to native scrolling. It never captures wheel or touch.
    let scroll = 0;
    if (scene.hero && scene.height > 0) {
      scroll = Math.max(0, Math.min(1, window.scrollY / scene.height));
    }
    scene.engine.render(scene.time, { x: scene.x, y: scene.y, scroll, attract: scene.attract, approach: scene.approach });
  }
}

function sync() {
  const allowed = permitted();
  const canAnimate = motionEnabled();
  for (const element of scenes) {
    if (!canAnimate) {
      delete element.dataset.sceneReady;
      continue;
    }
    if (!scenesOnscreen.has(element)) continue;
    const scene = state.get(element) || init(element);
    if (scene) element.dataset.sceneReady = '';
  }
  if (allowed && scenesOnscreen.size && state.size) {
    if (!frame) frame = requestAnimationFrame(render);
    return;
  }
  cancelAnimationFrame(frame);
  frame = 0;
  previous = 0;
}

function init(element) {
  const canvas = element.querySelector('canvas');
  if (!canvas) return null;
  const engine = createLaunchScene(canvas, { mode: element.dataset.sceneSize });
  if (!engine) return null;
  const scene = { engine, hero: element.dataset.sceneSize === 'hero', height: 0, time: 1.2, x: 0, y: 0, targetX: 0, targetY: 0, attract: 0, targetEnergy: 0, approach: 0, targetApproach: 0 };
  state.set(element, scene);
  const resize = () => {
    scene.height = element.clientHeight;
    engine.resize(element.clientWidth, scene.height, devicePixelRatio);
    if (scenesOnscreen.has(element)) engine.render(scene.time, scene);
  };
  resize();
  new ResizeObserver(resize).observe(element);
  const stage = document.querySelector('main');
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !permitted()) return;
    const box = element.getBoundingClientRect();
    scene.targetX = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    scene.targetY = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
    scene.targetEnergy = 1;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => {
    scene.targetX = 0;
    scene.targetY = 0;
    scene.targetEnergy = 0;
  });
  const actions = stage.querySelector('.dg-hero-actions');
  if (actions) {
    actions.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') scene.targetApproach = 1;
    });
    actions.addEventListener('pointerleave', () => {
      if (!actions.contains(document.activeElement)) scene.targetApproach = 0;
    });
    actions.addEventListener('focusin', () => { scene.targetApproach = 1; });
    actions.addEventListener('focusout', event => {
      if (!actions.contains(event.relatedTarget)) scene.targetApproach = 0;
    });
  }
  return scene;
}

if (scenes.length && 'IntersectionObserver' in window && 'ResizeObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) scenesOnscreen.add(entry.target);
      else scenesOnscreen.delete(entry.target);
    }
    sync();
  });
  scenes.forEach(scene => observer.observe(scene));
  preference.addEventListener('change', sync);
  forcedColors.addEventListener('change', sync);
  connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  });
  window.addEventListener('pageshow', sync);
}
