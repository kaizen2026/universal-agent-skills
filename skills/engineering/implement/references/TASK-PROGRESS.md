# Native checklist and shared progress

The user should see what was done, what is happening, what comes next, and what is blocked without writing a special steering prompt. Keep a small ordered checklist derived from the actual task. The task/spec governs scope; the worker-owned report records execution claims; native UI displays them.

## Choose the available display

Inspect the tools actually exposed by this session, not the model name. These are agent tools, not shell commands:

- **Claude Code Task tools:** use `TaskCreate` for the task's steps and `TaskUpdate` as they change. Give each a concise subject, useful description, and active-form wording when supported (for example, "Run verification" / "Running verification"). Retain returned task IDs. Include the report path, assignment, and stable step ID in descriptions so `TaskList`/`TaskGet` can recover the matching tasks without duplicates. Update only this run's tasks; never clear unrelated lists or adopt another worker's tasks.
- **An exposed `TodoWrite`:** maintain the same checklist with its supported fields, preserving unrelated items. Do not switch Claude to legacy tools or change configuration merely to obtain it. If a safe read/update is unavailable, use the shared/chat fallback.
- **Codex or another host with a plan-update tool (such as `update_plan`):** use it for this task's steps when actually available. Do not enter plan-only mode merely to display implementation progress, or replace a plan belonging to other work. Exact layout and whether it stays pinned belong to the host, not the skill.
- **No native task/plan tool:** save shared progress normally and provide concise Done / Now / Next / Blocked updates at transitions. Say the native checklist is unavailable once; continue the authorized work. A failed shared write separately requires the compact chat fallback, even if native UI still works.

Claude's Task tools use `pending`, `in_progress`, and `completed`. Map shared `in-progress` to the host's corresponding active state. For `blocked` or `skipped`, use a truthful label/note and leave it non-completed if the host has no equivalent; do not disguise it as successful work or delete it to make the list look finished. Parallel subagents belong under one high-level active step in their parent worker's list, not multiple unrelated current tasks.

On a resumed worker run, read/reconcile the shared report and inspect existing native tasks before updating or recreating only its matching steps. A fresh adviser may READ progress; it must not take over the coder's list or perform the saved next action. Native lists and task IDs are not cross-harness session identities.

## Save at step boundaries

After `start`, use the exchange contract's `progress` command with the returned work-item/worker/assignment and expected report digest. Keep stable step IDs as status changes. Use the returned digest for the next write. Update the small progress input with the host's file editor; do not dump transcripts or sensitive command output.

Publish when a step starts, completes, becomes blocked, or an authorized scope change revises the plan. Keep completed steps; explain any skipped step and why the task permits skipping it. Do not mark unavailable validation as completed or quietly skip a required check. Put detailed results in the final report's checks/artifact pointers, not in every checklist label.

The `progress` command is lightweight: it writes local state but does not rescan Git or run tests. It deliberately clears current Git/check fingerprints to `unknown`; earlier check entries remain historical claims. Use normal `publish` for verification evidence and a final or blocked result. Finish the checklist and publish the result before telling the user the assignment is ready. Checking the last box by itself never closes a ticket, proves tests, notifies an idle adviser, or grants commit/push permission.

Use one report per worker/run, with atomic replacement and the existing stale-digest guard. The native UI and report are not an atomic pair: acknowledge a failed update, reconcile at the next safe boundary, and never claim both were saved if either failed. Do not create another independently edited task-status Markdown file or an unbounded event log.

## Display limits

Claude's [task-list documentation](https://code.claude.com/docs/en/interactive-mode#task-list) describes the terminal status-area checklist and `Ctrl+T` visibility toggle. If tasks exist but the panel is hidden, tell the user about that toggle; do not change their keybindings. This is not `/tasks`, which shows background shells and agents.

Claude's [tool-availability documentation](https://code.claude.com/docs/en/tools-reference#task-tool-availability) explains that some model/session configurations omit the Task tools. A skill cannot call a tool the host withheld. Disclose that capability gap and leave any opt-in configuration decision to the user. Do not enable environment flags, agent teams, shared native task-list IDs, hooks, or services as part of this skill.
