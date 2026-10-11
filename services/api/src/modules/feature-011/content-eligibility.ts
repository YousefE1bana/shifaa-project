import { deny } from './protection.js';
/** Interpret only the authorized SQL projection. Signature history is never an
 * eligibility predicate. SQL owns exact current basis and lineage selection. */
export function currentContentEligibility(
  row: Record<string, unknown>,
): 'effective' | 'future' | 'superseded' | 'unavailable' {
  const value = row['eligibility'];
  if (!['effective', 'future', 'superseded', 'unavailable'].includes(String(value))) deny();
  if (row['publicationState'] !== 'published') return 'unavailable';
  return value as 'effective' | 'future' | 'superseded' | 'unavailable';
}
