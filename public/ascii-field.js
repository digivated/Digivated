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
  const workshopStages = ['IDEA', 'DESIGN', 'CODE', 'TEST', 'LAUNCH', 'FEEDBACK'];
  function workshopFrame(frame, still = false) {
    const phase = still ? 2 : Math.floor(frame / 64) % 6;
    const step = still ? 55 : frame % 64;
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
    const spark = ['.','+','*','+'][Math.floor(frame/3)%4];
    put(0,0,'[ independent studio ]');
    put(47,0,workshopStages[phase].padStart(14));
    put(0,2,'one small idea. made real.');
    box(20,4,43,16,' pocket / workbench ');
    put(23,6,'o o o'); put(32,6,'localhost:3000');
    put(22,7,'-'.repeat(39));
    // The maker blinks, thinks, types, and reaches for the launch key.
    const blink = frame%39<3;
    put(5,8,'  .------.');
    put(5,9,' /        \\');
    put(5,10,blink?' |  -  -  |':' |  o  o  |');
    put(5,11,phase===4?' |   \\_/  |':' |   __   |');
    put(5,12," '--------'");
    put(5,13,'    /||\\');
    put(3,14,step%8<4?' __/ || \\____':' __/ ||  \\___');
    put(3,15,step%8<4?'|____||___  _/':'|____||____/  ');
    put(3,16,'     ||   [:::]');
    put(3,17,'  ___||___');
    put(3,18,' /   ||   \\');
    put(3,19,'/____||____\\');
    put(6,20,'   /  \\');
    put(5,21,'__/    \\__');
    // Desk and keyboard anchor the scene while the screen changes.
    put(19,20,'___________|___|________________________');
    put(18,21,'/  [ '+(step%8<4?':::: :: :::':'::: :: ::::')+' ]     [_]        /');
    put(17,22,'+---------------------------------------+');
    put(20,23,'|');put(55,23,'|');
    if(phase===0){
      put(9,5,step%12<6?' . ! .':'   !');put(9,6," '---'");
      type(23,9,'problem: too many open tabs');
      type(23,11,'idea: keep the good ones',8);
      box(24,13,12,4,' save ');box(44,13,14,4,' find ');
      put(37,15,step%10<5?'..>   ':'   ..>');
      type(23,18,'scope: save / search / share',18);
    } else if(phase===1){
      box(23,9,37,3,' search ');put(33,10,'[____________________]');
      box(23,13,17,5,' links ');box(43,13,17,5,' notes ');
      for(let y=14;y<17;y++){put(25,y,'- '+'.'.repeat(5+(y%3)*2));put(45,y,'- '+'.'.repeat(8-y%3));}
      put(27+(Math.floor(step/5)%26),18,'^');
    } else if(phase===2){
      const codeLines=['function save(link) {','  const item = parse(link);','  if (!item) return;','  store.add(item);','  render(collection);','}','> build --watch'];
      codeLines.forEach((l,i)=>type(23,9+i,l,i*5));
      put(23,18,step>42?'[ok] saved. preview updated.':'[ '+spark+' ] compiling changes');
    } else if(phase===3){
      put(23,9,'> test / small screens first');
      ['save a link','search collection','phone layout','keyboard navigation'].forEach((l,i)=>put(23,11+i,(step>i*10+9?'[ok] ':'[..] ')+l));
      put(23,17,step<38?'fix -> wrap long titles':'4 / 4 checks passed');
      put(23,18,step<38?'rebuilding '+spark:'ready to ship _');
    } else if(phase===4){
      type(23,9,'> deploy pocket.app');
      const n=Math.min(20,Math.floor(step/2));
      put(23,11,'['+'='.repeat(n)+' '.repeat(20-n)+']');
      put(23,13,step<42?'uploading / '+spark:'[live] pocket.app');
      const ry=18-Math.floor((step%32)/5);
      put(53,ry-2,' /\\ ');put(53,ry-1,'|==|');put(53,ry,'/||\\');
      put(53,ry+1,step%4<2?' :: ':' .. ');
      put(24,17,step>42?'hello, world.':'one last check...');
    } else {
      type(23,9,'maya: can I sort my links?');
      type(23,11,'dev: on it. newest first.',10);
      type(23,13,'+ sort: newest / oldest',20);
      put(23,16,step>40?'[ok] feedback -> v0.2':'listening '+spark);
      put(23,18,step>48?'back to the next good idea.':'small improvements, every day.');
    }
    // A working delivery line: packets travel through the current stage.
    put(1,25,'idea ---- design ---- code ---- test ---- ship ---- learn');
    const stops=[2,12,24,34,44,55];
    put(stops[phase],26,'^');
    const packet=1+Math.floor((frame%64)*58/64);
    put(1,28,'.'.repeat(60));put(packet,28,'[+]');
    const captions=['Notice a problem. Sketch a small solution.','Give the idea a shape you can try.','Make the parts work together.','Break it here. Make it better.','A little launch. A real beginning.','Listen, improve, and build again.'];
    put(1,30,captions[phase]);
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
