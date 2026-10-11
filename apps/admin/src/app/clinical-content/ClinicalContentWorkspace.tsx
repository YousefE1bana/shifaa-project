'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import type {
  Feature011ClinicalContentList,
  Feature011CreateReleaseRequest,
} from '@shifaa/contracts';
import {
  color,
  spacing,
  radius,
  type as typography,
  minimumTargetSize,
} from '@shifaa/design-system/tokens';
import { contentCopy, allergyDate } from '@shifaa/i18n';
import {
  ContentController,
  type Phase,
  type ReviewRow,
  type DraftIntent,
} from './content-controller';
type Locale = 'ar-EG' | 'en-EG';
const technical = (value: unknown) => (
  <bdi dir="ltr" className="f011-technical">
    {String(value)}
  </bdi>
);
function Details({
  items,
}: {
  items: { label: string; value: string | number; identifier?: boolean }[];
}) {
  return (
    <dl>
      {items.map(({ label, value, identifier }) => (
        <React.Fragment key={label}>
          <dt>{label}</dt>
          <dd dir="auto">{identifier ? technical(value) : value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
function Release({ row, locale }: { row: ReviewRow; locale: Locale }) {
  const c = contentCopy[locale];
  return (
    <article aria-label={`${c.reference} ${row.releaseId}`}>
      <h2>
        {c.reference} {technical(row.releaseId)}
      </h2>
      <Details
        items={[
          { label: c.source, value: row.source.display },
          { label: c.version, value: row.artifactVersion, identifier: true },
          { label: c.workflow, value: row.workflowVersion, identifier: true },
          { label: c.digest, value: row.artifactDigest, identifier: true },
          { label: c.status, value: c[row.publicationState] },
          { label: c.effectiveAt, value: allergyDate(row.effectiveAt, locale) },
          {
            label: row.initial ? c.initial : c.predecessor,
            value: row.initial ? c.initial : (row.supersedesReleaseId ?? c.unknown),
            identifier: !row.initial,
          },
        ]}
      />
      <p>
        {'eligibility' in row
          ? c[row.eligibility === 'unavailable' ? 'eligibilityUnavailable' : row.eligibility]
          : c.unknown}
      </p>
      {row.publicationState === 'published' && Date.parse(row.effectiveAt) > Date.now() ? (
        <p>{c.future}</p>
      ) : null}
      <p>{c.reviewFirst}</p>
      {(['content', 'code', 'testVectors'] as const).map((k) => (
        <section key={k}>
          <h3>{c[k]}</h3>
          <pre dir="auto">{row.artifactReview[k]}</pre>
        </section>
      ))}
      {'signatures' in row ? (
        <section>
          <h3>{c.signatureHistory}</h3>
          {row.signatures.map((s) => (
            <p key={s.signatureId}>
              {c[s.capacity]} · {c[s.decision]} · {technical(s.artifactVersion)} ·{' '}
              {allergyDate(s.signedAt, locale)}
            </p>
          ))}
        </section>
      ) : (
        <p>
          {c.signatureHistory}: {c.physician}{' '}
          {row.signatureStatus.physicianApproved ? c.approved : c.unknown} · {c.pharmacist}{' '}
          {row.signatureStatus.pharmacistApproved ? c.approved : c.unknown}
        </p>
      )}
    </article>
  );
}
const messages: Partial<Record<Phase, keyof (typeof contentCopy)['ar-EG']>> = {
  loading: 'loading',
  empty: 'empty',
  permission: 'permission',
  stepup: 'stepup',
  error: 'error',
  unavailable: 'unavailable',
  offline: 'offline',
  stale: 'stale',
  reconciling: 'reconciling',
  success: 'success',
  submitting: 'submission',
};
export function ClinicalContentView({
  locale,
  phase,
  page,
  children,
}: {
  locale: Locale;
  phase: Phase;
  page: Feature011ClinicalContentList | null;
  children?: React.ReactNode;
}) {
  const c = contentCopy[locale];
  return (
    <main
      className="f011-content"
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
      style={
        {
          '--f011-canvas': color.canvas,
          '--f011-surface': color.surface,
          '--f011-ink': color.ink,
          '--f011-muted': color.mutedInk,
          '--f011-border': color.border,
          '--f011-brand': color.brand,
          '--f011-focus': color.focus,
          '--f011-danger': color.danger,
          '--f011-space': `${spacing.md}px`,
          '--f011-card-radius': `${radius.card}px`,
          '--f011-control-radius': `${radius.control}px`,
          '--f011-dialog-radius': `${radius.dialog}px`,
          '--f011-target': `${minimumTargetSize}px`,
          '--f011-display': `${typography.display.fontSize / 16}rem`,
          '--f011-title': `${typography.title.fontSize / 16}rem`,
        } as React.CSSProperties
      }
    >
      <h1>{c.title}</h1>
      <p>{c.synthetic}</p>
      <p>{c.gated}</p>
      <p>{c.facility}</p>
      <p>{c.authority}</p>
      <p>{c.independence}</p>
      <p
        role={['permission', 'error', 'unavailable', 'stale'].includes(phase) ? 'alert' : 'status'}
        aria-live="polite"
        aria-atomic="true"
      >
        {messages[phase] ? c[messages[phase]!] : c.reviewFirst}
      </p>
      {page?.meta.stale ? (
        <p>
          {c.stale} {allergyDate(page.meta.lastUpdatedAt, locale)}
        </p>
      ) : null}
      {page && page.projection !== 'status'
        ? page.data.map((row) => <Release key={row.releaseId} row={row} locale={locale} />)
        : null}
      {children}
    </main>
  );
}
export function ClinicalContentWorkspace({
  accessToken,
  aal,
  onStepUp,
}: {
  accessToken: () => string;
  aal: number;
  onStepUp: () => void;
}) {
  const [locale, setLocale] = useState<Locale>('ar-EG'),
    [purpose, setPurpose] = useState(''),
    [type, setType] = useState(''),
    [projection, setProjection] = useState<'governance' | 'assigned_review'>('governance'),
    [releaseId, setReleaseId] = useState(''),
    [capacity, setCapacity] = useState<'physician' | 'pharmacist'>('physician'),
    [evidence, setEvidence] = useState(''),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState(''),
    [, setRevision] = useState(0),
    [formError, setFormError] = useState(false);
  const online = useRef(true),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    restoreFocus = useRef(false),
    summary = useRef<HTMLDivElement>(null),
    mounted = useRef(true);
  const c = contentCopy[locale];
  const controller = useMemo(
    () =>
      new ContentController(
        new Feature011Client({
          baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
          accessToken,
          purpose,
          acceptLanguage: locale,
        }),
        { online: () => online.current, aal: () => aal, purpose: () => purpose },
      ),
    [accessToken, aal, purpose, locale],
  );
  const update = () => setRevision((n) => n + 1);
  useEffect(() => {
    mounted.current = true;
    online.current = navigator.onLine;
    const off = () => {
      online.current = false;
      controller.connectionChanged(false);
      update();
    };
    const on = () => {
      online.current = true;
      controller.connectionChanged(true);
      update();
    };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      mounted.current = false;
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, [controller]);
  useEffect(() => {
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);
  const pending = !!controller.pending,
    busy =
      controller.isSending || controller.phase === 'submitting' || controller.phase === 'loading';
  const run = async (work: () => Promise<void>) => {
    setFormError(false);
    try {
      const task = work();
      update();
      await task;
    } catch {
      setFormError(true);
    }
    if (mounted.current) {
      update();
      summary.current?.focus();
    }
  };
  const load = (cursor?: string) =>
    run(() => controller.load(type, projection, releaseId || undefined, cursor));
  const show = (work: () => void, event: React.MouseEvent<HTMLButtonElement>) => {
    setFormError(false);
    try {
      work();
      trigger.current = event.currentTarget;
      update();
      dialog.current?.showModal();
    } catch {
      setFormError(true);
      summary.current?.focus();
    }
  };
  const returnFocus = () => {
    if (trigger.current?.isConnected) trigger.current.focus();
    else summary.current?.focus();
  };
  useEffect(() => {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      returnFocus();
    }
  });
  const close = () => {
    controller.cancel();
    dialog.current?.close();
    restoreFocus.current = true;
    update();
  };
  const confirm = async () => {
    await run(() => controller.submit());
    dialog.current?.close();
    restoreFocus.current = true;
    update();
  };
  const rows =
    controller.page && controller.page.projection !== 'status' ? controller.page.data : [];
  const row = rows.find((r) => r.releaseId === selected) ?? rows[0];
  const canAct = !pending && !busy && ['ready', 'empty', 'success'].includes(controller.phase);
  const readField = (name: string, form: HTMLFormElement) =>
    String(new FormData(form).get(name) ?? '');
  const [intent, setIntent] = useState<DraftIntent>('initial');
  const form = useRef<HTMLFormElement>(null);
  const create = () => {
    const f = form.current!;
    const body: Feature011CreateReleaseRequest = {
      governedContentKey: readField('key', f),
      effectiveScopeKey: readField('scope', f),
      source: { display: readField('source', f) },
      effectiveAt: readField('effectiveAt', f),
      artifact: {
        contentEvidenceRef: readField('contentRef', f),
        codeEvidenceRef: readField('codeRef', f),
        testVectorEvidenceRef: readField('testRef', f),
        ...(readField('declaredDigest', f)
          ? { declaredDigest: readField('declaredDigest', f) }
          : {}),
      },
      predecessor:
        intent === 'initial'
          ? { initial: true, supersedesReleaseId: null }
          : { initial: false, supersedesReleaseId: readField('predecessor', f) },
    };
    if (!f.reportValidity()) throw Error('Invalid fields');
    controller.prepareCreate(type, body, intent);
  };
  const confirmation = controller.pending
    ? c[
        (
          {
            initial: 'confirmCreate',
            successor: 'confirmSuccessor',
            rollback: 'confirmRollback',
            approved: 'confirmApprove',
            rejected: 'confirmReject',
            publish: 'confirmPublish',
          } as const
        )[controller.pending.intent]
      ]
    : '';
  return (
    <ClinicalContentView locale={locale} phase={controller.phase} page={controller.page}>
      <p>AAL {technical(aal)}</p>
      <div ref={summary} tabIndex={-1}>
        {formError ? <p role="alert">{c.error}</p> : null}
      </div>
      <fieldset disabled={pending || busy}>
        <legend>{c.projection}</legend>
        <label>
          {c.locale}
          <select
            aria-label={c.locale}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="ar-EG">العربية</option>
            <option value="en-EG">English</option>
          </select>
        </label>
        <label>
          {c.purpose}
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
        </label>
        <label>
          {c.contentType}
          <input dir="ltr" value={type} onChange={(e) => setType(e.target.value)} required />
        </label>
        <label>
          {c.projection}
          <select
            aria-label={c.projection}
            value={projection}
            onChange={(e) => setProjection(e.target.value as typeof projection)}
          >
            <option value="governance">{c.governance}</option>
            <option value="assigned_review">{c.assigned_review}</option>
          </select>
        </label>
        {projection === 'assigned_review' ? (
          <label>
            {c.releaseId}
            <input
              dir="ltr"
              value={releaseId}
              onChange={(e) => setReleaseId(e.target.value)}
              required
            />
          </label>
        ) : null}
        <button onClick={() => void load()}>{c.load}</button>
      </fieldset>
      {controller.phase === 'stepup' ? <button onClick={onStepUp}>{c.stepup}</button> : null}
      {controller.needsSettlement &&
      (controller.phase === 'reconciling' || controller.phase === 'offline') ? (
        <button
          disabled={!online.current || busy}
          onClick={() => void run(() => controller.reconcile())}
        >
          {c.retry}
        </button>
      ) : null}
      {!pending ? (
        <button disabled={busy || !online.current} onClick={() => void load()}>
          {c.refresh}
        </button>
      ) : null}
      {controller.page?.meta.nextCursor ? (
        <button
          disabled={pending || busy}
          onClick={() => void load(controller.page!.meta.nextCursor!)}
        >
          {c.more}
        </button>
      ) : null}
      {projection === 'governance' && controller.page?.projection === 'governance' ? (
        <form ref={form} onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={!canAct}>
            <legend>{c.create}</legend>
            <select
              aria-label={c.initial}
              value={intent}
              onChange={(e) => setIntent(e.target.value as DraftIntent)}
            >
              <option value="initial">{c.initial}</option>
              <option value="successor">{c.successor}</option>
              <option value="rollback">{c.rollback}</option>
            </select>
            {(
              [
                'key',
                'scope',
                'source',
                'effectiveAt',
                'contentRef',
                'codeRef',
                'testRef',
                'declaredDigest',
                ...(intent === 'initial' ? [] : ['predecessor']),
              ] as (keyof typeof c)[]
            ).map((k) => (
              <label key={k}>
                {c[k]}
                <input
                  name={k}
                  required={k !== 'declaredDigest'}
                  dir={['source'].includes(k) ? 'auto' : 'ltr'}
                  pattern={
                    ['contentRef', 'codeRef', 'testRef', 'predecessor'].includes(k)
                      ? '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
                      : k === 'declaredDigest'
                        ? '[a-f0-9]{64}'
                        : undefined
                  }
                />
              </label>
            ))}
            <button onClick={(e) => show(create, e)}>
              {c[intent === 'initial' ? 'create' : intent]}
            </button>
          </fieldset>
        </form>
      ) : null}
      {rows.length ? (
        <label>
          {c.reference}
          <select
            aria-label={c.reference}
            disabled={pending || busy}
            value={row?.releaseId ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map((r) => (
              <option key={r.releaseId} value={r.releaseId}>
                {r.releaseId}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {projection === 'assigned_review' &&
      controller.page?.projection === 'assigned_review' &&
      row ? (
        <fieldset disabled={!canAct || row.publicationState !== 'draft'}>
          <legend>{c.capacity}</legend>
          <label>
            {c.capacity}
            <select
              aria-label={c.capacity}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value as typeof capacity)}
            >
              <option value="physician">{c.physician}</option>
              <option value="pharmacist">{c.pharmacist}</option>
            </select>
          </label>
          <label>
            {c.evidence}
            <input dir="ltr" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </label>
          <label>
            {c.reason}
            <textarea
              aria-label={c.reason}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {(['approved', 'rejected'] as const).map((decision) => (
            <button
              key={decision}
              onClick={(e) =>
                show(
                  () =>
                    controller.prepareSign(row, {
                      capacity,
                      decision,
                      signingEvidenceRef: evidence,
                      ...(reason ? { reason } : {}),
                    }),
                  e,
                )
              }
            >
              {c[decision === 'approved' ? 'approve' : 'reject']}
            </button>
          ))}
        </fieldset>
      ) : null}
      {projection === 'governance' && row?.publicationState === 'draft' ? (
        <button disabled={!canAct} onClick={(e) => show(() => controller.preparePublish(row), e)}>
          {c.publish}
        </button>
      ) : null}
      {controller.receipt ? (
        <section aria-label={c.success}>
          <h2>{c.success}</h2>
          <p>
            {c.reference} {technical(controller.receipt.releaseId)}
          </p>
          <p>
            {c.workflow} {technical(controller.receipt.workflowVersion)}
          </p>
          <p>
            {c.time}{' '}
            {'signature' in controller.receipt
              ? allergyDate(controller.receipt.signature.signedAt, locale)
              : allergyDate(controller.receipt.publishedAt ?? controller.receipt.createdAt, locale)}
          </p>
          <p>{c.next}</p>
        </section>
      ) : null}
      <dialog
        ref={dialog}
        aria-labelledby="f011-confirm-title"
        aria-describedby="f011-confirm-body"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) close();
        }}
      >
        <h2 id="f011-confirm-title">{confirmation}</h2>
        <div id="f011-confirm-body">
          <p>{controller.pending?.operation === 'create' ? c.draft : c.reviewFirst}</p>
          <p>{c.independence}</p>
          <p>{c.authority}</p>
          {controller.pending && controller.pending.operation !== 'create' ? (
            <>
              <p>
                {c.reference} {technical(controller.pending.id)} · {c.version}{' '}
                {technical(controller.pending.body.artifactVersion)} · {c.digest}{' '}
                {technical(controller.pending.body.artifactDigest)} · {c.workflow}{' '}
                {technical(controller.pending.version)}
              </p>
              {row ? <Release row={row} locale={locale} /> : null}
              {controller.pending.operation === 'sign' ? (
                <p>
                  {c.capacity} {c[controller.pending.body.capacity]} ·{' '}
                  {c[controller.pending.body.decision]}
                </p>
              ) : null}
            </>
          ) : controller.pending?.operation === 'create' ? (
            <Details
              items={[
                { label: c.contentType, value: controller.pending.type, identifier: true },
                {
                  label: c.key,
                  value: controller.pending.body.governedContentKey,
                  identifier: true,
                },
                {
                  label: c.scope,
                  value: controller.pending.body.effectiveScopeKey,
                  identifier: true,
                },
                { label: c.source, value: controller.pending.body.source.display },
                {
                  label: c.effectiveAt,
                  value: allergyDate(controller.pending.body.effectiveAt, locale),
                },
                {
                  label: c.contentRef,
                  value: controller.pending.body.artifact.contentEvidenceRef,
                  identifier: true,
                },
                {
                  label: c.codeRef,
                  value: controller.pending.body.artifact.codeEvidenceRef,
                  identifier: true,
                },
                {
                  label: c.testRef,
                  value: controller.pending.body.artifact.testVectorEvidenceRef,
                  identifier: true,
                },
                {
                  label: c.declaredDigest,
                  value: controller.pending.body.artifact.declaredDigest ?? c.unknown,
                  identifier: !!controller.pending.body.artifact.declaredDigest,
                },
                {
                  label: c.predecessor,
                  value: controller.pending.body.predecessor.supersedesReleaseId ?? c.initial,
                  identifier: !controller.pending.body.predecessor.initial,
                },
              ]}
            />
          ) : (
            <p>{c.synthetic}</p>
          )}
        </div>
        <button disabled={busy} autoFocus onClick={() => void confirm()}>
          {confirmation}
        </button>
        <button disabled={busy} onClick={close}>
          {c.cancel}
        </button>
      </dialog>
    </ClinicalContentView>
  );
}
