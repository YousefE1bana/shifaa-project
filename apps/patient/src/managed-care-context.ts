import { FamilyCareClient } from '@shifaa/api-client/family-care';
import { patientAccessTokens } from './patient-auth-store';
import { patientOnboardingApi } from './identity-onboarding-api';
type Selection = {
  relationshipId: string;
  managedPatientId: string;
  actorPersonId: string;
  purpose: string;
  role: 'GUA' | 'DEL';
};
let selected: Selection | null = null;
class ManagedCareContextError extends Error {
  readonly status = 403;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Input is an existing F004 server response, never URL or form state. */
export function retainManagedRelationship(value: unknown): Selection | null {
  const row = value as Record<string, unknown> | null;
  if (
    !row ||
    row['status'] !== 'active' ||
    !Array.isArray(row['permissions']) ||
    !row['permissions'].includes('record.view') ||
    !['guardianship', 'delegation'].includes(String(row['relationship_type'])) ||
    !['id', 'managed_patient_id', 'actor_person_id'].every(
      (key) => typeof row[key] === 'string' && uuid.test(String(row[key])),
    )
  )
    return null;
  if (typeof row['purpose_code'] !== 'string' || !row['purpose_code'].trim()) return null;
  if (
    typeof row['valid_until'] === 'string' &&
    (!Number.isFinite(Date.parse(row['valid_until'])) ||
      Date.parse(row['valid_until']) <= Date.now())
  )
    return null;
  if (
    typeof row['valid_from'] !== 'string' ||
    !Number.isFinite(Date.parse(row['valid_from'])) ||
    Date.parse(row['valid_from']) > Date.now()
  )
    return null;
  selected = {
    relationshipId: String(row['id']),
    managedPatientId: String(row['managed_patient_id']),
    actorPersonId: String(row['actor_person_id']),
    purpose: row['purpose_code'],
    role: row['relationship_type'] === 'guardianship' ? 'GUA' : 'DEL',
  };
  return { ...selected };
}
export function clearManagedCareContext(): void {
  selected = null;
}
export function currentManagedCareContext(): Selection | null {
  return selected ? { ...selected } : null;
}
export async function revalidateManagedCareContext(
  locale: 'ar-EG' | 'en-EG',
  baseUrl: string,
): Promise<Selection> {
  const prior = selected,
    token = patientAccessTokens.read();
  if (!prior || !token) {
    selected = null;
    throw new ManagedCareContextError('managed-context-unavailable');
  }
  try {
    const profile = await patientOnboardingApi.getProfile();
    if (profile.id !== prior.actorPersonId)
      throw new ManagedCareContextError('managed-context-actor-mismatch');
    const client = new FamilyCareClient({
      baseUrl,
      accessToken: token,
      acceptLanguage: locale,
      defaultHeaders: { 'X-Purpose': prior.purpose },
    });
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = (await client.listRelationships(prior.managedPatientId, {
        ...(cursor ? { cursor } : {}),
      })) as { items: Record<string, unknown>[]; next_cursor?: string | null };
      const row = page.items.find(
        (item) =>
          item['id'] === prior.relationshipId &&
          item['actor_person_id'] === prior.actorPersonId &&
          item['managed_patient_id'] === prior.managedPatientId,
      );
      if (row) {
        const current = retainManagedRelationship(row);
        if (!current || current.role !== prior.role || current.purpose !== prior.purpose)
          throw new ManagedCareContextError('managed-context-revoked');
        return current;
      }
      cursor = page.next_cursor ?? undefined;
      if (cursor && seen.has(cursor)) throw Error('managed-context-cursor');
      if (cursor) seen.add(cursor);
    } while (cursor);
    throw new ManagedCareContextError('managed-context-revoked');
  } catch (error) {
    selected = null;
    throw error;
  }
}
