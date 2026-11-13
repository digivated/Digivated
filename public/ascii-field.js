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

    // Re-rasterize a flowing ribbon and swimming forms into glyphs each frame.
    // The contours, shading and tails change inside the text grid.
    const ramp = ' .,:;+=x*#@';
    pieces.forEach((piece,index) => {
      const w=54,h=19,t=tick/12+index*2.1;
      const lines=[];
      for(let y=0;y<h;y++){
        let line='';
        for(let x=0;x<w;x++){
          const px=(x-w/2)/w,py=(y-h/2)/h;
          let value=0;
          if(index===2){
            const wave=Math.sin(px*8+t*.65)*.19+Math.sin(px*15-t*.4)*.06;
            const d=Math.abs(py-wave);
            value=Math.max(0,1-d/.19)*(.5+.5*Math.sin(px*13+py*8-t));
          } else {
            const cx=Math.sin(t*.35)*.12;
            const cy=Math.sin(t*.65)*.07;
            const u=(px-cx)*(index%2?-1:1),v=py-cy;
            const bend=Math.sin(t*1.3-u*12)*.045;
            const body=1-(u/.23)**2-((v-bend)/.19)**2;
            if(body>0) value=Math.sqrt(body)*(.58+.3*Math.sin(u*18+v*10+t*.6));
            if(u<-.18&&u>-.36){
              const spread=(-u-.18)*1.25;
              const tail=Math.abs(v-Math.sin(t*1.3)*.07);
              if(tail<spread) value=Math.max(value,.38+.25*Math.sin(t+v*18));
            }
            // Fins ripple along the body rather than moving a static block.
            if(Math.abs(u)<.13&&Math.abs(v-bend)<.30&&Math.abs(v-bend)>.17)
              value=Math.max(value,Math.max(0,1-Math.abs(u)/.13)*.35*(.6+.4*Math.sin(t*1.3+u*20)));
            if((u-.15)**2+(v+.035)**2<.0008)value=.95;
          }
          line+=ramp[Math.min(ramp.length-1,Math.max(0,Math.floor(value*(ramp.length-1))))];
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
