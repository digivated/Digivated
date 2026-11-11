import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test('the homepage uses a static summary card and does not load the promo video',async({page})=>{
 const videoRequests:string[]=[];page.on('request',r=>{if(r.url().endsWith('.mp4'))videoRequests.push(r.url());});await page.route('**/api/**',r=>r.fulfill({json:{items:[],next:null,ready:false}}));
 await page.goto(base+'/');
 await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
 await expect(page.locator('meta[name="twitter:player"]')).toHaveCount(0);
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','https://digivated.com/digivated-og-card.png');
 await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content','https://digivated.com/digivated-og-card.png');
 await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content','Good projects deserve to be discovered · Digivated');
 expect(videoRequests).toEqual([]);
 await page.goto(base+'/membership');
 await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
 await expect(page.locator('meta[name="twitter:player"]')).toHaveCount(0);
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','https://digivated.com/digivated-social-card.png');
});
test('standalone player uses native controls and plays the real video',async({page})=>{
 await page.goto(base+'/video-player/index.html');const video=page.locator('video');await expect(video).toHaveAttribute('preload','none');await expect(video).toHaveAttribute('controls','');
 await video.evaluate(async e=>{const v=e as HTMLVideoElement;v.muted=true;await v.play();});await expect.poll(()=>video.evaluate(e=>(e as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
 expect(await video.evaluate(e=>(e as HTMLVideoElement).videoWidth)).toBe(1280);await video.evaluate(e=>(e as HTMLVideoElement).pause());
});
