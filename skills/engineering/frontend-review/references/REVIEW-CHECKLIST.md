# Frontend review checklist

Apply only relevant rows and report omissions as `Not applicable` with a reason.

| Area | Verify |
| --- | --- |
| Hierarchy | Primary task is obvious; headings, emphasis, density, and reading order match intent. |
| Layout | Alignment, spacing, wrapping, overflow, safe areas, zoom, and long content behave predictably. |
| Responsive | Contract behavior holds at narrow, intermediate, and wide widths without device-specific hacks. |
| States | Loading, empty, error, disabled, permission, validation, success, hover, active, and focus states exist where applicable. |
| Keyboard | All actions are reachable and operable; order is logical; focus is visible and restored after overlays. |
| Semantics | Landmarks, headings, labels, names, descriptions, relationships, and live updates convey the interface. |
| Visual access | Contrast, target size, text resize/reflow, non-colour cues, and reduced motion meet the contract. |
| Content | Labels are specific, errors explain recovery, empty states orient, and truncation does not hide essential meaning. |
| Browser | No relevant console errors, failed requests, hydration failures, or unsupported API assumptions. |
| Regression | Existing adjacent flows, design-system behavior, tests, and visual baselines remain intact. |
