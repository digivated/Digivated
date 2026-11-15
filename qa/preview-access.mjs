export function qaTarget(value = 'https://digivated.com') {
  const url = new URL(value);
  const preview = /^digivated-[a-z0-9-]+-digivated\.vercel\.app$/.test(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname !== '/' ||
      (url.hostname !== 'digivated.com' && !preview)) {
    throw new Error('QA target must be digivated.com or a Digivated Vercel preview origin.');
  }
  return { baseURL: url.origin, preview };
}

export function previewHeaders(requestURL, baseURL, secret, headers = {}) {
  const result = { ...headers };
  delete result['x-vercel-protection-bypass'];
  const target = qaTarget(baseURL);
  if (secret && target.preview && new URL(requestURL).origin === target.baseURL) {
    result['x-vercel-protection-bypass'] = secret;
  }
  return result;
}
