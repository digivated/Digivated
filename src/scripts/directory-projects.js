export async function loadDirectoryProjects() {
  const items = [], offsets = new Set(); let offset = 0, fair = null;
  do {
    if (offsets.has(offset)) break;
    offsets.add(offset);
    const response = await fetch('/api/projects?ranking=1&offset=' + offset, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error('unavailable');
    const page = await response.json();
    if (page.fairStart && !fair) fair = page.fairStart;
    items.push(...(page.items || []));
    offset = page.next ?? null;
  } while (offset != null);
  return { projects: [...new Map(items.filter(p => p?.id && p.name).map(p => [p.id, p])).values()], fair };
}
