const BODY = 'google-site-verification: googlef8b001e22ee0d4b9.html';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method not allowed.');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? '' : BODY);
}
