// Regenerates the static link-preview cards in public/share/ (1200x630 PNG).
// Run manually after changing a card: node scripts/build-share-cards.mjs
// Static files, so previews cost nothing at runtime and never depend on server fonts.
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const mark = (await readFile(new URL('digivated-daylight-mark.png', root))).toString('base64');
const FONT = "Inter, 'Inter Display', Helvetica, Arial, sans-serif";
const INK = '#0b0b0c', MUTE = '#8a8a93', BODY = '#55555e', LINE = '#e4e4e9', BAR = '#ececf0';

const bar = (x, y, w, h = 12, fill = BAR) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;
const chip = (x, y, w, fill = BAR) => bar(x, y, w, 20, fill);
const caret = (x, y, n = 0) => `<g><rect x="${x}" y="${y}" width="44" height="64" rx="12" fill="#fff" stroke="${LINE}"/><path d="M${x + 16} ${y + 26}l6-7 6 7" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${bar(x + 15, y + 40, 14, 9, n ? '#c9c9d1' : BAR)}</g>`;
const row = (y, { vote, tile, circle, lines = [250, 180], chips = [58, 74] }) => `
  <rect x="660" y="${y}" width="560" height="112" fill="#fff" stroke="${LINE}"/>
  ${vote ? caret(686, y + 24, 1) : ''}
  ${tile ? `<rect x="688" y="${y + 24}" width="64" height="64" rx="16" fill="${tile}"/>` : ''}
  ${circle ? `<circle cx="720" cy="${y + 56}" r="32" fill="${circle}"/>` : ''}
  ${bar(776, y + 26, lines[0], 16, INK)}
  ${bar(776, y + 54, lines[1], 11)}
  ${chip(776, y + 78, chips[0])}${chip(776 + chips[0] + 10, y + 78, chips[1])}`;

const mocks = {
  threads: [0, 1, 2].map(i => row(168 + i * 112, { vote: true, lines: [[330, 270, 360][i], [250, 300, 210][i]] })).join(''),
  thread: `
    <rect x="660" y="168" width="560" height="334" fill="#fff" stroke="${LINE}"/>
    ${caret(690, 198, 1)}
    ${bar(756, 204, 380, 20, INK)}${bar(756, 236, 240, 20, INK)}
    <circle cx="772" cy="296" r="14" fill="#d9d6fb"/>${bar(796, 291, 120, 10)}${bar(930, 291, 70, 10)}
    ${bar(690, 338, 470, 11)}${bar(690, 362, 430, 11)}${bar(690, 386, 300, 11)}
    <rect x="690" y="426" width="150" height="44" rx="22" fill="${INK}"/>${bar(714, 442, 78, 12, '#fff')}
    <rect x="852" y="426" width="44" height="44" rx="22" fill="#fff" stroke="${LINE}"/>`,
  projects: [['#e9e5ff', 0], ['#dff3e8', 1], ['#ffe9dc', 2]].map(([tile], i) => row(168 + i * 112, { tile, lines: [[300, 240, 330][i], [270, 320, 230][i]], chips: [66, 52] })).join(''),
  news: [0, 1, 2].map(i => `
    <rect x="660" y="${168 + i * 112}" width="560" height="112" fill="#fff" stroke="${LINE}"/>
    <rect x="688" y="${192 + i * 112}" width="96" height="64" rx="12" fill="${['#e9e5ff', '#dde9fb', '#ece9e3'][i]}"/>
    ${bar(808, 194 + i * 112, [320, 360, 290][i], 16, INK)}${bar(808, 222 + i * 112, [250, 200, 280][i], 11)}${chip(808, 246 + i * 112, 70)}`).join(''),
  creator: `
    <rect x="660" y="168" width="560" height="334" fill="#fff" stroke="${LINE}"/>
    <circle cx="752" cy="252" r="44" fill="#d9d6fb"/>
    ${bar(820, 230, 230, 20, INK)}${bar(820, 262, 160, 12)}
    ${bar(700, 328, 440, 11)}${bar(700, 352, 380, 11)}
    <rect x="700" y="398" width="200" height="72" rx="14" fill="#f7f7fa" stroke="${LINE}"/><rect x="916" y="398" width="200" height="72" rx="14" fill="#f7f7fa" stroke="${LINE}"/>
    <rect x="716" y="414" width="40" height="40" rx="10" fill="#e9e5ff"/>${bar(768, 420, 110, 10, INK)}${bar(768, 440, 80, 9)}
    <rect x="932" y="414" width="40" height="40" rx="10" fill="#dff3e8"/>${bar(984, 420, 110, 10, INK)}${bar(984, 440, 80, 9)}`
};

const cards = {
  'threads': { kicker: 'Threads', h: ['Talk shop with', 'indie makers.'], sub: 'Ask questions, share progress and get feedback.', cta: 'Join the conversation' },
  'thread': { kicker: 'Threads', h: ['Join the', 'discussion.'], sub: 'Read the thread and add your reply on Digivated Threads.', cta: 'Read the thread', mock: 'thread' },
  'projects': { kicker: 'Projects', h: ['Discover what', 'makers are building.'], sub: 'Independent products and the makers behind them.', cta: 'Browse projects' },
  'news': { kicker: 'News', h: ['Tech. AI. Markets.', 'What’s next.'], sub: 'Stories on what is moving tech, AI and markets.', cta: 'Read the news' },
  'creator': { kicker: 'Creator', h: ['Meet the builders', 'behind the work.'], sub: 'Profiles and projects from independent makers.', cta: 'View profile' }
};

const wrap = (text, max) => text.split(' ').reduce((lines, word) => { const last = lines[lines.length - 1]; if (last && (last + ' ' + word).length <= max) lines[lines.length - 1] = last + ' ' + word; else lines.push(word); return lines; }, []);
const svg = (key, c) => {
  const long = Math.max(...c.h.map(l => l.length)) > 16;
  const size = long ? 64 : 76, lh = size + 6, top = 262;
  const kickerW = 40 + c.kicker.length * 11;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${FONT}">
<defs><radialGradient id="g" cx="8%" cy="0%" r="75%"><stop stop-color="#e3dffc"/><stop offset="1" stop-color="#f7f7fa"/></radialGradient>
<filter id="s" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#14142b" flood-opacity=".10"/></filter></defs>
<rect width="1200" height="630" fill="#f7f7fa"/><rect width="1200" height="630" fill="url(#g)"/>
<image x="72" y="62" width="44" height="44" href="data:image/png;base64,${mark}"/>
<text x="128" y="94" font-size="30" font-weight="700" fill="${INK}" letter-spacing="-.6">Digivated</text>
<rect x="72" y="150" width="${kickerW}" height="38" rx="19" fill="#fff" stroke="${LINE}"/><text x="${72 + kickerW / 2}" y="175" text-anchor="middle" font-size="16" font-weight="600" fill="${BODY}" letter-spacing=".8">${c.kicker.toUpperCase()}</text>
<text x="72" y="${top + 40}" font-size="${size}" font-weight="800" fill="${INK}" letter-spacing="${long ? -2.4 : -3}">${c.h[0]}</text>
<text x="72" y="${top + 40 + lh}" font-size="${size}" font-weight="800" fill="${MUTE}" letter-spacing="${long ? -2.4 : -3}">${c.h[1]}</text>
<text font-size="26" fill="${BODY}">${wrap(c.sub, 36).map((l, i) => `<tspan x="72" y="${top + 40 + lh + 62 + i * 36}">${l}</tspan>`).join('')}</text>
<rect x="72" y="520" width="${70 + c.cta.length * 12.5}" height="64" rx="18" fill="${INK}"/><text x="${72 + 28}" y="560" font-size="24" font-weight="600" fill="#fff">${c.cta} →</text>
<text x="${72 + 70 + c.cta.length * 12.5 + 24}" y="560" font-size="24" font-weight="500" fill="${BODY}">digivated.com</text>
<g filter="url(#s)"><rect x="640" y="92" width="600" height="470" rx="18" fill="#fff" stroke="${LINE}"/></g>
<circle cx="668" cy="124" r="6" fill="#ff5f57"/><circle cx="690" cy="124" r="6" fill="#febc2e"/><circle cx="712" cy="124" r="6" fill="#28c840"/>
<rect x="770" y="110" width="300" height="28" rx="14" fill="${BAR}"/><text x="920" y="130" text-anchor="middle" font-size="14" font-weight="500" fill="${MUTE}">digivated.com</text>
<clipPath id="c"><rect x="641" y="150" width="598" height="411"/></clipPath><g clip-path="url(#c)"><rect x="641" y="150" width="598" height="411" fill="#fbfbfd"/>${mocks[c.mock || key]}</g>
</svg>`;
};

await mkdir(new URL('share/', root), { recursive: true });
for (const [key, c] of Object.entries(cards)) {
  const png = await sharp(Buffer.from(svg(key, c))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(`share/${key}.png`, root), png);
  console.log(key, (png.length / 1024).toFixed(0) + ' KB');
}
