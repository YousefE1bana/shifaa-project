'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Feature011Client } from '@shifaa/api-client/feature-011';
type Feature011AllergyRevision = Awaited<ReturnType<Feature011Client['verifyAllergy']>>;
type Feature011VerifyAllergyRequest = Parameters<Feature011Client['verifyAllergy']>[1];
import {
  AllergyReportController,
  allergyHistoryMetadata,
} from '@shifaa/api-client/feature-011-allergy-state';
import { allergyCopy, allergyDate, verificationCopy } from '@shifaa/i18n';

type Props = {
  model: AllergyReportController;
  locale: 'ar-EG' | 'en-EG';
  style: React.CSSProperties;
  redraw: () => void;
  submit: () => Promise<void>;
  correct: (id: string) => void;
};
export function AllergyHistory({ model, locale, style, redraw, submit, correct }: Props) {
  const copy = verificationCopy[locale],
    report = allergyCopy[locale];
  const [selected, setSelected] = useState<{
    row: Feature011AllergyRevision;
    target: Feature011VerifyAllergyRequest['targetStatus'];
  } | null>(null);
  const [reason, setReason] = useState(''),
    [evidence, setEvidence] = useState('');
  const origin = useRef<HTMLButtonElement | null>(null),
    reasonField = useRef<HTMLTextAreaElement>(null);
  const originBasis = useRef<{
    allergyId: string;
    target: Feature011VerifyAllergyRequest['targetStatus'];
  } | null>(null);
  const pending =
    model.mutationKind === 'verify' &&
    ['review', 'submitting', 'reconciling'].includes(model.phase);
  useLayoutEffect(() => {
    if (selected && !pending) reasonField.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (['denied', 'stale', 'error', 'offline', 'success'].includes(model.phase)) {
      setSelected(null);
      setReason('');
      setEvidence('');
    }
  }, [model, model.phase]);
  const cancel = () => {
    model.cancel();
    setSelected(null);
    setReason('');
    setEvidence('');
    redraw();
    requestAnimationFrame(() => origin.current?.focus());
  };
  const valid =
    !!reason.trim() &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidence);
  return (
    <div data-testid="f011-verification">
      {model.rows.map((row) => {
        const detail = allergyHistoryMetadata(row);
        return (
          <article
            key={row.revisionId}
            data-testid="f011-history-entry"
            aria-label={`${report[row.status]} · ${report.version} ${row.version}`}
          >
            <h3>
              {row.substance.display} — {report[row.status]} · {report.version} {row.version}
            </h3>
            <p>
              {copy.originalRecorder}: <bdi dir="ltr">{detail.originalRecorder}</bdi> ·{' '}
              {allergyDate(detail.recordedAt, locale)}
            </p>
            <p>
              {copy.actor}: <bdi dir="ltr">{detail.actor}</bdi>
            </p>
            <p>
              {copy.actionTime}: {allergyDate(detail.actionAt, locale)}
            </p>
            {detail.previousRevisionId && (
              <p>
                {copy.predecessor}: <bdi dir="ltr">{detail.previousRevisionId}</bdi>
              </p>
            )}
            {detail.reason && (
              <p>
                {copy.reason}: {detail.reason}
              </p>
            )}
            {detail.evidenceRef && (
              <p>
                {copy.evidence}: <bdi dir="ltr">{detail.evidenceRef}</bdi>
              </p>
            )}
            {detail.verifierPersonId && (
              <p>
                {copy.verifier}: <bdi dir="ltr">{detail.verifierPersonId}</bdi>
              </p>
            )}
            {detail.correctsAllergyId && (
              <p>
                {copy.correction}: <bdi dir="ltr">{detail.correctsAllergyId}</bdi>
              </p>
            )}
            {detail.terminal && <p>{copy.terminal}</p>}
            {model.canVerify(row) &&
              (['clinician_confirmed', 'refuted', 'entered_in_error'] as const)
                .filter((target) => target !== row.status)
                .map((target) => (
                  <button
                    key={target}
                    style={style}
                    ref={(node) => {
                      if (
                        originBasis.current?.allergyId === row.allergyId &&
                        originBasis.current.target === target
                      )
                        origin.current = node;
                    }}
                    onClick={(event) => {
                      originBasis.current = { allergyId: row.allergyId, target };
                      origin.current = event.currentTarget;
                      setSelected({ row, target });
                      setReason('');
                      setEvidence('');
                    }}
                  >
                    {copy[target]}
                  </button>
                ))}
            {detail.terminal && model.canReport && (
              <button
                style={style}
                onClick={() => {
                  setSelected(null);
                  correct(row.allergyId);
                }}
              >
                {copy.corrected}
              </button>
            )}
          </article>
        );
      })}
      {selected && !pending && model.canVerify(selected.row) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            model.reviewVerification(selected.row, {
              targetStatus: selected.target,
              reason,
              verificationEvidenceRef: evidence,
            });
            redraw();
          }}
        >
          <h3>{copy[selected.target]}</h3>
          <label htmlFor="allergy-verify-reason">{copy.reason}</label>
          <textarea
            ref={reasonField}
            id="allergy-verify-reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...style, display: 'block', width: '100%' }}
          />
          <label htmlFor="allergy-verify-evidence">{copy.evidence}</label>
          <input
            id="allergy-verify-evidence"
            required
            dir="ltr"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            aria-describedby="allergy-evidence-help"
            style={{ ...style, display: 'block', width: '100%' }}
          />
          <p id="allergy-evidence-help">{copy.evidenceHelp}</p>
          <button type="button" style={style} onClick={cancel}>
            {copy.cancel}
          </button>
          <button style={style} disabled={!valid}>
            {copy.review}
          </button>
        </form>
      )}
      {pending && (
        <div>
          <p>{selected ? copy[selected.target] : copy.review}</p>
          <p>
            {copy.reason}: {reason}
          </p>
          <p>
            {copy.evidence}: <bdi dir="ltr">{evidence}</bdi>
          </p>
          {model.phase === 'review' && (
            <>
              <button style={style} onClick={cancel}>
                {copy.cancel}
              </button>
              <button style={style} onClick={() => void submit()}>
                {selected ? copy[selected.target] : copy.review}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
