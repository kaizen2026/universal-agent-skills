# Domain docs seed

Default to one root `CONTEXT.md` and `docs/adr/`. For a genuine multi-context monorepo, use a root `CONTEXT-MAP.md` that points to context-local glossaries and ADR directories. Record consumer instructions in `docs/agents/domain.md`.

The consumer document must identify the actual glossary and decision directories, how to select the correct context, and these responsibilities:

- Read the relevant glossary before using project terminology. Reading alone does not invoke the active modeling workflow.
- Keep `CONTEXT.md` a vocabulary reference; put implementation plans in specs and hard-to-reverse decisions in ADRs.
- Consult applicable ADRs before reopening settled decisions. Preserve the project's existing ADR format.
- Create glossary and ADR files only when there is actual content to record.
- In a monorepo, follow the map to the context owning the changed behavior; do not mix unrelated domain vocabularies.
