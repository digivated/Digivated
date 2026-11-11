export function projectFeedbackHref(id, pageUrl) {
  const path = /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]*$/.test(pageUrl || '')
    ? pageUrl
    : `/projects/listing/${encodeURIComponent(id)}`;
  return path + '#feedback';
}
