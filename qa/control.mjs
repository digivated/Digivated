import { setQaMode } from './control-lib.mjs';

const mode = String(process.argv[2] || '').toUpperCase();
const result = await setQaMode({ mode, repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
console.log(`Digivated QA ${result.mode}; ${result.canceled} running or queued monitor run(s) canceled.`);
