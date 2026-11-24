import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
await mkdir('server/generated',{recursive:true});
await writeFile('server/generated/project.html',await readFile('dist/launch-template/index.html'));
await rm('dist/launch-template',{recursive:true});
await writeFile('server/generated/creator.html',await readFile('dist/creator/index.html'));
await writeFile('server/generated/thread.html',await readFile('dist/threads/thread/index.html'));
await writeFile('server/generated/news-story.html',await readFile('dist/news/story/index.html'));
// Story pages are served at /news/<headline>-<id>. The bare template is not a public page.
await rm('dist/news/story',{recursive:true});
await writeFile('server/generated/projects.html',await readFile('dist/projects/index.html'));
if (process.env.VERCEL === '1') { await rm('dist/creator',{recursive:true}); await rm('dist/projects',{recursive:true}); }
// Vercel serves /sitemap.xml from the runtime function so it can include live public URLs.
// Local preview and CI keep the static file generated from the public page list.
if (process.env.VERCEL === '1') {
  // Preview HTML responses get a toolbar script appended. These paths are served
  // by functions that return the exact plain-text body instead.
  await rm('dist/sitemap.xml', { force: true });
  await rm('dist/googlef8b001e22ee0d4b9.html', { force: true });
}
