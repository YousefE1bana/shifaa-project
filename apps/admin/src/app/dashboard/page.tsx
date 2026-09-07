'use client';

import { AdminDashboard } from './AdminDashboard';
import { AdminAuditSession } from '../AdminAuditSession';

export default function DashboardPage() {
  return (
    <AdminAuditSession>
      {({ accessTokenProvider }) => <AdminDashboard accessToken={accessTokenProvider} />}
    </AdminAuditSession>
  );
}
