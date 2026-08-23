'use client';

import { color } from '@shifaa/design-system/tokens';
import { translate, type Locale } from '@shifaa/i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  createHospitalDiscoverySosClient,
  retainedHospitalMutationKey,
  syntheticHospitalContext,
} from '../../discovery-sos-client';
import { HospitalSosShell, hospitalCard } from '../../components/HospitalSosShell';

type Prearrival = {
  incident_id: string;
  status: 'matched' | 'accepted';
  qualifying_reason_code: string;
  distance_m: number;
  initiated_at: string;
  capacity_freshness: 'fresh' | 'stale' | 'unknown';
  version: number;
};

function PrearrivalPanel({ locale = 'ar-EG' }: { locale?: Locale }) {
  const client = useMemo(() => createHospitalDiscoverySosClient(locale), [locale]);
  const [items, setItems] = useState<Prearrival[]>([]);
  const [selected, setSelected] = useState<Prearrival | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'offline' | 'permission' | 'conflict' | 'error'
  >('loading');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const acceptIntent = useRef<{ signature: string; key: string } | null>(null);
  const load = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      return;
    }
    setState('loading');
    try {
      const payload = (await client.listSosPrearrivals(syntheticHospitalContext.facilityId, {
        limit: 25,
      })) as { data?: Prearrival[] };
      setItems(payload.data ?? []);
      setState('ready');
    } catch (error: unknown) {
      setState(
        error &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status: number }).status === 403
          ? 'permission'
          : 'error',
      );
    }
  };
  useEffect(() => {
    void load();
  }, [client]);
  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      globalThis.setTimeout(() => returnFocusRef.current?.focus(), 0);
    };
  }, [selected]);
  const dismiss = () => setSelected(null);
  const accept = async () => {
    if (!selected) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      setSelected(null);
      return;
    }
    try {
      await client.acceptSosPrearrival(
        syntheticHospitalContext.facilityId,
        selected.incident_id,
        { acknowledgement: true, capacity_note_code: 'capacity_acknowledged' },
        selected.version,
        retainedHospitalMutationKey(acceptIntent, 'accept', {
          facilityId: syntheticHospitalContext.facilityId,
          incidentId: selected.incident_id,
          version: selected.version,
          acknowledgement: true,
          capacityNoteCode: 'capacity_acknowledged',
        }),
      );
      setSelected(null);
      await load();
    } catch (error: unknown) {
      setSelected(null);
      setState(
        error &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status: number }).status === 409
          ? 'conflict'
          : 'error',
      );
    }
  };
  return (
    <section aria-labelledby="prearrival-title" style={hospitalCard}>
      <h2 id="prearrival-title">{translate(locale, 'prearrival.title')}</h2>
      <p>
        {translate(locale, 'hospital.purpose')} {translate(locale, 'hospital.aal2')}
      </p>
      <div role="status" aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'loading' ? translate(locale, 'state.loading') : null}
        {state === 'offline' ? translate(locale, 'prearrival.offline') : null}
        {state === 'permission' ? translate(locale, 'state.permission') : null}
        {state === 'conflict' ? translate(locale, 'prearrival.conflict') : null}
        {state === 'error' ? translate(locale, 'state.unavailable') : null}
      </div>
      {state === 'ready' && items.length === 0 ? (
        <p>{translate(locale, 'prearrival.empty')}</p>
      ) : null}
      <div role="list" className="sos-worklist">
        {items.map((item) => (
          <article
            role="listitem"
            key={item.incident_id}
            className="sos-worklist-row"
            style={{ borderBlockEnd: `1px solid ${color.border}`, paddingBlock: 16 }}
          >
            <div>
              <bdi dir="ltr">{item.incident_id}</bdi>
              <p>
                <bdi dir="ltr">{item.initiated_at}</bdi>
              </p>
            </div>
            <div>
              <strong>
                {translate(locale, item.status === 'accepted' ? 'sos.accepted' : 'sos.matched')}
              </strong>
              <p>
                {translate(
                  locale,
                  item.qualifying_reason_code === 'accident_or_injury'
                    ? 'sos.reason.accident'
                    : item.qualifying_reason_code === 'medical_emergency'
                      ? 'sos.reason.medical'
                      : 'sos.reason.other',
                )}
              </p>
              <p>
                {translate(locale, 'prearrival.distance')}{' '}
                <bdi dir="ltr">{Math.round(item.distance_m)} m</bdi>
              </p>
              <p>{translate(locale, `capacity.${item.capacity_freshness}`)}</p>
            </div>
            <button
              type="button"
              disabled={item.status !== 'matched'}
              aria-disabled={item.status !== 'matched'}
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget;
                setSelected(item);
              }}
            >
              {translate(locale, 'prearrival.accept')}
            </button>
          </article>
        ))}
      </div>
      {selected ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="accept-title"
          aria-describedby="accept-help"
          className="sos-dialog"
          onCancel={(event) => {
            event.preventDefault();
            dismiss();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              dismiss();
            }
          }}
        >
          <h3 id="accept-title">{translate(locale, 'prearrival.confirmTitle')}</h3>
          <p id="accept-help">{translate(locale, 'prearrival.confirmHelp')}</p>
          <p>{translate(locale, 'prearrival.capacityAcknowledged')}</p>
          <div className="sos-actions">
            <button ref={cancelRef} type="button" onClick={dismiss}>
              {locale === 'ar-EG' ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="button" onClick={accept}>
              {translate(locale, 'prearrival.accept')}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

export default function SosPrearrivalsPage() {
  return (
    <HospitalSosShell>
      <PrearrivalPanel />
    </HospitalSosShell>
  );
}
