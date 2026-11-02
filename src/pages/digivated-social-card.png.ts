import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
export const prerender = true;
export const GET: APIRoute = async () => {
 const svg = await readFile(new URL(`file://${process.cwd()}/public/digivated-social-card.svg`));
 const png = await sharp(svg).resize(1200, 630).png().toBuffer();
 return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
};
