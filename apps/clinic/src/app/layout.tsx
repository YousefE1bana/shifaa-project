import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
export const metadata: Metadata = {
  title: 'SHIFAA Clinic',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
