// Original text artwork: an indie builder who keeps shipping real products, with no application state.
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
  // Phase starts (in frames) for sketch, build, test and ship.
  const phaseStart = [0, 20, 70, 118];
  const projectFrames = 150;
  const workshopStages = ['SKETCH', 'BUILD', 'TEST', 'SHIP'];
  const hash = n => { let x = Math.imul((n | 0) + 1, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
  const two = n => String(n).padStart(2, '0');
  const mmss = t => two(Math.floor(t / 60)) + ':' + two(t % 60);
  // Seven-segment digits for the timer product.
  const segments = {
    '0':[' _ ','| |','|_|'], '1':['   ','  |','  |'], '2':[' _ ',' _|','|_ '], '3':[' _ ',' _|',' _|'],
    '4':['   ','|_|','  |'], '5':[' _ ','|_ ',' _|'], '6':[' _ ','|_ ','|_|'], '7':[' _ ','  |','  |'],
    '8':[' _ ','|_|','|_|'], '9':[' _ ','|_|',' _|'], ':':[' ','.','.']
  };
  const bigText = text => [0, 1, 2].map(row => [...text].map(ch => segments[ch][row]).join(' '));
  // Each product has its own sketch, source, commits and a working interface.
  const workshopProjects = [
    {
      name: 'Pocket Timer', slug: 'pocket-timer', mark: 'PT', task: 'a focus timer for deep work',
      sketch: ['+--------------------+', '|       25:00        |', '|  [start]  [reset]  |', '+--------------------+'],
      source: ['let left = 25 * 60;', 'start.onclick = () => {', '  timer = setInterval(tick, 1e3);', '};', 'function tick() {', '  render(--left);', '}'],
      commits: ['feat: countdown loop', 'feat: start and reset', 'style: big digits'],
      result: 'Focus sprint completes on time.',
      preview(s) {
        const left = s >= 36 ? 0 : Math.max(0, 1500 - s * 41);
        const fill = Math.round((1500 - left) / 1500 * 24);
        return ['      P O C K E T   T I M E R', '', ...bigText(mmss(left)).map(row => '         ' + row), '',
          '   [' + '#'.repeat(fill) + '.'.repeat(24 - fill) + ']',
          left === 0 ? '      * focus sprint complete *' : '        [ pause ]  [ reset ]'];
      }
    },
    {
      name: 'Byte Snake', slug: 'byte-snake', mark: 'BS', task: 'a retro snake game',
      sketch: ['+------------------+', '|  o o o @     *   |', '|                  |', '+------------------+', 'score: 000'],
      source: ['function step() {', '  head = move(head, dir);', '  if (hit(head, food)) {', '    grow(); score += 10;', '    food = spawn();', '  }', '  draw(snake, food);'],
      commits: ['feat: snake movement', 'feat: food and growth', 'feat: score counter'],
      result: 'Snake eats four bytes. High score!',
      preview(s) {
        const width = 32, height = 5, head = 6 + s * 2, foods = [18, 40, 58, 75];
        const cell = k => { const row = Math.floor(k / width) % height; return [row, row % 2 ? width - 1 - k % width : k % width]; };
        const rows = Array.from({length: height}, () => Array(width).fill(' '));
        const eaten = foods.filter(food => food <= head).length;
        foods.filter(food => food > head).forEach(food => { const [r, c] = cell(food); rows[r][c] = '*'; });
        for (let j = 4 + eaten * 2 - 1; j >= 0; j--) { if (head - j < 0) continue; const [r, c] = cell(head - j); rows[r][c] = j ? 'o' : '@'; }
        return ['      B Y T E   S N A K E', '  +' + '-'.repeat(width) + '+', ...rows.map(row => '  |' + row.join('') + '|'),
          '  +' + '-'.repeat(width) + '+', '  score ' + String(eaten * 10).padStart(3, '0') + '   best 040   ' + (eaten === 4 ? '[ new best ]' : '[ arrows ]')];
      }
    },
    {
      name: 'Skycast', slug: 'skycast', mark: 'SC', task: 'a weather app with a 5-day forecast',
      sketch: ['[ city ]        [ temp ]', '   ( sun )       24 C', 'MON  TUE  WED  THU  FRI'],
      source: ['const res = await fetch(api);', 'const { now, week } =', '  await res.json();', 'drawSun(now.temp);', 'week.forEach(day =>', '  row.add(card(day)));'],
      commits: ['feat: fetch forecast', 'feat: animated sun', 'feat: 5-day row'],
      result: 'Live forecast loads in 180ms.',
      preview(s) {
        const sun = s % 4 < 2
          ? ['   \\  |  /  ', '    .---.    ', ' --(     )-- ', "    `---'    ", '   /  |  \\  ']
          : ['   .  |  .   ', '  \\ .---. /  ', ' - (     ) - ', "  / `---' \\  ", '   .  |  .   '];
        const info = ['LISBON', Math.min(24, 12 + s) + ' C  sunny', 'feels like 26', 'wind 9 km/h', 'uv 6  high'];
        return ['      S K Y C A S T', ...sun.map((row, index) => ' ' + row + '  ' + info[index]), '',
          'MON 24  TUE 22  WED 17  THU 19  FRI 25', ' '.repeat(16) + [' / /', '/ / ', ' // '][s % 3]];
      }
    },
    {
      name: 'Huddle', slug: 'huddle', mark: 'HD', task: 'a tiny team chat',
      sketch: ['# channel', 'name | message', 'name | message', '[ type a message ] [>]'],
      source: ['socket.on("message", msg => {', '  list.append(bubble(msg));', '  list.scrollTop = 1e9;', '});', 'send.onclick = () =>', '  socket.emit("message", input);'],
      commits: ['feat: realtime socket', 'feat: message list', 'feat: typing indicator'],
      result: 'Messages arrive in real time.',
      preview(s) {
        const messages = [['ana', 'is the build up yet?'], ['you', 'shipping in 5 min'], ['sam', 'first signup just landed'], ['ana', 'no way!! :D'], ['you', 'next one already started']];
        const shown = Math.min(5, Math.floor(s / 6) + 1);
        const body = messages.slice(0, shown).map(([who, text]) => '  ' + who.padEnd(4) + '| ' + text);
        while (body.length < 5) body.push('');
        const next = messages[shown];
        const input = next && next[0] === 'you' ? next[1].slice(0, (s % 6) * 5) : 'message #launch-day';
        return ['  H U D D L E      # launch-day', '  ' + '-'.repeat(32), ...body,
          next ? '  ' + next[0] + ' is typing' + '.'.repeat(1 + s % 3) : '  * 3 online',
          '  [ ' + input.padEnd(25).slice(0, 25) + ' ] [>]'];
      }
    },
    {
      name: 'Loopbox', slug: 'loopbox', mark: 'LB', task: 'a music player with a live equalizer',
      sketch: ['[cover]  track name', '|| |||| || ||| |||', '|<     ||     >|'],
      source: ['const ctx = new AudioContext();', 'const eq = ctx.createAnalyser();', 'track.connect(eq);', 'function frame() {', '  bars(eq.getByteData());', '  requestAnimationFrame(frame);', '}'],
      commits: ['feat: audio graph', 'feat: live equalizer', 'feat: transport controls'],
      result: 'Track plays with a live equalizer.',
      preview(s) {
        const bars = Array.from({length: 12}, (_, i) => Math.max(1, Math.min(5, Math.round(3 + 2 * Math.sin(s * .9 + i * 1.1) * Math.cos(s * .37 + i * .5)))));
        const time = 72 + s * 2, at = Math.round(time / 220 * 16);
        return ['   L O O P B O X      > now playing', '   night drive (lofi mix)',
          ...[0, 1, 2, 3, 4].map(row => '  ' + bars.map(h => h >= 5 - row ? '##' : '  ').join(' ')),
          '  ' + mmss(time) + ' [' + '='.repeat(at) + 'o' + '-'.repeat(16 - at) + '] 03:40', '       |<      ||      >|      ~'];
      }
    },
    {
      name: 'Ticker', slug: 'ticker', mark: 'TK', task: 'a live stock chart',
      sketch: ['$TICKER   142.80  +3.2%', '     /\\    /\\/', '  __/  \\__/', '1D  1W  [1M]  1Y'],
      source: ['const prices = await quotes(sym);', 'const pts = prices.map(scale);', 'chart.clear();', 'pts.forEach((p, x) =>', '  chart.plot(x, p.y, "*"));', 'label(last(prices));'],
      commits: ['feat: quote stream', 'feat: line chart', 'feat: range tabs'],
      result: 'Chart streams new prices live.',
      preview(s) {
        const width = 34, height = 6, f = x => Math.sin(x * .32) * 1.3 + x * .075 + Math.sin(x * 1.7) * .4;
        const values = Array.from({length: width}, (_, x) => f(x)), low = Math.min(...values), high = Math.max(...values);
        const rows = Array.from({length: height}, () => Array.from({length: width}, (_, x) => x % 6 === 0 ? '.' : ' '));
        const visible = Math.min(width, 4 + s);
        for (let x = 0; x < visible; x++) rows[height - 1 - Math.round((values[x] - low) / (high - low) * (height - 1))][x] = x === visible - 1 ? 'o' : '*';
        const price = (130 + values[visible - 1] * 5).toFixed(2), change = ((values[visible - 1] - values[0]) * 3.1).toFixed(1);
        return ['  $DGVT  ' + price + '  +' + change + '%    [ live ]', ...rows.map(row => '  |' + row.join('')), '  +' + '-'.repeat(width), '   1D   1W   [1M]   1Y   ALL'];
      }
    },
    {
      name: 'Flowboard', slug: 'flowboard', mark: 'FB', task: 'a kanban board for small teams',
      sketch: ['TODO      DOING     DONE', '[card]    [card]    [card]', '[card]              [card]', 'drag cards across ->'],
      source: ['card.ondragstart = e =>', '  e.dataTransfer.set(card.id);', 'col.ondrop = e => {', '  move(e.data, col.name);', '  save(board);', '};'],
      commits: ['feat: board columns', 'feat: drag and drop', 'feat: persist board'],
      result: 'Card drags from todo to done.',
      preview(s) {
        const rows = Array.from({length: 3}, () => Array(36).fill(' '));
        const place = (row, x, text) => [...text].forEach((ch, i) => { rows[row][x + i] = ch; });
        place(0, 0, '[ pricing ]'); place(1, 0, '[ docs    ]'); place(0, 12, '[ auth    ]'); place(0, 24, '[ landing ]'); place(1, 24, '[ db      ]');
        const x = s < 10 ? 0 : s < 14 ? (s - 10) * 3 : s < 24 ? 12 : s < 28 ? 12 + (s - 24) * 3 : 24;
        place(2, x, '[ ship v1 ]');
        return ['  F L O W B O A R D      sprint 12', '  TODO        DOING       DONE', '  ' + '-'.repeat(35), ...rows.map(row => '  ' + row.join('')), '',
          '  ' + (s >= 28 ? 3 : 2) + ' done  /  ' + (s >= 14 && s < 28 ? 2 : 1) + ' doing  /  ' + (s < 14 ? 3 : 2) + ' todo'];
      }
    },
    {
      name: 'Launchpad', slug: 'launchpad', mark: 'LP', task: 'a waitlist landing page',
      sketch: ['logo              [log in]', '    BIG HEADLINE HERE', '[ email ]    [ join ]'],
      source: ['form.onsubmit = async e => {', '  e.preventDefault();', '  await post("/join", email);', '  count.textContent++;', '  toast("you are in!");', '};'],
      commits: ['feat: hero section', 'feat: waitlist form', 'feat: live counter'],
      result: 'Waitlist signups start rolling in.',
      preview(s) {
        const email = 'ada@buildsthings.dev', pressed = s >= 26;
        const typed = (email.slice(0, Math.max(0, s - 4)) + (!pressed && s % 4 < 2 ? '_' : '')).slice(0, 20);
        const count = 128 + (pressed ? Math.min(9, s - 25) : 0);
        return ['  launchpad.app              [log in]', '  ' + '-'.repeat(34), '', '      Ship your side project', '          this weekend.', '',
          '  [ ' + typed.padEnd(20) + ' ] ' + (pressed && s < 29 ? '[>JOIN<]' : '[ JOIN ]'), '',
          '  * ' + count + ' builders on the waitlist' + (pressed && s < 34 ? '  +1' : '')];
      }
    },
    {
      name: 'Streaks', slug: 'streaks', mark: 'ST', task: 'a daily habit tracker',
      sketch: ['M  T  W  T  F  S  S', '[x][x][ ][ ][ ][ ][ ]', 'streak: 0 days'],
      source: ['function check(day) {', '  log[day] = true;', '  streak = countBack(log);', '  cell(day).mark("x");', '  if (streak % 7 === 0)', '    confetti();', '}'],
      commits: ['feat: habit grid', 'feat: streak math', 'feat: weekly confetti'],
      result: 'Four-week streak unlocked.',
      preview(s) {
        const filled = Math.min(28, 2 + s);
        const week = w => '  ' + Array.from({length: 7}, (_, d) => { const i = w * 7 + d; return i < filled ? '[x]' : i === filled ? (s % 2 ? '[>]' : '[ ]') : '[ ]'; }).join(' ');
        return ['  S T R E A K S      habit: ship daily', '   M   T   W   T   F   S   S', week(0), week(1), week(2), week(3), '',
          '  streak: ' + filled + ' days  ' + '*'.repeat(Math.floor(filled / 7)), filled % 7 === 0 ? '  * week complete! *' : ''];
      }
    },
    {
      name: 'Tiny Ledger', slug: 'tiny-ledger', mark: 'TL', task: 'a one-screen expense tracker',
      sketch: ['item ___________  $ ____ [ + ]', 'list: what I spent', 'total: every row added'],
      source: ['function addExpense(item, cents) {', '  entries.push({ item, cents });', '  total = entries.reduce(', '    (sum, row) => sum + row.cents,', '    0);', '  render(entries, total);', '}'],
      commits: ['feat: expense form', 'feat: running total', 'style: ledger table'],
      result: 'Every new expense updates the total.',
      preview(s) {
        const items = [['coffee', 350], ['train', 225], ['notebook', 400], ['domain', 1200], ['hosting', 500]];
        const shown = Math.min(5, 2 + Math.floor(s / 7));
        const money = cents => '$' + (cents / 100).toFixed(2);
        const body = items.slice(0, shown).map(([item, cents]) => '  ' + item.padEnd(22) + money(cents).padStart(8));
        if (shown < 5) body.push('  [ ' + items[shown][0] + ' ] [ ' + (items[shown][1] / 100).toFixed(2) + ' ] [ + ]');
        while (body.length < 5) body.push('');
        return ['        T I N Y   L E D G E R', '  ITEM                      COST', ...body, '  ' + '-'.repeat(30),
          '  TOTAL' + money(items.slice(0, shown).reduce((sum, [, cents]) => sum + cents, 0)).padStart(25)];
      }
    }
  ];
  function workshopFrame(frame, still = false) {
    const cycle = Math.floor(frame / projectFrames);
    const project = workshopProjects[cycle % workshopProjects.length];
    const age = still ? 95 : frame % projectFrames;
    const phase = still ? 2 : age < phaseStart[1] ? 0 : age < phaseStart[2] ? 1 : age < phaseStart[3] ? 2 : 3;
    const step = still ? 40 : age - phaseStart[phase];
    const shipped = phase === 3 && step >= 16;
    const celebrate = shipped && !still;
    const version = 'v' + (1 + Math.floor(cycle / workshopProjects.length)) + '.0';
    const grid = Array.from({length:workshopHeight},()=>Array(workshopWidth).fill(' '));
    const put = (x,y,text) => {
      if(y<0||y>=workshopHeight)return;
      for(let i=0;i<text.length;i++)if(x+i>=0&&x+i<workshopWidth)grid[y][x+i]=text[i];
    };
    const sprinkle = (x,y,ch) => { if (y >= 0 && y < workshopHeight && x >= 0 && x < workshopWidth && grid[y][x] === ' ') grid[y][x] = ch; };
    const box = (x,y,w,h,label='') => {
      put(x,y,'+'+'-'.repeat(w-2)+'+');
      for(let j=1;j<h-1;j++){put(x,y+j,'|');put(x+w-1,y+j,'|');}
      put(x,y+h-1,'+'+'-'.repeat(w-2)+'+');
      if(label)put(x+2,y,label);
    };
    const type = (x,y,text,delay=0) => put(x,y,text.slice(0,Math.max(0,Math.floor((step-delay)*1.7))));
    const spark = ['.','+','*','+'][Math.floor(age / 3) % 4];
    // Header: recording light, stage, and running studio stats.
    put(0,0,(still || age % 8 < 5 ? '(o)' : '( )') + ' REC   digivated / workshop');
    const stage = '[ ' + workshopStages[phase] + ' ]';
    put(workshopWidth - stage.length, 0, stage);
    const commits = 1180 + cycle * 41 + Math.floor(Math.min(age, phaseStart[3]) / 3);
    const users = 8800 + cycle * 263 + (shipped ? Math.min(263, (step - 16) * 24) : 0);
    put(0,1,'day ' + String(41 + cycle).padStart(3, '0') + '   shipped ' + String(26 + cycle + (shipped ? 1 : 0)).padStart(3, '0') + '   commits ' + commits + '   users ' + users);
    put(0,2,'-'.repeat(workshopWidth));
    put(0,3,'> now building: ' + project.name + ' - ' + project.task);
    // Shelf of recently shipped products; the newest lands when it goes live.
    put(1,4,'SHIPPED');
    const lastShipped = shipped ? cycle : cycle - 1;
    put(1,5,[3,2,1,0].map(back => {
      const item = workshopProjects[(((lastShipped - back) % workshopProjects.length) + workshopProjects.length) % workshopProjects.length];
      return '[' + (shipped && back === 0 && step < 22 ? (step % 2 ? '**' : '++') : item.mark) + ']';
    }).join(''));
    put(1,6,'='.repeat(17));
    // Workbench screen.
    box(20,4,43,16,' ' + project.slug + '.app ');
    put(23,6,'o o o'); put(32,6,phase === 3 ? 'https://' + project.slug + '.app' : phase === 2 ? 'localhost:3000' : '~/code/' + project.slug);
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
    put(8, 11, celebrate ? " ^ ^" : blink ? " - -" : " o o");
    put(8, 12, phase >= 2 ? "  \\_/" : "   _");
    if (celebrate) {
      // Fist pump: it shipped.
      put(step % 4 < 2 ? 1 : 2, 7, 'o');
      for (let y = 8; y <= 14; y++) put(2, y, '|');
      put(7, 7, step % 4 < 2 ? 'SHIPPED!' : 'shipped!');
    }
    {
      put(3, 17, phase === 0 ? " | |   |  /'J" : " | |   |  \\");
      put(3, 18, phase === 0 ? " | |___|_/ /" : typing && !celebrate ? " | |___|   \\__." : " | |___|  \\___.");
      put(3, 19, phase === 0 ? " |  \\_____/" : typing && !celebrate ? " |  \\________:>" : " |  \\________>:");
    }
    // Desk, keyboard and a steaming coffee anchor the scene.
    put(19,20,'___________|___|________________________');
    put(18,21,'/  [ '+(step%8<4?':::: :: :::':'::: :: ::::')+' ]     [_]        /');
    put(42,20,['(',')','~',' '][Math.floor(age / 2) % 4]);
    put(17,22,'+---------------------------------------+');
    put(20,23,'|');put(55,23,'|');
    const screen = (row, value) => put(23, row, value.slice(0, 38));
    if (phase === 0) {
      put(9,7,step%12<6?' . ! .':'   !');
      type(23,9,'> new ' + project.slug);
      project.sketch.forEach((line, index) => put(23, 11 + index, line.slice(0, Math.max(0, (step - 2 - index * 2) * 4))));
      screen(18, step >= 16 ? 'sketch saved -> build it' : 'sketching ' + spark);
    } else if (phase === 1) {
      screen(8, '[main.js]  style.css  test.js');
      let cursor = null;
      project.source.forEach((line, index) => {
        const delay = index * 6;
        if (step < delay) return;
        put(23, 9 + index, two(index + 1));
        type(27, 9 + index, line, delay);
        const typed = Math.floor((step - delay) * 1.7);
        if (typed < line.length) cursor = [27 + typed, 9 + index];
      });
      if (cursor && step % 4 < 2) put(cursor[0], cursor[1], '_');
      const written = project.source.filter((_, index) => step >= index * 6).length;
      screen(17, '+' + written + (written === 1 ? ' line' : ' lines') + '   3 files   ' + Math.min(3, Math.floor(step / 16)) + (Math.min(3, Math.floor(step / 16)) === 1 ? ' commit' : ' commits'));
      screen(18, step >= 44 ? '[ok] build ready' : '[ ' + spark + ' ] writing code');
    } else if (phase === 2) {
      if (step < 10) {
        type(23, 9, '> npm test');
        ['renders the main view', 'handles user input', (9 + cycle % 7) + ' passing, 0 failing'].forEach((line, index) => {
          if (step >= 2 + index * 3) screen(11 + index, '[ok] ' + line);
        });
        screen(18, '[ ' + spark + ' ] running tests');
      } else {
        project.preview(step - 10).forEach((line, index) => screen(9 + index, line));
        if (step >= 40) screen(18, '[ok] ' + project.result);
      }
    } else {
      type(23, 9, '> git push && ship ' + project.slug);
      if (step >= 2) { const done = Math.min(12, step - 2); screen(11, 'build    [' + '='.repeat(done) + '.'.repeat(12 - done) + ']' + (done === 12 ? ' ok' : '')); }
      if (step >= 8) screen(12, 'tests    [ok] all passing');
      if (step >= 10) screen(13, 'deploy   ' + (step >= 16 ? '[ok] edge, 18 regions' : '[' + '|/-\\'[step % 4] + '] uploading'));
      if (shipped) screen(15, '[ LIVE ] ' + project.slug + '.app  ' + version);
      if (step >= 18) screen(16, '+' + Math.min(263, (step - 16) * 24) + ' users in the first hour');
      screen(18, step >= 24 ? 'next idea loading ' + spark : shipped ? '[ok] shipped!' : 'shipping ' + spark);
      // Launch: a rocket climbs the screen, then confetti falls.
      if (!still && step >= 12 && step < 26) {
        const top = 17 - (step - 12);
        [' /\\ ', ' || ', '/||\\', step % 2 ? " ** " : " '' "].forEach((part, i) => {
          if (top + i >= 8 && top + i <= 17) put(56, top + i, part);
        });
      }
      if (celebrate) {
        for (let i = 0; i < 16; i++) sprinkle(22 + hash(i * 7 + cycle) % 39, [8, 10, 14, 17][(hash(i * 13) + step) % 4], '*+.o'[i % 4]);
      }
    }
    // Pipeline, commit log, progress and activity graph.
    put(1,25,workshopStages.map((name, i) => (i < phase ? '[x] ' : i === phase ? '[>] ' : '[ ] ') + name.toLowerCase()).join(' ----- '));
    const log = ['docs: sketch ' + project.slug, ...project.commits, 'test: cover the main flow', 'release: ' + project.slug + ' ' + version];
    const made = phase === 0 ? (step >= 16 ? 1 : 0) : phase === 1 ? 1 + Math.min(3, Math.floor(step / 16)) : phase === 2 ? (step >= 10 ? 5 : 4) : shipped ? 6 : 5;
    const sha = index => (hash(cycle * 16 + index) & 0xffffff).toString(16).padStart(6, '0');
    if (made) {
      put(1,27,'* ' + sha(made - 1) + '  ' + log[made - 1]);
      if (made > 1) put(1,28,'| ' + sha(made - 2) + '  ' + log[made - 2]);
    } else {
      put(1,27,'* ------  idea: ' + project.task);
    }
    put(1,29,'.'.repeat(60));
    put(1 + Math.floor(age * 57 / (projectFrames - 1)),29,'[+]');
    const shade = ' .:-=+*#';
    const offset = Math.floor(frame / 10);
    put(0,30,'activity');
    for (let i = 0; i < 54; i++) put(10 + i, 30, shade[i === 53 ? Math.min(7, 1 + Math.floor(age / 20)) : hash(i + offset) % 8]);
    put(1,31,phase >= 2 ? '>> ' + project.result : '>> ' + project.name + ': ' + project.task + '.');
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
