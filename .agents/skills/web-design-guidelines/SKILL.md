---
name: web-design-guidelines
description: Review SHIFAA web UI code for implementation-quality, accessibility, and interface guideline issues. Use for UI reviews, accessibility audits, UX reviews, or checks against web interface best practices, always under the SHIFAA UI Contract.
---

# Web Interface Guidelines

Consult `shifaa-ui-governor` first. SHIFAA typography, semantic tokens, spacing, radii, breakpoints, route states, safety semantics, motion, and accessibility requirements override generic rules.

## Review workflow

1. Read the pinned reviewed rules in `references/web-interface-guidelines.md`. Do not fetch a moving remote ruleset during a SHIFAA review.
2. Read the requested files or resolve the user-provided pattern.
3. Check the code against the pinned rules and the SHIFAA UI Contract.
4. Report terse, actionable findings as `file:line - finding`. Label conflicts as SHIFAA contract violations rather than applying the generic rule.

Do not edit unless the user asks for fixes. Do not send source code or repository data to an external service.
