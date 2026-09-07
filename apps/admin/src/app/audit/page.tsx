import { AuditWorkspace } from './AuditWorkspace';
import { AdminAuditSession } from '../AdminAuditSession';

export default function AuditPage() {
  return (
    <AdminAuditSession>
      {({ accessTokenProvider, aal, factorAgeSeconds, onStepUp }) => (
        <AuditWorkspace
          accessToken={accessTokenProvider}
          aal={aal}
          factorAgeSeconds={factorAgeSeconds}
          onStepUp={onStepUp}
        />
      )}
    </AdminAuditSession>
  );
}
