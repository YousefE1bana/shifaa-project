import type { Metadata } from 'next';
import React from 'react';
import { AppSecurityStepUpBoundary as SecurityStepUpShell } from './SecurityStepUpShell';
import './globals.css';
export const metadata: Metadata = {
  title: 'SHIFAA Hospital',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SecurityStepUpShell>{children}</SecurityStepUpShell>
      </body>
    </html>
  );
}
