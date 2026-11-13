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
    pieces[0].textContent = '     .---.     .-------.\n     |o o|     | '+(Math.floor(tick / 8)%2?'code_':'code ')+' |\n     \'---\'     \'---+---\'\n      /|\\____     _|_\n   __/_|____/============\n      / \\       |     |';
    pieces[1].textContent = '   o          o\n  /|\\   .-.  /|\\\n  / \\  ( + ) / \\\n        \'-\'\n     making together';
    pieces[2].textContent = Array.from({length:8},(_,y)=>
      Array.from({length:42},(_,x)=>{
        const v=Math.sin(x*.21+tick*.035+y*.55);
        return Math.abs(v-y*.13+.45)<.23 ? '~' : Math.abs(v-y*.13+.45)<.42 ? '.' : ' ';
      }).join('')).join('\n');
    pieces[3].textContent = '      .\n   .     .\n     /\\\n    /++\\\n   /____\\\n   | [] |\n   | __ |\n   ||  ||\n  little ideas';
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
