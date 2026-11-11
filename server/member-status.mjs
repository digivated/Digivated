import { FOUNDING_COOKIE, foundingConfig, readMember } from './founding-access.mjs';

export function makeMemberStatusHandler(deps = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Use GET.' }));
      return;
    }
    try {
      const hasSession = String(req.headers.cookie || '').includes(`${FOUNDING_COOKIE}=`);
      const member = hasSession && !!await (deps.readMember || readMember)(req, foundingConfig(deps.env || process.env), deps.fetcher || fetch);
      res.statusCode = 200;
      res.end(JSON.stringify({ member }));
    } catch {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Membership status is temporarily unavailable.' }));
    }
  };
}
