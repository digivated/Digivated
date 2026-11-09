import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:4321';
test('only the home link requests an X video card without loading video on the page',async({page})=>{
 const videoRequests:string[]=[];page.on('request',r=>{if(r.url().endsWith('.mp4'))videoRequests.push(r.url());});await page.route('**/api/**',r=>r.fulfill({json:{items:[],next:null,ready:false}}));
 await page.goto(base+'/');await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','player');await expect(page.locator('meta[name="twitter:player"]')).toHaveAttribute('content','https://digivated.com/video-player/index.html?v=3');expect(videoRequests).toEqual([]);
 await page.goto(base+'/membership');await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');await expect(page.locator('meta[name="twitter:player"]')).toHaveCount(0);
});
test('standalone player uses native controls and plays the real video',async({page})=>{
 await page.goto(base+'/video-player/index.html');const video=page.locator('video');await expect(video).toHaveAttribute('preload','none');await expect(video).toHaveAttribute('controls','');
 await video.evaluate(async e=>{const v=e as HTMLVideoElement;v.muted=true;await v.play();});await expect.poll(()=>video.evaluate(e=>(e as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
 expect(await video.evaluate(e=>(e as HTMLVideoElement).videoWidth)).toBe(1280);await video.evaluate(e=>(e as HTMLVideoElement).pause());
});
