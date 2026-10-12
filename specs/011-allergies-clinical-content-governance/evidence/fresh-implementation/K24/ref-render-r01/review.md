# Feature 011 K24 rendering recheck — 2026-10-11

K24 remains blocked. This supplement changes no task checkbox, source/SQL/contract/architecture, approval, gate, Issue or Git integration state. T092 was not re-executed.

Six isolated diagnostic runs captured 258 live pairs (516 PNGs). Original and single-raster four-pair subsets passed; the expanded single-raster 119-pair run failed with a 63,024-pixel patient history framing difference (MAIN scrollTop 0 versus 343). That experiment is not promoted.

The harness now resets action-induced scrolling before feature positioning, measures viewport coverage after settling, and checks paired final framing/focus/font metadata. The first five-pair check passed. Its 119-pair expansion was rejected because coverage metadata was sampled before final scroll settling; the final signatures matched, and a separately preserved forensic comparison found all 119 raw pairs pixel-identical. The failed metadata gate remains failed; that result is not an accepted full proof.

The corrected seven-pair run passed paired final framing, but strict comparison failed: six identical pairs and one changed pixel in patient-records__success-receipt__ar-EG__360x800__dark.png, at (174,390), RGBA [16,51,64,255] versus [16,52,64,255]. Its framing matches, and the decoder independently confirms the difference. The underlying rendering cause remains unestablished. No masks, tolerance changes, font-positioning flags or application styling changes were adopted. The original renderer is used for the corrected capture runner.

The full 696-pair rerun is not started because its diagnostic prerequisite remains failed. run-full.mjs is prepared only and enforces the expanded passing prerequisite. No full-matrix or all-99-state acceptance is claimed.

The prior full pnpm verify exit-0 proof and 42 passing server p95 checks remain preserved. This pass changes only separate test/evidence helpers. Independent rehash passed all 18,054 prior sealed files (1,341,799,827 bytes), the 141 current pins, ledger and Git state. The old evidence directory remains byte-identical.

A read-only NVDA preference observation records configured English, OneCore David and volume 100. NVDA was not running at observation time. This is not speech, focus, native-device or accessibility execution; missing settings are not inferred. Actual attributable Windows/NVDA and Android/TalkBack cases/settings and applicable owner dispositions remain required as described in the preserved remaining-formal-evidence.md.

T001–T087 remain checked; T088–T092 and #485–#489 remain pending/open. Retained gates remain unchanged. Branch codex/011-allergies-clinical-content-governance; HEAD/local main 670b1e0fe15c719b98179805f2628d1b478a55dd; inherited 172-entry dirty tree preserved. Harness ports 18312/18313/18319 have no remaining listener. No commit, push, PR, main change, destructive cleanup or subagent was used.

See summary.json, single-pixel-reproduction.json and the bound raw artifacts for reproducible commands/results.
