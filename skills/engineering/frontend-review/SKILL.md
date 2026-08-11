---
name: frontend-review
description: Review frontend changes for visual fidelity, hierarchy, responsiveness, interaction states, keyboard use, accessibility, content clarity, browser behavior, and regressions. Use for UI diffs, branches, or pull requests, independently or as the frontend lane of code-review.
---

# Frontend Review

Review the rendered product, not just the component source. Keep this lane independent from Standards and Spec review so visual and interaction failures cannot be masked by clean code or nominal requirement coverage.

## Establish the review surface

Pin the fixed point and list changed frontend routes and components. Locate the governing `docs/design/<feature>/DESIGN.md`, if any, and read its evidence and acceptance criteria. A missing contract is not automatically a defect when the change did not require a visual decision; state which visual source of truth, if any, was available.

Detect and report capabilities before testing:

- Runnable local application
- Browser automation and screenshot capture
- Supported viewport or device emulation
- Automated accessibility scanner
- Keyboard and screen-reader inspection
- Visual-regression baseline

Never translate a missing capability into a pass. Mark the affected checks `Unverified` and explain the exact limitation.

## Exercise the interface

Read [REVIEW-CHECKLIST.md](references/REVIEW-CHECKLIST.md), run the repository's frontend checks, and inspect every affected surface at representative desktop and mobile widths. Exercise pointer and keyboard paths plus loading, empty, error, disabled, validation, focus, overflow, long-content, zoom, and reduced-motion states that apply.

Compare hierarchy, spacing, typography, colour, component anatomy, responsive rules, and motion against the approved contract and existing design system. Check browser console and network failures. Capture evidence for defects and for material checks that passed when tooling supports it.

## Report evidence, not taste

Group results as:

1. **Findings** - severity, route/state/viewport, reproducible evidence, violated contract or accessibility requirement, and the smallest useful fix.
2. **Verified** - checks actually exercised and the tools or manual method used.
3. **Unverified** - checks blocked by missing tooling, environment, data, browser, or baseline.
4. **Disposition** - `Blocked`, `Incomplete`, or `Ready`.

Distinguish contract violations and accessibility failures from subjective suggestions. Do not approve on aesthetics alone. Return the report to `/code-review` as a separate Frontend lane when invoked from that workflow.

Use `Blocked` when a contract acceptance criterion, core flow, keyboard path, or accessibility requirement fails; require the owner to fix it and rerun the affected checks. Use `Incomplete` when no blocking failure was observed but a required check is unverified. A review whose rendered, responsive, keyboard, and accessibility behavior is wholly unverified is always `Incomplete`, never approved. Use `Ready` only when there are no blocking findings and every required acceptance check was actually verified.
