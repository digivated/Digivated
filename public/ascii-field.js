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
    ['01 / a small idea', ['    .---.       ', '    | ? |       ', '    \'---\'       ', '  sketch / plan ']],
    ['02 / shape the idea', [' +-----+ +---+  ', ' | ... | | . |  ', ' +-----+ +---+  ', '  a first draft ']],
    ['03 / make it work', [' > build        ', '   {            ', '     hello();   ', '   }            ']],
    ['04 / test & refine', [' [x] layout     ', ' [x] keyboard   ', ' [x] small screen', '     all clear  ']],
    ['05 / send it out', ['       /\\       ', '      /  \\      ', '      | +|      ', '     /|__|\\     ']],
    ['06 / build together', ['  o     o    o  ', ' /|\\   /|\\  /|\\ ', ' / \\   / \\  / \\ ', '  hello, world  ']]
  ];
  let tick = 0;
  let timer;
  function draw() {
    const stage = stages[Math.floor(tick / 40) % stages.length];
    const screen = stage[1].map(line => '| ' + line.padEnd(17) + '|').join('\n');
    if (builder) builder.textContent =
      'a little workshop / always making\n\n' +
      '                       .-------------------.\n' +
      screen.split('\n').map((line,i)=> ['     .---.             ','     |o o|             ','     \'---\'             ','      /|\\              '][i]+line).join('\n') +
      '\n     / | ' + (Math.floor(tick / 8) % 2 ? '\\__' : '\\_ ') + '          \'---------+---------\'\n' +
      '    /__|____                 _|_\n' +
      '   /  /    /========================\n' +
      '  /__/____/    |               |\n' +
      '     / \\       |               |\n\n' +
      stage[0] + '\n' +
      stages.map((_,i)=>i === Math.floor(tick / 40) % stages.length ? '[+]' : ' . ').join('  ');

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
      piece.textContent=lines.join('\\n');
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
