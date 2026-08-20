import { PrivacyDsrNotificationClient } from '@shifaa/api-client/privacy-dsr-notifications';
import type { CreateDsrInput } from '@shifaa/contracts/privacy-dsr-notifications';

export const syntheticPrivacyIds = {
  patientPerson: '50000000-0000-4000-8000-000000000001',
  guardianPerson: '50000000-0000-4000-8000-000000000002',
  patient: '51000000-0000-4000-8000-000000000001',
} as const;

export function createPatientPrivacyClient(
  locale: 'ar-EG' | 'en-EG',
  personId = syntheticPrivacyIds.patientPerson,
) {
  return new PrivacyDsrNotificationClient({
    baseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
    accessToken: `synthetic-person:${personId}`,
    acceptLanguage: locale,
    defaultHeaders: { 'X-AAL': '2' },
  });
}

export function privacyMutationKey(action: string) {
  return `synthetic-ui-005-${action}-${Date.now()}`;
}

export function assertPrivacyOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

export async function createPrivacyRequest(
  locale: 'ar-EG' | 'en-EG',
  requestType: CreateDsrInput['request_type'],
) {
  assertPrivacyOnline();
  return createPatientPrivacyClient(locale).createDsr(
    {
      managed_patient_id: syntheticPrivacyIds.patient,
      request_type: requestType,
      scope: {
        data_category_codes:
          requestType === 'correction' ? ['profile.demographics'] : ['profile', 'consents'],
        ...(requestType === 'correction' ? { correction_codes: ['profile.name'] } : {}),
      },
      contact_preference: 'in_app',
    },
    privacyMutationKey(`create-${requestType}`),
  );
}
