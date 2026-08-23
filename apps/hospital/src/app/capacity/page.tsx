'use client';

import { color } from '@shifaa/design-system/tokens';
import { translate, type Locale, type MessageKey } from '@shifaa/i18n';
import React, { useEffect, useMemo, useState } from 'react';

import {
  createHospitalDiscoverySosClient,
  syntheticHospitalContext,
} from '../../discovery-sos-client';
import { HospitalSosShell, hospitalCard } from '../../components/HospitalSosShell';

type Capacity = {
  signal: 'available' | 'limited' | 'unavailable' | 'unknown';
  count_band: 'none' | 'one_to_four' | 'five_to_nine' | 'ten_or_more' | 'unknown';
  freshness: 'fresh' | 'stale' | 'unknown';
  observed_at: string | null;
};

function CapacityPanel({ locale = 'ar-EG' }: { locale?: Locale }) {
  const client = useMemo(() => createHospitalDiscoverySosClient(locale), [locale]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const load = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      return;
    }
    setState('loading');
    try {
      const payload = (await client.getFacilityCapacity(syntheticHospitalContext.facilityId)) as {
        capacity?: Capacity;
      };
      if (!payload.capacity) throw new Error('invalid-response');
      setCapacity(payload.capacity);
      setState('ready');
    } catch {
      setState('error');
    }
  };
  useEffect(() => {
    void load();
  }, [client]);
  const freshness = capacity?.freshness ?? 'unknown';
  const tone =
    freshness === 'fresh' ? color.positive : freshness === 'stale' ? color.warning : color.mutedInk;
  return (
    <section aria-labelledby="capacity-title" style={hospitalCard}>
      <h2 id="capacity-title">{translate(locale, 'capacity.title')}</h2>
      <p>{translate(locale, 'capacity.readOnly')}</p>
      <div
        role="status"
        aria-live="polite"
        aria-busy={state === 'loading'}
        style={{ borderInlineStart: `5px solid ${tone}`, paddingInlineStart: 16, marginBlock: 20 }}
      >
        {state === 'loading' ? translate(locale, 'state.loading') : null}
        {state === 'offline' ? translate(locale, 'state.offline') : null}
        {state === 'error' ? translate(locale, 'state.unavailable') : null}
        {state === 'ready' && capacity ? (
          <>
            <strong>{translate(locale, `capacity.${freshness}`)}</strong>
            <p>{translate(locale, `capacity.signal.${capacity.signal}` as MessageKey)}</p>
            <p>
              {translate(locale, 'capacity.countBandLabel')}:{' '}
              {translate(locale, `capacity.countBand.${capacity.count_band}`)}
            </p>
            {capacity.observed_at ? (
              <p>
                <span>{translate(locale, 'capacity.lastUpdated')}</span>{' '}
                <bdi dir="ltr">{capacity.observed_at}</bdi>
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {state === 'error' || state === 'offline' ? (
        <button type="button" onClick={load}>
          {translate(locale, 'state.retry')}
        </button>
      ) : null}
    </section>
  );
}

export default function CapacityPage() {
  return (
    <HospitalSosShell>
      <CapacityPanel />
    </HospitalSosShell>
  );
}
