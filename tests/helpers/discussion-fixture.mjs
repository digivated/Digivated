// Shared fixtures for discussion, thread and points tests (real Redis when available).
export const origin = 'https://digivated.com';
export const people = {
  maker: { id: '0b6f2d0a-1c1e-4f7a-9d5b-0a0a0a0a0a01', email: 'maker@fixture.test' },
  sam: { id: '0b6f2d0a-1c1e-4f7a-9d5b-0a0a0a0a0a02', email: 'sam@fixture.test' },
  dev: { id: '0b6f2d0a-1c1e-4f7a-9d5b-0a0a0a0a0a03', email: 'dev@fixture.test' },
};
export const verifyAccount = async req => {
  const match = /^Bearer (\w+)$/.exec(req.headers.authorization || '');
  return match ? people[match[1]] || null : null;
};
export function caller(handler) {
  return async (method, url, body, { as, ip = '192.0.2.10', headers = {} } = {}) => {
    let data, status = 200; const out = {};
    const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader(k, v) { out[k] = v; }, end(value) { data = JSON.parse(value); } };
    await handler({ url, method, body, headers: { origin, 'content-type': 'application/json', 'x-real-ip': ip, 'user-agent': 'Mozilla/5.0', ...(as ? { authorization: `Bearer ${as}` } : {}), ...headers } }, res);
    return { status, data, headers: out };
  };
}
export const project = { id: 'project-one', name: 'Pocketlog', creator: 'Ana', status: 'approved', consent: true, image: 'data:image/png;base64,AA==', url: 'https://fixture.test/', accountId: people.maker.id, slug: 'pocketlog', pagePublished: true, page: { consent: true } };
export async function seed(redis) {
  await redis(['FLUSHDB']);
  await redis(['SET', 'digivated:submission:project-one', JSON.stringify(project)]);
  await redis(['SET', `digivated:creator:profile:${people.maker.id}`, JSON.stringify({ name: 'Ana', bio: '', website: '', social: '', public: true, hasLogo: false, updatedAt: '2026-01-01T00:00:00.000Z' })]);
}
