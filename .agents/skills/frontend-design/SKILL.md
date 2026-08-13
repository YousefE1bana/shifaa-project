---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
license: Complete terms in LICENSE.txt
---

# Frontend Design

> SHIFAA overlay: Consult `shifaa-ui-governor` before this skill. The SHIFAA UI Contract fixes typography, semantic tokens, spacing, radii, breakpoints, route states, safety semantics, accessibility, and motion. Treat the process below as optional execution guidance inside those constraints; it does not add a project lifecycle. Never invent alternate SHIFAA tokens or add decorative motion to safety-critical surfaces.

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. SHIFAA has already fixed its palette, typography, tokens, and safety semantics. Create distinction through the approved type scale, weight, spacing, hierarchy, layout, copy, whitespace, content, and composition. Aesthetic risk is acceptable only on patient-facing, non-safety surfaces and only when it stays inside the UI Contract.

## Ground it in the subject

If the brief does not pin down what the product or subject is, pin it yourself before designing: name one concrete subject, its audience, and the page's single job, and state your choice. If there's any information in your memory about the human's preferences, context about what they're building, or designs you've made before – use that as a hint. The subject's own world, its materials, instruments, artifacts, and vernacular, is where distinctive choices come from. Build with the brief's real content and subject matter throughout.

## Design principles

On patient-facing, non-safety pages where a hero is appropriate, make it a clear thesis using real content and an intentional composition. Do not introduce landing-page heroes, experimental layouts, ambient effects, or moving primary actions into staff, emergency, clinical-safety, approval, or finance-decision routes. Those surfaces prioritize stable placement, density, keyboard access, and rapid scanning.

Typography carries the personality of the page, but the families are fixed: IBM Plex Sans Arabic for Arabic, Inter for Latin, and the approved monospace treatment only for codes. Use the contracted scale with intentional weights, widths, spacing, and hierarchy. Do not add or substitute typefaces.

Structure is information. Structural devices, numbering, eyebrows, dividers, labels, should encode something true about the content, not decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence - like a real process or a typed timeline where order carries information the reader needs. Question if choices like numbered markers actually make sense before incorporating them.

Use motion only when it explains state or interaction. SHIFAA timings are fixed: press feedback 120ms, content enter 180ms, and route transition 220ms. Use 0ms where reduced motion is contracted, and 0ms decorative motion on safety, emergency, approval, and finance-decision routes. Do not add generic page-load sequences, scroll reveals, ambient animation, or motion merely for polish.

Match complexity to the vision. Maximalist directions need elaborate execution; minimal directions need precision in spacing, type, and detail. Elegance is executing the chosen vision well.

Consider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.

## Process: brainstorm, explore, plan, critique, build, critique again

For calibration: AI-generated design right now clusters around three looks: (1) a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta accent; (2) a near-black background with a single bright acid-green or vermilion accent; (3) a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns. All three are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. Just like a human designer who's hired, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, brainstorm a short design plan based on the human's design brief and the SHIFAA UI Contract. Map every color idea to an existing semantic token from `packages/design-system`; do not create app-local colors, hex palettes, or a parallel token system. Use only IBM Plex Sans Arabic, Inter, and approved monospace usage. Explore layout with concise prose or ASCII wireframes, then identify one suitable signature element based on content, hierarchy, or composition. The signature must preserve safety semantics, route states, stable staff layouts, accessibility, and the contracted motion rules.

Then review that plan against the brief and UI Contract before building. If any free design choice reads like a generic default rather than a choice made for this SHIFAA context, revise it and say why. Derive every implementation value from `packages/design-system` and the approved contract, never from a new local palette, type system, spacing scale, or radius scale.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and a element-based selector like .cta). This can happen often with paddings/margins between sections.

Try to do a lot of this planning and iteration in your thinking, and only show ideas to the user when you have higher confidence it'll delight them.

## Restraint and self-critique

On a suitable patient-facing, non-safety surface, spend visual distinction in one place and keep everything around it quiet and disciplined. On staff and safety-critical surfaces, clarity, density, stability, keyboard use, and safety outrank novelty. Build to the SHIFAA quality floor: responsive behavior, visible keyboard focus, screen-reader semantics, 200% text scaling, and reduced motion. Critique your own work as you build, using screenshots when available, and remove decoration that does not help the task.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Bring the same intentionality to copy that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config. Describe what something does in plain terms rather than selling it. Being specific is always better than being clever.

Use active voice as default. A control should say exactly what happens when used: "Save changes," not "Submit." Keep action names consistent through the flow. Use the SHIFAA route-state and notification contract for confirmation: a transient toast is supplementary feedback only and never the sole carrier of a critical decision or actionable error.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the register conversational and tuned: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each element do exactly one job. A label labels, an example demonstrates, and nothing quietly does double duty.
