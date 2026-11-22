import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// A grayscale, scroll-scrubbed take on the MotionSites and Scrolltide references.
function SettingsMotion() {
  const rings = useRef(null);
  useEffect(() => {
    const element = rings.current;
    const masthead = element.closest('.settings-masthead');
    let frame = 0;
    function update() {
      frame = 0;
      const { top, height } = masthead.getBoundingClientRect();
      if (!height) return;
      const start = window.innerHeight * .24;
      const progress = Math.min(1, Math.max(0, (start - top) / (height + start)));
      element.style.setProperty('--settings-motion-progress', String(progress));
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    addEventListener('scroll', scheduleUpdate, { passive: true });
    addEventListener('resize', scheduleUpdate, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', scheduleUpdate);
      removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return <div className="settings-motion-rings" ref={rings}>
    <span />
    <span />
    <span />
    <span />
  </div>;
}

export function mountSettingsMotion(host) {
  createRoot(host).render(<SettingsMotion />);
}
