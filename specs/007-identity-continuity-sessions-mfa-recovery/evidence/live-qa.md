# T040 live bilingual security UI QA

- Date: 2026-08-29 (Africa/Cairo)
- Source checkpoint: `c7ede507f7ea1f500db74222e8ec869f75843a02` plus the uncommitted T038-T042 change set
- Runtime: local Expo web patient app on `127.0.0.1:8081`, local Next.js admin app on `127.0.0.1:3001`, Chromium driven through Playwright CLI
- Data boundary: synthetic display state and anonymous/degraded-session states only; no production data, Auth-table write, service role, or direct domain-database UI access
- Visual baseline status: informative live evidence only. It is not a claim of Product Owner/Design Lead pixel-baseline approval.

## Inspected journeys

| Surface                        | Locale/direction         | Viewport/state                             | Result                                                                                                                                                                                      |
| ------------------------------ | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mfa`                         | `ar-EG` RTL, `en-EG` LTR | 360x800, expired-session state             | Pass: shared alert preserves reading order, action remains visible, and focus moves to the changed heading.                                                                                 |
| `/recovery`                    | `ar-EG` RTL, `en-EG` LTR | 360x800, request state                     | Pass: field and action reflow inside the card after fonts/styles settle; no horizontal overflow.                                                                                            |
| `/relationships`               | `ar-EG` RTL, `en-EG` LTR | 412x915 and 768x1024, safe API-error state | Pass: same-record/current-authority copy, transition state, and family controls retain locale parity and vertical reflow.                                                                   |
| Admin `/relationships` step-up | `ar-EG` RTL, `en-EG` LTR | 1440x900, synthetic `aal-required` state   | Pass: existing route shows the two-step gate and assigned transition workspace without a new route or legal conclusion. The unavailable local Core API produced expected fetch errors only. |

## Interaction and accessibility checks

- Keyboard: Tab entered the first logical relationships field; the active input exposed the browser focus outline and measured 272x48 CSS px. Admin controls followed visual reading order.
- Focus restoration: the changed MFA security alert heading received programmatic focus (`tabIndex=-1`) without adding it to sequential tab order.
- Touch targets: inspected patient input/actions were at least 48 px high; shared security actions enforce the 44 px minimum.
- Reflow: a 1280 px desktop-width equivalence produced 640 CSS px at 200% and 320 CSS px at 400%. At both widths `scrollWidth === clientWidth`; core actions did not require horizontal page scrolling.
- High contrast and reduced motion: Chromium reported both `(forced-colors: active)` and `(prefers-reduced-motion: reduce)` as active. The inspected MFA state retained visible native outlines, text/symbol status cues, and no horizontal overflow. Security transitions define no animation.
- Bidi: browser snapshots reported `lang=ar-EG, dir=rtl` and `lang=en-EG, dir=ltr`; opaque security identifiers use Unicode isolation through `BidiSafeText`.
- Screen-reader semantics: Chromium accessibility snapshots exposed headings, alerts/status live regions, labeled fields, buttons, disabled state, and region/list names in both locales. This verifies the browser semantic tree; no audible NVDA or TalkBack session is claimed.
- Offline/reconnect: setting Chromium offline immediately replaced the recovery form with a polite offline banner and made the security input non-editable, so no mutation could be queued. Returning online removed the banner and restored the request form after reconciliation. No console error was emitted by the offline/reconnect transition.
- Contrast: shared primitives use the approved semantic palette; forced-colors inspection retained the status boundary and focus outline. Automated token contrast checks remain part of the design-system suite.

No critical or high accessibility defect remained after inspection.

## Screenshot inventory (SHA-256)

All screenshots are full-page, locally rendered, and visually inspected.

| File                                              | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `admin-step-up-ar-1440x900.png`                   | `82c48b77ce9e8ef52d13f0a797151a52f6dc166ce0f79460cab0ed6610c3c946` |
| `admin-step-up-en-1440x900.png`                   | `f4f4dc4fef42857620482e2fc1bae2d73fa8335cc998cf9b81f7937913832d85` |
| `mfa-ar-360x800.png`                              | `f706b888208d4daafd373703e28d20db224c7abbdb78163552f71490414210e6` |
| `mfa-en-360x800.png`                              | `a87743792e166a68d60361ea4ce98a6c50f224706b2038706cf3ea9a702e2cb8` |
| `mfa-en-forced-colors-reduced-motion-360x800.png` | `6c0ef7fd247907a4938427f804e16a1cdf226fa1eded31eb6f956596421545f0` |
| `recovery-ar-360x800.png`                         | `24fef76793e6ff56b135b52f9551435812af59773c13e1edd8ea89dd79ea6ec8` |
| `recovery-en-360x800.png`                         | `4e00529f9c2d749bf9bcea31b0673674051714e4a339dfffce8f5fefa355de48` |
| `relationships-ar-412x915.png`                    | `4044358d8603b6f6808ed52ef25ea5ce691516a60dae614ce38c86d546696b4f` |
| `relationships-en-412x915.png`                    | `f23e079e7d4d2ba09028b211fb2c9226fe7990e15ef9091aee709b7a8ec74ca5` |
| `relationships-ar-768x1024.png`                   | `bd2cff0cfb0f4140c3386f2f2f271340aec53039ec872addf3fe03d43723a2b3` |
| `relationships-en-768x1024.png`                   | `4622a0bd60cfefdcf97bbfc291d03302dc1100f96f8c408769f334b49d519170` |
