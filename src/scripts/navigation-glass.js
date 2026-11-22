import { attachLiquidLens, attachLiquidMotion } from '@liquefy-ui/core';

const optics = {
  bar: { bezel: 16, blur: .7, dispersion: 0, saturation: 1, strength: .83 },
  menu: { bezel: 17, blur: 1.1, dispersion: 0, saturation: 1, strength: .73 },
  search: { bezel: 14, blur: 1.3, saturation: 1, strength: .56 },
  action: { bezel: 9, blur: .65, dispersion: 0, saturation: 1, strength: .72 },
};

document.querySelectorAll('[data-glass-surface]').forEach(surface => {
  const kind = surface.dataset.glassSurface;
  attachLiquidLens(surface, { ...optics[kind], respectReducedTransparency: true });
  if (kind === 'action') {
    attachLiquidMotion(surface, null, { intensity: .76, bounce: .065, tilt: 1.6, respectReducedMotion: true, wobbliness: .05, webgl: false });
  }
});
