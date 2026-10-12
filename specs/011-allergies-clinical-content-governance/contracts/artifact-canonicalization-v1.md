# Artifact Canonicalization Contract v1

Contract ID: **SHIFAA-F011-ARTIFACT/1**. Status: **PROPOSED — PRODUCT OWNER / ARCHITECTURE REVIEW REQUIRED**. Engineering signing/byte contract only; no clinical policy or approval. This supplements the approved Feature 011 governance boundary without changing its seven operations, authority, eligibility or retained gates.

The [machine-readable profile](artifact-canonicalization-v1.json) mirrors this normative text. The [fixed vectors](artifact-canonicalization-v1-vectors.json) are normative examples. A disagreement between these artifacts blocks consumption; an implementation cannot select its preferred interpretation. [Parity ownership](artifact-canonicalization-parity-v1.json) binds their exact file hashes. None of these artifacts is a production/core/SQL encoder.

## 1. Facts and trust boundary

The input is the closed normalized facts object described by the profile's inputSchema. Object insertion order is irrelevant. Missing or additional properties reject at every nesting level. Source reference is explicitly string or null in this internal object; the existing API Source schema still allows omission but not explicit null. The trusted boundary maps omission to null. No wire request or response schema is changed here.

Series identity is the server-resolved tuple **contentType / governedContentKey / effectiveScopeKey**, not a database-generated series UUID. Existing owner-approved or explicit neutral synthetic registry rules still govern that tuple. This contract does not create a category, scope registry, source allowlist or clinical qualification rule.

Resolve all three evidence references to their exact immutable unencrypted material bytes through the approved evidence port. Compute/verify each SHA-256 from those bytes. A caller-supplied material digest, reference text, encryption ciphertext or JSON rendering is not evidence of the material digest. Bind both references and digests so changing the referenced evidence identity cannot retain the old envelope hash. Fixtures contain neutral non-executable material only; the fixture evidence has no clinical admissibility or production effect.

The envelope excludes the current release UUID and any physical/database series UUID, artifact_version, workflow_version, publication state, authority/signature records and caller declaredDigest. For successor artifacts, predecessor.supersedesReleaseId is explicitly retained as the sole release-UUID lineage field in the envelope, encoded as a canonical release UUID in field 8. Initial artifacts encode field 8 as N,. Signatures separately bind resource_id and artifact_version as required by the approved model. Workflow changes never alter envelope bytes. Any change to a bound fact requires a new immutable artifact/release; this contract authorizes no edit operation.

## 2. Exact bytes and field order

Start with the following **23 ASCII octets**, without quotes, BOM, newline or spaces:

```text
SHIFAA-F011-ARTIFACT/1;
```

The prefix's exact hex is recorded in the machine-readable profile. Append exactly fourteen frames in this order. Field names and JSON punctuation are not encoded.

| Position | Bound fact | Frame type / interpretation |
| --- | --- | --- |
| 1 | series.contentType | S, nonempty exact text |
| 2 | series.governedContentKey | S, nonempty exact text |
| 3 | series.effectiveScopeKey | S, nonempty exact text |
| 4 | source.display | S, nonempty exact text |
| 5 | source.reference | S, nonempty exact text; or N for absence |
| 6 | effectiveAt | S, canonical UTC instant |
| 7 | predecessor kind | S containing exactly initial or successor |
| 8 | predecessor.supersedesReleaseId | N for initial; S canonical UUID for successor |
| 9 | evidence.content.ref | S canonical UUID |
| 10 | evidence.content.sha256 | S canonical digest |
| 11 | evidence.code.ref | S canonical UUID |
| 12 | evidence.code.sha256 | S canonical digest |
| 13 | evidence.testVectors.ref | S canonical UUID |
| 14 | evidence.testVectors.sha256 | S canonical digest |

A string frame is the concatenation of ASCII **S**, its UTF-8 **octet** length in minimal unsigned decimal ASCII, ASCII **:**, the exact UTF-8 payload and ASCII **,**. For example, literal text null is S4:null, and Arabic text أ is S2:أ, (hex 53323ad8a32c). Decimal lengths have no sign, leading zero, exponent, fractional part, whitespace or locale digits. Zero is represented only as 0; it is not valid for the nonempty fields in this profile. Counts are bytes, never JavaScript UTF-16 code units or PostgreSQL character counts.

The only null frame is exactly **N,** (hex 4e2c), with no length or payload. Empty string, literal null, missing frame and null are distinct. There is **no escaping**. Colons, commas, semicolons, quotes, backslashes, CR, LF, tabs and Unicode inside a payload are literal bytes and consumed by length. They cannot end a frame. After the last payload's comma there are no additional bytes or envelope terminator.

For initial=true, supersedesReleaseId MUST be null, field 7 is S7:initial, and field 8 is N,. For initial=false, a canonical predecessor UUID is required, field 7 is S9:successor, and field 8 is S36:<UUID>,. Reject every inconsistent pair. Publication still independently proves whether the initial exception or named predecessor is currently valid; hashing does not grant that permission.

## 3. Text, UUID and digest normalization

Use strict UTF-8 as specified by RFC 3629. Reject malformed/overlong UTF-8, encoded surrogates, lone UTF-16 surrogates and U+0000. Do not replace invalid input with U+FFFD. U+0000 cannot round-trip through PostgreSQL text. A leading UTF-8 BOM is not part of the prefix; U+FEFF occurring inside a legal payload remains literal text.

Preserve all other Unicode scalar values exactly. Apply **no NFC/NFD normalization, trim, case folding, whitespace folding, line-ending conversion, URI normalization, JSON serialization or locale transform** to text. Precomposed and decomposed text can have different hashes; V06/V07 demonstrate this deliberately. JSON escapes in the vector file are transport notation only; the decoded scalar strings are the facts.

Canonical UUID facts use lowercase ASCII hex and exact 8-4-4-4-12 hyphenation. Do not invent UUID-version, nil-UUID or clinical restrictions. The trusted boundary may parse an otherwise valid wire UUID and render this canonical form; an already normalized facts object containing uppercase or alternate UUID spelling rejects.

Material digest bytes are exactly 32 octets. Render them as exactly 64 lowercase ASCII hexadecimal characters, without 0x, spaces or separators. Text digest facts and caller declaredDigest must already have that representation; uppercase, odd/short length or non-hex rejects. The encoder does not silently case-fold a supplied textual digest. PostgreSQL bytea encode(..., 'hex') and a byte-array lowercase hex renderer produce this representation without locale dependency.

## 4. Exact instant normalization

Canonical effectiveAt is exactly **YYYY-MM-DDTHH:mm:ss.ffffffZ**, a valid proleptic Gregorian UTC instant in years 0001 through 9999, with six fractional digits, seconds 00 through 59 and ASCII digits. No leap second, year zero, impossible date, 24:00, offset, space separator or alternate precision is legal in normalized facts.

At the existing date-time wire boundary, validate the RFC 3339 calendar/clock first, require a known explicit Z or numeric offset, convert to UTC using that offset, and render six fractional digits. Case-insensitive wire t/z renders uppercase T/Z. An omitted fraction becomes 000000; one through six fraction digits are right-padded with zeros. Padding preserves the instant and does not assert a clinical measurement's precision. Offset hour/minute ranges follow RFC 3339 (00..23 / 00..59). Reject -00:00 because it denotes an unknown offset. Reject more than six fractional digits rather than rounding, even if the excess digits are zero. Reject a converted UTC year outside 0001..9999. No server/session/UI timezone or inferred medical timezone participates.

PostgreSQL must not silently round an input into compliance: validate the textual precision/calendar before timestamptz conversion. Format a valid stored instant after explicit conversion to UTC, with fixed ASCII components and six microsecond digits. TypeScript must preserve microseconds using validated components/integer arithmetic; Date alone cannot preserve a non-millisecond instant. Locale formatting, transaction clocks and current date are irrelevant to these bytes. Future instants encode identically to past instants; eligibility remains a separate approved policy.

## 5. Validation, hashing and declared equality

Reject non-canonical normalized facts rather than silently repairing them. A byte consumer first validates strict UTF-8, exact prefix/version and all frame tags/lengths. Read exactly each stated number of payload octets, require its comma, validate the fact at that ordinal, require all fourteen frames, and reject missing/trailing bytes. Do not split on delimiters. Reject lengths exceeding remaining input before allocation and fail before integer overflow or platform size limits; never truncate. Existing transport/resource limits still apply, without a new medical size threshold.

Compute **SHA-256 of the entire exact prefix plus frames**. Persist 32 digest octets; API/signing representation is 64 lowercase ASCII hex with no prefix/whitespace. If declaredDigest is present in the existing Artifact request, require canonical syntax and exact equality with the server-computed result. It is not itself a hashed field. Missing declaredDigest permits server computation; it never permits skipping evidence resolution or hashing. Wrong declared digest must not create a release or signature.

Vector expectedRejection values are test classifications, not new public API problem codes. Use the existing API Catalog error mapping and redacted errors during later implementation. Envelope parsing, hashing and test-vector success grant no creation, signing, publication, patient access or production authority.

## 6. Shared vectors and parity ownership

The vector JSON contains seven positive envelopes with complete facts, neutral material-byte hex, exact canonical UTF-8 text, exact canonical hex, octet length and expected SHA-256. Four boundary-normalization examples and one key-order equivalence case supplement twenty-five negatives. canonicalHex is the exact-byte representation; canonicalUtf8 must encode to those same bytes. Fixed expected outputs must never be regenerated from an implementation under test.

Before any C03 DDL/function, C02A/T090–T092 owns review/test-first parity preparation: the three canonical artifacts become required generator/verifier inputs, and generated schema/client metadata bind contract ID and input hashes. Wire shapes/methods stay unchanged; no encoder is generated. Missing, changed-without-regeneration, inconsistent or stale canonical artifacts must fail preparation. C03 proof must bind the same inputs and execute the normative vectors through the real physical implementation in both runtimes; generic digest primitives are not operation acceptance.

C13/T045–T047 later implements the portable core encoder **against this same v1 contract**, without redefining serialization. Its equivalence evidence compares core and already prepared SQL bytes/hash to the fixed vectors in both PostgreSQL runtimes, including object-key permutations, microseconds, Unicode and negative inputs. A disagreement blocks consumers; changing bytes requires a new explicitly reviewed contract version, never an in-place reinterpretation of v1 or old signatures.

OPEN-TECH-002 remains open and fail-closed. This proposal supplies an engineering definition, not generated/physical parity acceptance, C03 completion, real clinical approval, gate closure or permission to execute later checkpoints. STOP for Product Owner / Architecture review.
