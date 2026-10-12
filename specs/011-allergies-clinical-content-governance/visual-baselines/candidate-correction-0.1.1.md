# Candidate 0.1.1 — bounded UX correction record

**TEST-ONLY · PENDING PRODUCT OWNER + DESIGN LEAD REVIEW**

Candidate: `SHIFAA-F011-OPEN-UX-001-CANDIDATE@0.1.1-test-only`  
Source: `SHIFAA-F011-P0-SOURCE@0.1.1-test-only`  
Manifest SHA-256: `59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432`

Supersedes the unapproved 0.1.0 candidate for review. No approval is inherited. This correction changes static reference copy and layout only; four routes, 99 route-state variants, 746 references, 19 NFRs, seven operations, authority semantics and all retained OPEN gates remain unchanged.

## Exact confirmation copy

| Existing review/form | Arabic action | English action |
| --- | --- | --- |
| Patient report | إرسال إبلاغ الحساسية | Submit allergy report |
| Clinician creation | إنشاء سجل حساسية | Create allergy record |
| Confirm / confirm a verified revision | تأكيد الحساسية سريريًا | Confirm allergy clinically |
| Refute | نفي الحساسية | Refute allergy |
| Entered in error | وَسْم السجل بأنه أُدخل بالخطأ | Mark record entered in error |
| New linked corrected assertion | إنشاء سجل حساسية مصحح مرتبط | Create linked corrected allergy assertion |
| Clinical-content draft creation | إنشاء مسودة محتوى سريري | Create clinical-content draft |
| Exact assigned signature | توقيع الإصدار المحدد + isolated `REL-TEST-002 · v2` | Sign exact release + isolated `REL-TEST-002 · v2` |
| Release publication | نشر الإصدار | Publish release |
| Superseding publication | نشر الإصدار البديل | Publish superseding release |
| New rollback publication | نشر إصدار التراجع الجديد | Publish new rollback release |

The signature target is the same immutable release/version already shown in its review details. No operation identifier, permission, target transition, artifact binding or signing authority changes. The generic “Confirm test action” / “تأكيد الإجراء الاختباري” label is removed, including from allergy forms. Static controls remain disconnected from services.

Entered-in-error confirmation uses a filled semantic danger button. New correction and rollback confirmations use a danger outline, visibly distinct from routine primary actions. Existing consequence/terminal-history explanations are retained; text communicates the action independently of color.

## Layout and date presentation

- Below 768 px, metadata labels and values stack into one column. Values use the full available row instead of squeezing into half-width cells.
- Exact IDs/codes break only at separators or existing whitespace. SHA-256 digests break between 16-character chunks. Exact ISO instants break between date, time and UTC offset. Each chunk stays intact; original technical text is preserved.
- Patient/clinic allergy record, history and receipt dates, and clinic content effective dates use localized Arabic/English Gregorian presentation with explicit Cairo timezone formatting. Original ISO values remain in semantic `time datetime` attributes.
- Exact governance dates, IDs, versions and digests remain visible where the review/evidence needs them, inside LTR bidi isolation. Localized date text uses its own locale direction and inherited interface typography.
- Below 600 px, dialog footer actions stack vertically. Header/footer cannot shrink into the scrollable review body; long review details scroll while cancellation and the consequential action remain visible.
- TEST-ONLY, synthetic, display-only and unapproved-candidate annotations remain explicit. No production annotations, services or clinical content are introduced.

## Evidence and limits

The complete reference set was regenerated using the existing local Edge/CDP helper. The existing validator was updated only for the candidate/source version literals and passed hash, inventory, dimensions, gallery parity and frozen-scope checks. Capture geometry/locale/authority-projection checks also passed, including no horizontal page overflow across every reference.

Live application behavior and formal accessibility/reference-device acceptance are not established by these static captures. Review uses the [gallery](review-gallery.html), [manifest](reference-manifest.json) and [pending decision packet](OPEN-UX-001-candidate-decision.md).

OPEN-UX-001 remains open. No Plan, Tasks or application implementation was run. STOP for Product Owner review.
