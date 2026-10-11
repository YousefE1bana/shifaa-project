'use client';
import React from 'react';
import { AdminAuditSession } from '../AdminAuditSession';
import { ClinicalContentWorkspace } from './ClinicalContentWorkspace';
import './clinical-content.css';
export default function ClinicalContentPage() {
  return (
    <>
      <link rel="stylesheet" href="/fonts/feature-011-fonts.css" />
      <AdminAuditSession>
        {({ accessTokenProvider, aal, onStepUp }) => (
          <ClinicalContentWorkspace
            accessToken={accessTokenProvider}
            aal={aal}
            onStepUp={onStepUp}
          />
        )}
      </AdminAuditSession>
    </>
  );
}
