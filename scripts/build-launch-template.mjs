import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
await mkdir('server/generated',{recursive:true});
await writeFile('server/generated/project.html',await readFile('dist/launch-template/index.html'));
await rm('dist/launch-template',{recursive:true});
// Vercel serves /sitemap.xml from the runtime function so it can include live public URLs.
// Local preview and CI keep the static file generated from the public page list.
if (process.env.VERCEL === '1') await rm('dist/sitemap.xml', { force: true });
