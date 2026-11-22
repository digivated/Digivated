// Paper fold text (vanilla port of the "FoldText" idea): letters hang from a top hinge and
// unfold into place one after another, with a crease shadow that lifts as they open.
// Hovering bends nearby letters back a little. Screen readers and search read the original
// text from a visually hidden copy. Skipped entirely under reduced motion and without JS.
const EASE = 'cubic-bezier(.215,.61,.355,1)'; // power3.out

export function foldText(element, {
  splitBy = 'char', foldAngle = 92, duration = 650, stagger = 45, delay = 0, creaseShading = 0.55,
  hoverRefold = true, refoldRadius = 140, refoldAngle = 45,
} = {}) {
  if (!element || element.dataset.folded || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.dataset.folded = '';
  element.classList.add('dg-fold');
  const chars = [];
  const text = element.textContent;
  const build = target => {
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { target.append(part); continue; }
      const word = document.createElement('span'); word.className = 'dg-fold-word';
      if (splitBy === 'word') { word.classList.add('dg-fold-char'); word.textContent = part; chars.push(word); }
      else for (const letter of part) { const char = document.createElement('span'); char.className = 'dg-fold-char'; char.textContent = letter; word.append(char); chars.push(char); }
      target.append(word);
    }
  };
  if (splitBy === 'word') {
    // Whole words read normally, so the text itself stays exactly as it was.
    element.classList.add('dg-fold-words'); element.replaceChildren(); build(element);
  } else {
    // Letter boxes would be read one by one ("D i s c o v e r"), so screen readers get a
    // hidden copy of the plain text and the letters are visual only.
    const visual = document.createElement('span'); visual.className = 'dg-fold-text'; visual.setAttribute('aria-hidden', 'true'); build(visual);
    const label = document.createElement('span'); label.className = 'sr-only'; label.textContent = text;
    element.replaceChildren(label, visual);
  }
  const dim = 1 - creaseShading;
  let ready = false;
  const runs = chars.map((char, index) => char.animate([
    { transform: `rotateX(${foldAngle}deg)`, opacity: 0, filter: `brightness(${dim})` },
    { opacity: 1, offset: 0.3 },
    { transform: 'rotateX(0deg)', opacity: 1, filter: 'brightness(1)' },
  ], { duration, delay: delay + index * stagger, easing: EASE, fill: 'backwards' }));
  // Leave no running animations behind once the letters are in place.
  Promise.all(runs.map(run => run.finished)).then(() => { runs.forEach(run => run.cancel()); ready = true; }, () => { ready = true; });

  if (!hoverRefold || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let frame = 0, pointer = null;
  const paint = () => {
    frame = 0;
    for (const char of chars) {
      let amount = 0;
      if (pointer) {
        const box = char.getBoundingClientRect();
        const distance = Math.hypot(box.left + box.width / 2 - pointer.x, box.top + box.height / 2 - pointer.y);
        amount = Math.max(0, 1 - distance / refoldRadius);
      }
      char.style.setProperty('--fold', `${(amount * refoldAngle).toFixed(1)}deg`);
      char.style.setProperty('--crease', String(1 - amount * creaseShading * (refoldAngle / foldAngle)));
    }
  };
  element.addEventListener('pointermove', event => { if (!ready) return; pointer = { x: event.clientX, y: event.clientY }; frame ||= requestAnimationFrame(paint); });
  element.addEventListener('pointerleave', () => { pointer = null; frame ||= requestAnimationFrame(paint); });
}
