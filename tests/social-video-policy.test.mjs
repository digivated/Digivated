import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
test('only the dedicated video player is excluded from normal anti-framing headers',()=>{
 const normal=config.headers.find(rule=>rule.source.includes('(?!video-player'));
 const pattern=new RegExp('^'+normal.source+'$');
 for(const path of ['/','/admin','/membership','/api/admin','/video-player-other','/projects/example'])assert.equal(pattern.test(path),true);
 for(const path of ['/video-player','/video-player/','/video-player/index.html'])assert.equal(pattern.test(path),false);
 assert.equal(normal.headers.find(h=>h.key==='X-Frame-Options').value,'DENY');
 assert.match(normal.headers.find(h=>h.key==='Content-Security-Policy').value,/frame-ancestors 'none'/);
 const player=config.headers.find(rule=>rule.source==='/video-player/:path*');
 const csp=player.headers.find(h=>h.key==='Content-Security-Policy').value;
 assert.match(csp,/media-src 'self'/);assert.match(csp,/frame-ancestors 'self' https:\/\/x.com/);assert.doesNotMatch(csp,/frame-ancestors \*/);
});
