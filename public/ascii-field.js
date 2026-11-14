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
  if (builder) ambient.classList.add('ascii-workshop-signals');
  document.body.prepend(ambient);
  // A fixed glyph canvas keeps every frame the same size: no layout shifts.
  const workshopWidth = 64;
  const workshopHeight = 32;
  const projectFrames = 144;
  const workshopStages = ['SKETCH', 'BUILD', 'TRY', 'SHIP'];
  // Each project has its own source, interface and visible interaction.
  const workshopProjects = [
    {
      name: 'Pocket Timer', task: 'A tiny focus timer', command: 'pocket-timer',
      sketch: ['[ 05:00 ]', '[ start ] [ reset ]'],
      source: ['let seconds = 5;', 'start.onclick = tick;', 'function tick() {', '  show(seconds--);', '  if (seconds >= 0)', '    setTimeout(tick, 1000);', '}'],
      preview(step) {
        const elapsed = Math.min(5, Math.floor(step / 4));
        return ['      P O C K E T   T I M E R', '', '               00:0' + (5 - elapsed), '',
          '          [' + '='.repeat(elapsed) + '.'.repeat(5 - elapsed) + ']',
          '', elapsed === 5 ? '       * focus sprint complete *' : '          [ pause ] [ reset ]'];
      },
      result: 'Timer finishes a focus sprint.'
    },
    {
      name: 'Raincheck', task: 'A rainy-day pixel game', command: 'raincheck',
      sketch: ['. . .   falling rain', '  @     move the player', '[ ]     try to reach shelter'],
      source: ['function move(dx) {', '  player.x += dx;', '  draw(player, rain);', '  if (underRoof(player))', '    show("sheltered!");', '}'],
      preview(step) {
        const x = Math.min(24, Math.floor(step / 2) * 2);
        const rain = '.    /   .    /    .    /';
        return ['    R A I N C H E C K', '', ' '.repeat(step % 3) + rain,
          ' /   .    /        +-------+', '                   |       |',
          ' '.repeat(x) + '@', '----------------------------',
          x >= 20 ? '     [ok] reached shelter' : '     [ > ] move right'];
      },
      result: 'Player reaches shelter.'
    },
    {
      name: 'Tiny Ledger', task: 'A one-screen expense tracker', command: 'tiny-ledger',
      sketch: ['item __________  $ ___ [ + ]', 'list: show what I spent', 'total: add every row'],
      source: ['function addExpense(item, cents) {', '  entries.push({ item, cents });', '  total = entries.reduce(', '    (sum, row) => sum + row.cents,', '    0', '  );', '  render(entries, total);', '}'],
      preview(step) {
        return ['          T I N Y   L E D G E R', '', '  ITEM                        COST',
          '  coffee                     $3.50', '  train                      $2.25',
          step >= 12 ? '  notebook                   $4.00' : '  [ notebook ] [ 4.00 ] [ + ]',
          '  --------------------------------', step >= 12 ? '  TOTAL                      $9.75' : '  TOTAL                      $5.75'];
      },
      result: 'New expense updates the total.'
    },
    {
      name: 'Desk Garden', task: 'Water a tiny virtual plant', command: 'desk-garden',
      sketch: ['    .      seed', '  [___]    pot', '  [water]  grow one stage'],
      source: ['function water() {', '  stage = Math.min(stage + 1, 3);', '  draw(plantFrames[stage]);', '}', 'button.onclick = water;'],
      preview(step) {
        const stage = Math.min(3, Math.floor(step / 7));
        return ['          D E S K   G A R D E N', '', stage === 3 ? '                *' : '',
          stage >= 2 ? '              \\ | /' : '',
          stage >= 1 ? '                |' : '                .',
          '              [===]', '               |_|', stage === 3 ? '        [ok] plant in bloom' : '          [ water plant ]'];
      },
      result: 'Three taps grow a flower.'
    }
  ];
  function workshopFrame(frame, still = false) {
    const project = workshopProjects[Math.floor(frame / projectFrames) % workshopProjects.length];
    const age = frame % projectFrames;
    const phase = still ? 2 : age < 22 ? 0 : age < 76 ? 1 : age < 120 ? 2 : 3;
    const step = still ? 43 : age - [0, 22, 76, 120][phase];
    const grid = Array.from({length:workshopHeight},()=>Array(workshopWidth).fill(' '));
    const put = (x,y,text) => {
      if(y<0||y>=workshopHeight)return;
      for(let i=0;i<text.length;i++)if(x+i>=0&&x+i<workshopWidth)grid[y][x+i]=text[i];
    };
    const box = (x,y,w,h,label='') => {
      put(x,y,'+'+'-'.repeat(w-2)+'+');
      for(let j=1;j<h-1;j++){put(x,y+j,'|');put(x+w-1,y+j,'|');}
      put(x,y+h-1,'+'+'-'.repeat(w-2)+'+');
      if(label)put(x+2,y,label);
    };
    const type = (x,y,text,delay=0) => put(x,y,text.slice(0,Math.max(0,Math.floor((step-delay)*1.7))));
    const spark = ['.','+','*','+'][Math.floor(age / 3) % 4];
    put(0,0,'[ independent studio ]');
    put(47,0,workshopStages[phase].padStart(14));
    put(0,2,project.name + ' / ' + project.task);
    box(20,4,43,16,' ' + project.name + ' / workbench ');
    put(23,6,'o o o'); put(32,6,phase === 3 ? 'release / v1.0' : phase === 2 ? 'localhost / preview' : 'localhost / editor');
    put(22,7,'-'.repeat(39));
    // The maker wears headphones and leans in over the keyboard.
    const blink = !still && age % 39 < 3;
    const typing = !still && step % 8 < 4;
    put(4, 8, "    .-----.");
    put(4, 9, "  .' .---. `.");
    put(4, 10, " /  /     \\  \\");
    put(4, 11, "[=]|       |[=]");
    put(4, 12, "   |       |");
    put(4, 13, "   \\       /");
    put(4, 14, "    `--.--'");
    put(3, 15, " .--._/ \\_.--.");
    put(3, 16, " |  /`---'\\   \\");
    put(3, 20, " | \\_______/");
    put(3, 21, " +---+  \\__ \\");
    put(3, 22, "   |      | |");
    put(3, 23, " --+--    |_|");
    put(8, 11, blink ? " - -" : " o o");
    put(8, 12, phase >= 2 ? "  \\_/" : "   _");
    put(3, 17, phase === 0 ? " | |   |  /'J" : " | |   |  \\");
    put(3, 18, phase === 0 ? " | |___|_/ /" : typing ? " | |___|   \\__." : " | |___|  \\___.");
    put(3, 19, phase === 0 ? " |  \\_____/" : phase === 3 && step >= 16 ? " |  \\_________+" : typing ? " |  \\________:>" : " |  \\________>:");
    // Desk and keyboard anchor the scene while the screen changes.
    put(19,20,'___________|___|________________________');
    put(18,21,'/  [ '+(step%8<4?':::: :: :::':'::: :: ::::')+' ]     [_]        /');
    put(17,22,'+---------------------------------------+');
    put(20,23,'|');put(55,23,'|');
    const screen = (row, value) => put(23, row, value.slice(0, 38));
    if (phase === 0) {
      put(9,5,step%12<6?' . ! .':'   !');
      type(23,9,'> new ' + project.command);
      project.sketch.forEach((line, index) => {
        if (step >= 5 + index * 2) screen(12 + index, line);
      });
      screen(18, step >= 14 ? 'sketch saved' : 'sketching ' + spark);
    } else if (phase === 1) {
      screen(9, '> edit main.js');
      project.source.forEach((line, index) => type(23, 10 + index, line, index * 3));
      screen(18, step >= 39 ? '[ok] build ready' : '[ ' + spark + ' ] writing code');
    } else if (phase === 2) {
      project.preview(step).forEach((line, index) => screen(9 + index, line));
      if (step >= 31) screen(18, '[ok] ' + project.result);
    } else {
      type(23, 9, '> ship ' + project.command);
      const completed = Math.min(step, 16);
      screen(12, '[' + '='.repeat(completed) + '.'.repeat(16 - completed) + ']');
      if (step >= 16) {
        screen(15, '[ live ] ' + project.name + ' v1.0');
        screen(18, 'next project loading ' + spark);
      }
    }
    put(1,25,'sketch -------- build -------- try -------- ship');
    put([2,17,32,45][phase],26,'^');
    put(1,28,'.'.repeat(60));
    put(1 + Math.floor((still ? 119 : age) * 57 / (projectFrames - 1)),28,'[+]');
    put(1,30,phase >= 2 ? project.result : project.task + '.');
    return grid.map(row=>row.join('')).join('\n');
  }
  if(builder && 'ResizeObserver' in window){
    const sizeWorkshop = new ResizeObserver(([entry])=>{
      builder.style.setProperty('--workshop-font',`${Math.min(17,entry.contentRect.width/(workshopWidth*.6))}px`);
    });
    sizeWorkshop.observe(builder);
  }
  // Each signal is sampled onto a fixed character grid. Its core contracts
  // while the trailing paths bend and fade independently.
  const glyphs = ' .:-=+*#%@';
  const code = '{}<>/01';
  function signalFrame(frame, index) {
    const time = frame * .075 + index * 1.7;
    const pulse = Math.sin(time * 1.5);
    const cx = 26 + 8 * Math.sin(time * .33);
    const cy = 8 + 3 * Math.cos(time * .47);
    const rx = 9 + pulse * 1.8;
    const ry = 4 - pulse * .65;
    const rows = [];
    for (let y = 0; y < 24; y++) {
      let row = '';
      for (let x = 0; x < 56; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const radius = Math.hypot(dx / rx, dy / ry);
        const shell = Math.max(0, 1 - Math.abs(radius - 1) * 4);
        const wave = 1.4 + (time * .42 % 1.2);
        const echo = Math.max(0, 1 - Math.abs(radius - wave) * 8) * .27;
        let trail = 0;
        if (dy > 2 && dy < 14) {
          for (const offset of [-6, -2, 2, 6]) {
            const bend = Math.sin(dy * .37 - time * 1.2 + offset * .24) * (dy * .25);
            const filament = Math.max(0, 1 - Math.abs(dx - offset - bend));
            trail = Math.max(trail, filament * (1 - dy / 14) * .8);
          }
        }
        if (radius < .66 && (x + y * 2 + Math.floor(time * 2)) % 4 === 0) {
          row += code[(x + y + Math.floor(time * 3)) % code.length];
        } else {
          const light = Math.max(shell * .82, echo, trail);
          row += glyphs[Math.round(light * (glyphs.length - 1))];
        }
      }
      rows.push(row);
    }
    return rows.join('\n');
  }

  let tick = 0;
  let timer;
  let workshopVisible = true;
  let workshopTick = 0;
  if (builder && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      workshopVisible = entry.isIntersecting;
    });
    observer.observe(builder);
  }
  function draw() {
    if (builder) {
      if (workshopVisible || reduced.matches) {
        builder.textContent = workshopFrame(workshopTick, reduced.matches);
      }
      pieces.forEach((piece, index) => {
        piece.textContent = signalFrame(tick, index);
      });
      return;
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
    if (!document.hidden && !reduced.matches) timer=setInterval(() => {
      tick++;
      if (workshopVisible) workshopTick++;
      draw();
    }, 125);
  }
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  sync();
}
