import { createHash } from 'node:crypto';
import legacyImages from './project-logo-overrides.json' with { type: 'json' };

export function projectDisplayLogo(record, overrides = legacyImages) {
  if (!record.image) return '';
  const original = `/api/projects?image=${record.id}`;
  const reviewed = Object.hasOwn(overrides, record.id) && overrides[record.id];
  if (!reviewed || record.image.length !== reviewed.length) return original;

  // Apply the replacement only while the exact reviewed upload is current.
  const checksum = createHash('sha256').update(record.image).digest('hex');
  if (checksum !== reviewed.sha256) return original;
  return reviewed.source ? `/media/project-logos/${record.id}.webp` : '';
}
