# F012 C3 — final mobile initial-viewport correction

**v0.3.0 candidate — NOT APPROVED.** Open index.html for a standalone, offline before/after gallery. No C1/C2/C3, Plan or lifecycle approval is recorded.

## What changed

- Compact Patient layouts only (<=599px): a viewport grid reserves one row for the dock and a separate scrollport for all introductory/header/record content. The dock is outside the scrolling content, with an opaque surface, visible boundary and localized scroll cue. Help remains 16px above navigation and at least 56px; navigation remains accessible.
- Content cannot paint behind Help/navigation on the initial screen. At 200% text the entire record naturally extends below the fold: scroll or keyboard focus reveals remaining details inside the scrollport. This is ordinary scrollport clipping, not a claim that all record text fits in one viewport.
- Focus scrolling targets the compact scrollport. Wider Patient and staff layouts retain their prior appearance. No content is hidden to make screenshots pass, and no clinical/product/source/release policy changes were made.
- Satisfactory v0.2 blocked-action and historical warning logic is byte-identical up to document construction. Every earlier source/capture/approval remains preserved.

## Actual evidence

| Check | Observed result |
| --- | --- |
| Initial viewport comparison | 16 cases: two Patient flows × Arabic RTL/English LTR × 360×800/412×915 × 100%/200% text. Every before case reproduced occluded text; every after case had zero occluded painted text lines. |
| Affected mobile state coverage | 164 light/dark initial-viewport baselines regenerated, including all Patient states at both widths/locales. 320 state/text-size geometry checks passed, including every light state at 200% text. |
| Separation | No intersection of scrollport and reserved dock in all 320 checks; minimum scrollport height 502px in those checks. |
| Keyboard/scroll | All 16 selected cases passed skip-to-content, visible focus, >=44px targets, fully visible focused actions and scroll-end clearance. Eight additional actual viewport screenshots show keyboard-focused recovery reads at 200% text. |
| Unaffected references | 16 same-renderer pixel comparisons passed: representative tablet/desktop Patient and mobile staff conflict compositions. 884 unaffected baseline references inherit exact prior bytes. |
| 320px reflow | Four 200%-text cases passed. This is not an actual 400%-browser-zoom or native-device acceptance. |

All screenshots are true viewport captures (fullPage=false), width/height as labelled. Before screenshots are newly rendered from unchanged v0.2 source at scroll offset zero; they are not altered/cropped historical PNGs. Focus screenshots are explicitly separate from initial-screen evidence.

## Remaining C3 review

- [ ] Product Owner reviews initial no-occlusion and keyboard-scrolled views at both widths/locales/text sizes, with any remaining changes recorded.
- [ ] Actual Design Lead records attributable acceptance of the exact revised mobile source, delta plus inherited manifests and baseline hashes, with required coverage; reconcile this additive version with prior C3 references.
- [ ] C1/C2 acceptance, supporting-contract integration and a separately explicit PLAN_APPROVED remain separate. OPEN-UX-001 is still OPEN; J-04/AC-13 positive visibility stays BLOCKED.

Browser observations are not native NVDA/TalkBack, physical-device, OS text-scaling, human live-language, security/runtime or OPEN-UX-002 acceptance. Those remain at their applicable gates.

## Exact candidate hashes

| File | SHA-256 |
| --- | --- |
| specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/index.html | 52feb23168a3bd837c0f270d658799474205129d7d5895b41ba06486bffe06bd |
| specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/compositions.css | dd58f8e1efe3ae230891e7f2f25c48d65b2aeef55da53463749210a01164fa41 |
| specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/compositions.js | d1f52add9053cddfa79c98b7078f21986f42aba93a7ac870d633cc258adaad21 |
| specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/capture.cjs | 2ae6b7553a623780d5e1b55b17fbf34882fe5671a9614bcca49d29437e3552ba |
| specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/manifest.json | 85708ffa055a0fda5ac582425a24706e1cafc1d7911f6abb6a003a0ceb07bde6 |
| specs/012-prescription-safety-governed-overrides/readiness/c3-mobile-2026-11-11-v0.3.0/baseline-selection.json | 2d61fc9c88e8cd7f3c4281e99ff3630d56e4c2ef703e01955f9e968cc27dbb2a |

## Selected image index

| Flow/state | Locale | Viewport | Text | Capture | Path | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| prescription/superseded | ar-EG | 360×800 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-ar-EG-360x800-text1.png | ef7999ed0e055f9df133e6653f7ad42923234956a0b8ae8db4e71eb8cf92194d |
| prescription/superseded | ar-EG | 360×800 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/prescription/superseded-ar-EG-360x800-light.png | 26bfbbc711d5788edb2eb603b750d288012e34ecbb8ad15e7059e70190bb4729 |
| prescription/superseded | ar-EG | 360×800 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-ar-EG-360x800-text2.png | 9d0c77a94fd2a985ff8a179984c33a6114a74ae1f1232d39ba2be3cf47668e25 |
| prescription/superseded | ar-EG | 360×800 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/prescription-superseded-ar-EG-360x800-text2.png | 79140363e0444595c2d56bf2b416c46404695a8ca6171a5f4161812221b602c9 |
| prescription/superseded | ar-EG | 412×915 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-ar-EG-412x915-text1.png | fc4cc15cc2cee455929be72632ba2e7d99e68dc19d4b190dd660ac44ef8cf72d |
| prescription/superseded | ar-EG | 412×915 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/prescription/superseded-ar-EG-412x915-light.png | fa9e4a9893e0c52bc2103d18d761ce5634e3396879c7e4cf71daa51aa38b9949 |
| prescription/superseded | ar-EG | 412×915 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-ar-EG-412x915-text2.png | 54bfd20d10b62d98ef4ecc389f0322535cbe41c8244606ea12f5f9185894cf41 |
| prescription/superseded | ar-EG | 412×915 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/prescription-superseded-ar-EG-412x915-text2.png | 815af0e08b4761eed7ed21ba7506422b34d4c30e2ea18f156655006c9d202ce3 |
| prescription/superseded | en-EG | 360×800 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-en-EG-360x800-text1.png | 118d7461423df8310146cdbcfa900eb0043944132673476c86fc648f1eb43075 |
| prescription/superseded | en-EG | 360×800 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/prescription/superseded-en-EG-360x800-light.png | 3e667842108d6396591b4f3d6226bc6136110c22a703f0875f92c3e48cc2c864 |
| prescription/superseded | en-EG | 360×800 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-en-EG-360x800-text2.png | 41c57423a83940815d8c699e5a19cb459ac8181fd7dce42d178986bf9bf3a971 |
| prescription/superseded | en-EG | 360×800 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/prescription-superseded-en-EG-360x800-text2.png | c0e63d3f95ed65cddf63f65e144b03eadfa3867b613bcae70c9d94d0b6d4dbf3 |
| prescription/superseded | en-EG | 412×915 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-en-EG-412x915-text1.png | 9ea6c30a4f71282cfcbab482866c86b5b12f599a7e687c129c785dc5f7074ed8 |
| prescription/superseded | en-EG | 412×915 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/prescription/superseded-en-EG-412x915-light.png | 81196f91912f8c77c04d6741789ed23e1489fc48597bd5366fd0eda5fdfc1767 |
| prescription/superseded | en-EG | 412×915 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/prescription-superseded-en-EG-412x915-text2.png | c5e6c23553ccdb2f270939cc961bfce3027f7161e9d3be444083cd62d5e9e361 |
| prescription/superseded | en-EG | 412×915 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/prescription-superseded-en-EG-412x915-text2.png | d3fcc125de6539e1e37d430c88367c20c189c8b56186515a021e74f086341473 |
| medications/partial | ar-EG | 360×800 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-ar-EG-360x800-text1.png | 62f6110053d4a14238a080c190a745bc9e59bdbbdeaa9e94b692a62a7dba160b |
| medications/partial | ar-EG | 360×800 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/medications/partial-ar-EG-360x800-light.png | 21c7a9da0eb76b48300ff7c5b0be09f8b1e216f6546c1d9f991bfe3cbb9e7a4a |
| medications/partial | ar-EG | 360×800 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-ar-EG-360x800-text2.png | fad45d4bb3ac686169bf94ac7a2857fb16a5909c81cf877192be44136da36980 |
| medications/partial | ar-EG | 360×800 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/medications-partial-ar-EG-360x800-text2.png | 89a8943d903fefb36f06c310747ff32734c61ff0534836dbdc58ddad684f78ae |
| medications/partial | ar-EG | 412×915 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-ar-EG-412x915-text1.png | 63edc02f4172f7fa86d8562eca6963c1f3885405a7d861dc7f2a90b4b95f0b0b |
| medications/partial | ar-EG | 412×915 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/medications/partial-ar-EG-412x915-light.png | 8d8b0f188a3bbcf187cb438ab641aebce8c740bdd2bffa70b3c453e7304f1ab2 |
| medications/partial | ar-EG | 412×915 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-ar-EG-412x915-text2.png | 2d05a30bf3041dc269077c490fb14dd5bf30bc774fc8ef128579a0d47b9122e9 |
| medications/partial | ar-EG | 412×915 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/medications-partial-ar-EG-412x915-text2.png | 48d623ef7db670f13208e25c5cd49389d809c1891fa7290312a4df40b183ee6b |
| medications/partial | en-EG | 360×800 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-en-EG-360x800-text1.png | db6624e5d033b452b3215be257ceae5370341b84ce6764d11492238da4953394 |
| medications/partial | en-EG | 360×800 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/medications/partial-en-EG-360x800-light.png | a3aa4c924a7ce403710627221c6fe94147566a2dc31a0485d6fd5906efe27fb9 |
| medications/partial | en-EG | 360×800 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-en-EG-360x800-text2.png | a404ad33510ba83e377024475ed274dcc6ee19e8963dc73be152a7a3528880c3 |
| medications/partial | en-EG | 360×800 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/medications-partial-en-EG-360x800-text2.png | 8d971bd3df208020a02cb5708ed55d10a14c632c74cda974f9ed4527f6ce894b |
| medications/partial | en-EG | 412×915 | 100% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-en-EG-412x915-text1.png | 249c9520edf78f1767fd52aff94ef2953277b644e72ee5434e2ec2b5cb68ee85 |
| medications/partial | en-EG | 412×915 | 100% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/baselines/medications/partial-en-EG-412x915-light.png | dcbf7b6c271c3cc0092804aeb3ff7b89c8e38bae733f8e503527fdd5ff5f65c1 |
| medications/partial | en-EG | 412×915 | 200% | before / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/before/medications-partial-en-EG-412x915-text2.png | 07d0313bbe5fc654dac97750d0a50b747d78f1ea2c1fe4bf8f9cb5cc3e6c4f18 |
| medications/partial | en-EG | 412×915 | 200% | after / initial | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/after/medications-partial-en-EG-412x915-text2.png | 552ed70b13ccbea158964dbcd59ef2d4ae57c4edbc5e3e3b7c8b824a67fae962 |
| prescription | ar-EG | 360×800 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/prescription-superseded-ar-EG-360x800-text2.png | 13698dc1382677b22efc1616b9a390a30d285ce26f622af043fa6f328b97bee4 |
| prescription | ar-EG | 412×915 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/prescription-superseded-ar-EG-412x915-text2.png | 5ff664bf72ab043ef9e967db4801c5e5c312df3454a7f22d0c5a1bd413e75835 |
| prescription | en-EG | 360×800 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/prescription-superseded-en-EG-360x800-text2.png | a1ce1aeea8c094e28186e679b57f3a1c2c25e7f9815fa570a5dd50458c82e1ea |
| prescription | en-EG | 412×915 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/prescription-superseded-en-EG-412x915-text2.png | e6d4437474e91ad0b3372fd59a0e97c1e0251d64cb85ac19bd7246a8a7db70d4 |
| medications | ar-EG | 360×800 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/medications-partial-ar-EG-360x800-text2.png | 46685be534854614db033e2c2c67385ae450d81c19437b2e2906adb5b387d3a2 |
| medications | ar-EG | 412×915 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/medications-partial-ar-EG-412x915-text2.png | 92bcc1deb564ba2a17011047699b6f73302b1d5c86cc65d214547ae7af83ed82 |
| medications | en-EG | 360×800 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/medications-partial-en-EG-360x800-text2.png | eed9d6103af4f53e413a1dc75f2535ddea21968a9aa5215ac99a34feba5667d5 |
| medications | en-EG | 412×915 | 200% | after / keyboard-scrolled | specs/012-prescription-safety-governed-overrides/design/c3-mobile-2026-11-11-v0.3.0/viewport-evidence/focus/medications-partial-en-EG-412x915-text2.png | b1a5675c44f48e75caed4a30476e2aaba46f044e0660aa17c359753d36351820 |
