import type { Feature010Client } from '@shifaa/api-client/feature-010';
type EncounterProjection = Awaited<ReturnType<Feature010Client['getEncounter']>>;
/** A current server projection is the only source of the managed identifier. */
export function allergyEncounterContext(
  projection: EncounterProjection,
  routePersonId: string,
  encounterId: string,
  facilityId?: string,
) {
  if (
    !projection.managedPatientId ||
    projection.patientPersonId !== routePersonId ||
    projection.patientId !== routePersonId ||
    projection.id !== encounterId ||
    (facilityId && projection.facilityId !== facilityId) ||
    projection.status !== 'open'
  )
    throw Error('allergy-current-context-mismatch');
  return {
    managedPatientId: projection.managedPatientId,
    patientPersonId: projection.patientPersonId,
    encounterId: projection.id,
    facilityId: projection.facilityId,
  };
}
