# Feature 011 physical-device software versions

Date: 2026-10-10 (Africa/Cairo). Source: Yousef Osama's direct follow-up in the current conversation. Status: **USER-REPORTED; NATIVE TEST RESULTS PENDING**.

This supplements the [initial reviewer/device availability record](physical-device-availability-2026-10-10.md) without rewriting the earlier unresolved fields as if they had already been known. Yousef Osama remains the accountable initial reviewer.

| Physical device | Reported software |
| --- | --- |
| Windows workstation, local IPv4 192.168.1.50 | Windows 11 Pro 26300.9550; NVDA 2026.2; Google Chrome 154.0.8037.93, Official Build, 64-bit |
| Reno 13, local IPv4 192.168.1.20 | Android 16; CPH2689 Build/BP2A.250605.015; device software CPH2689_16.0.5.1001(EX01C10P02); TalkBack 17.0.1.926549743, version code 60215178; Android Chrome 154.0.8037.92 |

Both screen readers are reported ready. Android 16 is explicitly supplied by the reviewer, not inferred from the device software string. These are user-reported values, not remotely inspected device facts. Local IP addresses do not prove reachability or establish an approved network/load profile.

## Guided engineering session preparation

Use the existing [native accessibility worksheet](native-accessibility-worksheet.md), recording the actual display/font settings, speech languages, device hardware details and tested build/session at execution time. Missing settings may be captured during the initial engineering session; they must not be invented or omitted from a claimed formal profile.

The current supplementary browser harness uses browser-local HTTP interception. Its isolated localhost servers are not a ready physical Android test session: sending the phone a localhost URL or exposing the frontend alone would not supply that browser's fixtures. Before native testing, confirm an isolated synthetic session that each physical device can actually access, and record its delivery mode and input hashes. Do not count unauthenticated/fixture setup failures as native accessibility outcomes.

For the first Windows case, enable NVDA speech capture, record locale and settings, then exercise the patient records heading/context and report controls by keyboard. Capture actual spoken labels, focus order, unknown/history wording and absence of clinician verification controls. Repeat in Arabic RTL and English LTR. The matching Android case uses TalkBack swipe order and activation on the patient surface. Mark all cases NOT EXECUTED until observed; native zoom/scaling and remaining surfaces/states follow the worksheet.

The agent can prepare/review evidence but cannot operate the native screen readers through the available computer-control APIs. Reviewer-operated utterance/interaction evidence is required.

No formal reference-profile selection, formal gate disposition, actual native PASS, task acceptance or Issue closure is recorded. OPEN-UX-002 and OPEN-TECH-003 remain OPEN; all other retained gates and 400/800 ms limits remain unchanged. T088-T092 remain unchecked. T092 NOT EXECUTED; K24 BLOCKED. No product, contract, SQL, grant, canonical input, commit, push, PR or main change.

Docs Guard review: reported versions match the user's statement; worksheet/availability links exist; physical testing is distinguished from automated browser fixtures and from formal acceptance.
