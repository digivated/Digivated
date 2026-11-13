// Original text artwork: a quiet community workshop, with no application state.
if (!document.querySelector('.ascii-ambient')) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const builder = document.querySelector('[data-ascii-field]');
  const ambient = document.createElement('div');
  ambient.className = 'ascii-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  const pieces = Array.from({length:4}, () => {
    const pre = document.createElement('pre');
    pre.className = 'ascii-drift';
    ambient.append(pre);
    return pre;
  });
  document.body.prepend(ambient);
  const stages = [
    ['Sketch', 'Turn a rough idea into a plan', [
      '$ open notebook.md', 'problem: too many open tabs', 'idea: one place to save them',
      '+------+     +-------------+', '| save | --> | find later  |', '+------+     +-------------+',
      'scope: save / search / share',
    ]],
    ['Prototype', 'Draw the first working screen', [
      '+-- pocket / draft ----------+', '| search [________________]  |',
      '| +---------+ +------------+ |', '| | links   | | notes      | |',
      '| +---------+ +------------+ |', '|                 [+ save]   |', '+----------------------------+',
    ]],
    ['Build', 'Wire the interface to saved data', [
      'export function save(link) {', '  const entry = parse(link);',
      '  if (!entry) return false;', '  bookmarks.add(entry);',
      '  return true;', '}', '$ npm run build',
    ]],
    ['Test', 'Catch a small-screen layout bug', [
      '$ npm test', '[ok] save a link',
      '[ok] search saved links', '[..] narrow screen wraps',
      '     fix: allow title to wrap', '[ok] narrow screen retest', '3 checks passed',
    ]],
    ['Ship', 'Send the first version live', [
      '$ git push origin main', '  build  [==========] done',
      '  assets [==========] ready', '  deploy -> production',
      '               /\\', '          .   /__\\   .', '             /|__|\\',
    ]],
    ['Iterate', 'Turn the first feedback into a fix', [
      '> maya: can I sort my links?', '> dev: adding newest first',
      '+ sort: newest | oldest', '[ok] remembers your choice',
      '$ git commit -m "Add sorting"', 'v0.2.0 is live', 'next: see what people build',
    ]],
  ];
  const code = ['git diff', 'await build()', 'test("save")', 'return next;', 'git push', 'if (ready) {', 'npm run build'];
  const codeStreams = builder ? Array.from({length:3}, (_, index) => {
    const stream = document.createElement('pre');
    stream.className = 'ascii-code-stream';
    stream.dataset.stream = index;
    ambient.append(stream);
    return stream;
  }) : [];
  let tick = 0;
  let timer;
  function draw() {
    if (builder) {
      const index = Math.floor(tick / 48) % stages.length;
      const [name, caption, lines] = stages[index];
      const step = reduced.matches ? 47 : tick % 48;
      const lineIndex = Math.min(lines.length - 1, Math.floor(step / 4));
      const screen = lines.map((line, i) => {
        const visible = i > lineIndex ? '' : i === lineIndex && step < 28
          ? line.slice(0, Math.ceil(line.length * (step % 4 + 1) / 4)) + (tick % 2 ? '_' : '')
          : line;
        return '| ' + visible.padEnd(33) + '|';
      });
      const figure = [
        '          ', '   .---.  ', '   |o o|  ', "   '---'  ",
        '    /|\\  ', step % 8 < 4 ? ' __/ |\\_ ' : ' __/ | \\_',
        '|___/|____',
      ];
      builder.textContent = [
        'DIGIVATED / BUILD LOG                     v0.2',
        '             +----------------------------------+',
        ...screen.map((line, i) => figure[i] + '   ' + line),
        '             +-----------------+----------------+',
        '       _________[ keyboard ]__|_|_____________',
        '      /=======================================/',
        '',
        caption,
        stages.map(([label], i) => i === index ? '[' + label + ']' : label).join(' '),
      ].join('\n');
      if (tick % 4 === 0 || reduced.matches) codeStreams.forEach((stream, i) => {
        const row = Math.floor(tick / 4) + i * 2;
        stream.textContent = Array.from({length: 5}, (_, j) =>
          ' '.repeat((j * 3 + i * 2) % 7) + code[(row + j) % code.length]
        ).join('\n');
      });
    }

    // Four quiet signal fields. Pulses expand through glyphs instead of translating a static image.
    const ramp = '  .·:+=*#';
    pieces.forEach((piece,index) => {
      const w=54,h=19,t=tick*.11+index*2.6;
      const lines=[];
      for(let y=0;y<h;y++){
        let line='';
        for(let x=0;x<w;x++){
          const px=(x-w/2)/w,py=(y-h/2)/h;
          const radius=Math.hypot(px*1.35,py*1.7);
          const sweep=(t*.18)%1.1;
          const ring=Math.max(0,1-Math.abs(radius-sweep)/.025);
          const echo=Math.max(0,1-Math.abs(radius-((sweep+.36)%1.1))/.018)*.5;
          const ray=Math.max(0,1-Math.abs(py-Math.sin(px*7-t*.55)*.035)/.018)*.28;
          const center=Math.max(0,1-radius/.055)*(.45+.15*Math.sin(t));
          const value=Math.max(ring,echo,ray,center);
          line+=ramp[Math.min(ramp.length-1,Math.floor(value*(ramp.length-1)))];
        }
        lines.push(line);
      }
      piece.textContent=lines.join('\n');
    });
  }
  function sync() {
    clearInterval(timer);
    ambient.toggleAttribute('data-paused', document.hidden);
    draw();
    if (!document.hidden && !reduced.matches) timer=setInterval(()=>{tick++;draw();},125);
  }
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  sync();
}
