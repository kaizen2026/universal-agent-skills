# Canonical installation wording

Use this wording in the top-level README and release notes. Skill documentation pages do not repeat installation commands.

## Primary: skills CLI

```shell
npx skills@latest add kaizen2026/universal-agent-skills
```

The installer lets the user select skills and target agents. Select the promoted Universal Agent Skills group for complete workflows; leave General unselected. Do not recommend `--all` or `--skill '*'` as the promoted-only installation: those also include non-promoted entries. Selecting an orchestrator alone does not resolve its skill dependencies. Include `setup-universal-agent-skills` for repository setup and optional lifecycle adapters.

For one workspace shared by Codex and Claude Code:

```shell
npx skills@latest add kaizen2026/universal-agent-skills --agent codex claude-code
```

Choose symlink installation, not `--copy`. Codex reads the canonical `.agents/skills/` files; Claude reads links from `.claude/skills/`. Verify the actual method if symlinks are unavailable. This npx-only path installs standalone skills, not a native Claude plugin. Run `$setup-universal-agent-skills` in Codex or `/setup-universal-agent-skills` in standalone Claude only when repository setup or optional hooks are wanted.

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

An npx-only native-plugin alternative, using the Claude CLI version covered by the smoke test:

```shell
npx --yes @anthropic-ai/claude-code@2.1.266 plugin marketplace add kaizen2026/universal-agent-skills --scope local
npx --yes @anthropic-ai/claude-code@2.1.266 plugin install universal-agent-skills@universal-agent-skills --scope local
npx skills@latest add kaizen2026/universal-agent-skills --agent codex
```

Run from the target project. This is an alternative to installing standalone skills for both agents. Claude uses its managed plugin cache; Codex uses the project skill directory. Local plugin scope does not share settings through Git.

Pick one delivery path per host. The Claude plugin can coexist with an npx installation targeting only `--agent codex`; adding the standalone bundle to Claude as well creates duplicate skills. Plugin commands are namespaced, for example `/universal-agent-skills:prompt-engineer`. Host adapters remain a separate, explicit choice through `/universal-agent-skills:setup-universal-agent-skills`. Do not register overlapping continuity handlers from this runtime and the companion `claude-agent-skills` integration. Never remove existing user installations silently.
