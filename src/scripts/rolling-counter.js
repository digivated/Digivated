// Rolling digit counter (vanilla port of the "Counter" idea: per-digit wheels that roll
// the short way, with a little bounce, stagger, edge fade and motion blur).
// Usage: const counter = rollingCounter(element); counter.set('6d 14h 05m');
// Digits roll; every other character is shown as is. The element keeps its own text
// styles (font, size, tabular numbers); screen readers should use the element's label.
const DIGITS = '0123456789';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function rollingCounter(root, { duration = 700, stagger = 40, intro = true } = {}) {
  root.classList.add('dg-roll');
  let pattern = '', slots = [], first = true;

  function build(text) {
    pattern = text.replace(/\d/g, '#');
    slots = [];
    const track = document.createElement('span');
    track.className = 'dg-roll-track';
    track.setAttribute('aria-hidden', 'true');
    for (const char of text) {
      if (!/\d/.test(char)) { track.append(Object.assign(document.createElement('span'), { className: 'dg-roll-char', textContent: char })); continue; }
      const slot = document.createElement('span'); slot.className = 'dg-roll-slot';
      const strip = document.createElement('span'); strip.className = 'dg-roll-strip';
      // Three runs of 0-9 so a wheel can roll either way across 9 → 0 and settle back to the middle.
      for (let i = 0; i < 30; i++) strip.append(Object.assign(document.createElement('span'), { textContent: DIGITS[i % 10] }));
      slot.append(strip); track.append(slot);
      slots.push({ strip, position: 10, digit: 0 });
    }
    root.replaceChildren(track);
  }

  function place(slot, position, animate, delay) {
    slot.position = position;
    const strip = slot.strip;
    strip.style.transition = animate ? `transform ${duration}ms var(--dg-roll-ease) ${delay}ms, filter ${duration}ms ease-out ${delay}ms` : 'none';
    strip.style.transform = `translateY(${-position * 1.25}em)`;
    if (!animate) return;
    strip.classList.add('is-moving');
    clearTimeout(slot.settle);
    slot.settle = setTimeout(() => {
      strip.classList.remove('is-moving');
      // Quietly move back to the middle run so the next roll always has room.
      const middle = 10 + slot.digit;
      if (slot.position !== middle) place(slot, middle, false, 0);
    }, duration + delay + 30);
  }

  function set(text) {
    text = String(text);
    const rebuilt = text.replace(/\d/g, '#') !== pattern;
    if (rebuilt) build(text);
    const animate = !reduced() && !document.hidden && (!first || intro);
    const digits = [...text].filter(char => /\d/.test(char)).map(Number);
    // Stagger from the right, like an odometer: the last digit moves first.
    digits.forEach((digit, index) => {
      const slot = slots[index];
      const delay = (digits.length - 1 - index) * stagger;
      if (rebuilt) { slot.digit = 0; place(slot, 10, false, 0); }
      let delta = (digit - slot.digit + 10) % 10;
      if (delta > 5) delta -= 10; // the short way round
      if (!delta) return;
      slot.digit = digit;
      if (!animate) { place(slot, 10 + digit, false, 0); return; }
      // Force the start position to paint before rolling (first frame of the intro).
      if (rebuilt) slot.strip.getBoundingClientRect();
      place(slot, slot.position + delta, true, delay);
    });
    first = false;
  }
  return { set };
}
