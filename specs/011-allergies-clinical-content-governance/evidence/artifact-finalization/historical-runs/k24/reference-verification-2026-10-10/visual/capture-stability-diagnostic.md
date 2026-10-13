# Capture stability diagnostic (non-acceptance)

The archived strict comparison at `archives/2026-10-10T141015-521Z-06df30ed-f413-410e-be02-57435b588a9f/comparison.json` recorded 23 changed screenshots: 20 admin English captures and three patient Arabic `history-open` captures at 1440x900. The visible differences were selected native-select text in the admin surface and delayed patient history-panel scrolling/focus after expansion. The original A/B captures and comparison remain preserved.

The first isolated 23-entry replay after scroll/focus settling made all three patient history screenshots identical, while 11 admin English entries still differed. For those entries, the archived pair has matching stability signatures, font faces, and asset hashes; the selected native-select glyphs still differ. This leaves the exact cause unconfirmed.

The helper now preloads the approved Inter face with the actual English locale/projection option text before each admin select action. It records each action's before/after selected label and value, computed font/family, document font status, relevant Inter/IBM Plex Sans Arabic face statuses, and Inter glyph check in each capture manifest. It then loads the selected text against the select's computed font and waits for font readiness and two animation frames. Combined with the existing post-action stable-state signature, this tests whether the locale/projection change happened before the target font glyphs were ready. It does not change app behavior, CSS, screenshots, comparison tolerance, masks, or approved matrix data. The preload hypothesis is not confirmed until the parent runs and strictly compares the isolated diagnostic replay.

To replay exactly the 23 failing matrix entries, run from the repository root in PowerShell:

```powershell
$comparison = Get-Content 'artifacts/feature-011/k24/reference-verification-2026-10-10/visual/archives/2026-10-10T141015-521Z-06df30ed-f413-410e-be02-57435b588a9f/comparison.json' -Raw | ConvertFrom-Json
$env:F011_VISUAL_DIAGNOSTIC_CASES = ($comparison.captures | Where-Object changedPixels -gt 0 | ForEach-Object { $_.name -replace '\.png$','' }) -join ','
$env:F011_VISUAL_DIAGNOSTIC = '1'
node artifacts/feature-011/k24/reference-verification-2026-10-10/visual/capture-current-app-surfaces.mjs
Remove-Item Env:F011_VISUAL_DIAGNOSTIC_CASES
Remove-Item Env:F011_VISUAL_DIAGNOSTIC
```

Diagnostic images, manifests, and logs go under `visual/diagnostics/<run-id>/`; this mode skips full preflight, does not invoke the formal comparator, and prints `DIAGNOSTIC_ONLY_NOT_A_PASS`. It does not create a formal visual execution record or archive entry. The full 696-capture run and its unchanged formal wrapper are still required for verification.
