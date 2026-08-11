# Design contract template

Use this structure for `docs/design/<feature>/DESIGN.md`. Replace every placeholder; use `Not applicable` with a reason instead of silently deleting a required concern.

```markdown
# <Feature> design contract

- Status: Draft | Approved
- Approved by: <person or decision source>
- Approved at: <ISO-8601 timestamp>
- Governing issue/spec: <path or URL>

## Product frame

- Intent and success criteria:
- Audience and priority tasks:
- In-scope flows:
- Target platforms and inputs:
- Constraints:

## Selected direction

<Name, thesis, and why it won.>

## Rejected alternatives

- <Direction> - <reason>

## Design principles

- <Principle expressed as an implementation decision>

## Tokens and typography

<Exact existing or new token names, values, font roles, type scale, line heights, and fallbacks.>

## Layout and responsive behavior

<Grid, regions, density, max widths, breakpoints by behavior, reflow, overflow, and zoom rules.>

## Component anatomy

<Components, subparts, ownership, variants, and reuse expectations.>

## States

### Loading
### Empty
### Error
### Disabled and permissions
### Validation and success

## Interaction and motion

<Pointer, touch, keyboard, focus, transitions, timing, reduced-motion behavior, and interruption.>

## Accessibility requirements

<Semantics, names, reading/focus order, contrast, target size, announcements, reflow, and supported assistive use.>

## Evidence

- [<Direction/state/viewport>](evidence/<file>)

## Non-goals

- <Explicitly excluded work>

## Implementation acceptance criteria

- [ ] <Observable, testable criterion>
```
