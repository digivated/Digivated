import { createHash } from 'node:crypto';
import legacyImages from './project-logo-overrides.json' with { type: 'json' };

export const projectLogoVersion = record => createHash('sha256').update(record.image || '').digest('hex').slice(0, 12);

export function projectDisplayLogo(record, overrides = legacyImages) {
  if (!record.image) return '';
  const original = `/api/projects?image=${record.id}&v=${projectLogoVersion(record)}`;
  const reviewed = Object.hasOwn(overrides, record.id) && overrides[record.id];
  if (!reviewed || record.image.length !== reviewed.length) return original;

  // Apply the replacement only while the exact reviewed upload is current.
  const checksum = createHash('sha256').update(record.image).digest('hex');
  if (checksum !== reviewed.sha256) return original;
  if (!reviewed.source) return '';
  const file = reviewed.file;
  if (file && !new RegExp(`^${record.id}\\.[a-f0-9]{12}\\.(?:png|svg|webp|ico)$`).test(file)) return original;
  return `/media/project-logos/${file || `${record.id}.webp`}`;
}
