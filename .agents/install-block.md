# Canonical installation wording

Use this wording in the top-level README and release notes. Skill documentation pages do not repeat installation commands.

## Primary: skills CLI

```shell
npx skills@latest add kaizen2026/universal-agent-skills
```

The installer lets the user select skills and target agents. Include `setup-universal-agent-skills` for repository setup and optional lifecycle adapters.

Supported variants:

```shell
npx skills@latest add kaizen2026/universal-agent-skills --global
npx skills@latest add kaizen2026/universal-agent-skills --skill=<name>
npx skills@latest update
npx skills@latest update --global
```

## Optional: direct Claude Code plugin

The plugin is a managed, read-only bundle. It is not the primary universal installation and is not claimed to be in Claude Code's official marketplace.

```text
/plugin marketplace add kaizen2026/universal-agent-skills
/plugin install universal-agent-skills@universal-agent-skills
```

Pick one installation path. Installing both creates duplicate skills. Host adapters remain a separate, explicit choice through `/setup-universal-agent-skills`.
