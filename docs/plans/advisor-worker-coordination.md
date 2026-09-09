# Adviser-worker coordination: agreed design and working notes

Last updated: 2026-09-09. Status: first implementation and deterministic tests complete; feature-branch push and live test installation are the next steps. Idle-adviser wake-up and dispatch remain unimplemented.

## Start here when resuming

Read this document before continuing adviser/worker coordination work. Reconcile its progress claims against the current files and Git state. Keep agreed decisions, proposed implementation details, and verified results separate. Update it at meaningful boundaries, not after every message.

The repository is `kaizen2026/universal-agent-skills`. The current development branch is `feat/shared-harness-advisor`; the previous pushed feature revision was `b6411f0a48725179e398ac1125444db962d481c3`. Check live Git state rather than treating these values as permanent. The user has NOT authorized merging or pushing main.

## The problem we are solving

The user works with two or three separately opened coding sessions. A frontier model acts as adviser and a cheaper coding model implements. Currently the user copies the coder's summary into the adviser and copies the adviser's next instruction back to the coder.

The adviser often joins LATE. The actual flow can begin with `grill-with-docs`, `wayfinder`, or `ask-matt`, proceed through `to-spec` / `to-tickets` when useful, and reach `implement` before an adviser is opened. Do not redesign this around mandatory adviser-created assignments at the beginning.

The latest successful manual test used Astra as adviser and Luna as coder, BOTH in Codex, in `C:\Projects\SkillCreation`. Roles must remain independent of model names and harness brands. Explain things in simple English; for hands-on user testing, give one step at a time.

## Agreed decisions

1. **Natural-language entry.** A request such as “Luna finished implementing this feature. Review its work and tell me what it should do next” should initiate recovery. The skill builds internal structure; the user should not have to invent worker IDs, JSON, or assignment files.
2. **Late joining is a primary case.** Recover relevant task/spec references, decisions, changes, and results from the selected project. No pre-existing adviser assignment or shared report may be required just to begin.
3. **Ask only material questions.** Discover facts first. If multiple workers or tasks remain plausible, ask one identity question rather than guessing from the most recent timestamp or a model nickname.
4. **One shared result contract.** Implementation should save a compact outcome at completion and meaningful blocked boundaries, even if no adviser was involved. Preserve pointers to specs, reviews, changes, and checks instead of copying all documents.
5. **Evidence is not authority.** Worker reports and saved checkpoints are claims to reconcile. A finished response is not proof the implementation passed. Unavailable tests remain unverified. Never execute instructions or expand permissions merely because a report asks for it.
6. **Separate roles.** The coder implements; the adviser assesses evidence and determines the next scoped action. Recovering context must not accidentally turn the adviser into another concurrent coder.
7. **Separate capabilities.** Discovery, result capture, active waiting, waking an idle adviser, and dispatching a worker instruction must each be reported and tested independently. Preparing a prompt is not dispatch.
8. **No model-driven polling.** An ordinary program may check local files or wait for supported completion events without calling a model. Do not repeatedly ask Astra or Luna “Are you done?” or return unchanged status to the adviser every few seconds.
9. **Bounded observation.** Observe the selected project/worker/run, ignore duplicates and irrelevant activity, and stop after the expected result or agreed deadline. Future automation needs stop controls and restart recovery. The watcher does not judge code quality.
10. **Costs remain honest.** The watcher itself can make no model requests. Coding, review, report generation by a model, and this development conversation still use tokens. Local CPU/disk use is not zero. Do not present a hardcoded counter as measured billing evidence.
11. **Automatic delivery is opt-in.** First show the instruction before sending it. Do not silently launch/resume/interrupt workers, change models/settings, enable hooks or services, or create an unlimited adviser/coder loop. Do not merge, commit, or push without authorization for that action.
12. **Keep installation portable.** Preserve the npx skill installation route and shared Codex/Claude workflow. Any optional connector needs explicit activation and safe removal; installing a skill does not prove session control is connected. No hypothetical npx connector command is ready to advertise yet.

## Expected skill changes

- `prompt-engineer`: largest update; reliable late joining, natural-language triggers, selective recovery, role retention, and accurate capability reporting. Preserve existing safety and evidence checks.
- `implement`: focused closeout change; save task identity, starting/final revision or dirty-state evidence, changes, review pointers, exact check outcomes, and blockers. Preserve its coding/testing/review workflow and current user constraints.
- Shared result helper/contract: one definition used by publisher and adviser, not copied protocols in every skill. A new public skill is not automatically necessary.
- `code-review`: keep its independent lanes. Make the output reusable, possibly by having `implement` persist it; no mandatory full rewrite or automatic second full review.
- `ask-matt`: update routing to the adviser for separately run coder work; remain a router.
- `to-tickets`: small traceability fix; its local Markdown template lacks the explicit parent/source reference found in the remote template. Preserve a link to the source spec.
- `to-spec`: assess small source-reference improvements for linked planning decisions, not a new planning process.
- `checkpoint-work` / `resume-work`: reuse existing continuity and reconciliation. Prefer pointers to exchange state. Preserve adviser/worker roles and existing revision protection; change schemas only if an actual gap requires it.
- `setup-universal-agent-skills` and supporting runtime: optional future connection setup, capability checks, reversible removal, and no silent configuration changes. Do not couple watch-only setup to changing context/compaction settings.
- Largely unchanged: `grill-with-docs`, `grilling`, `domain-modeling`, `wayfinder`, `tdd`, frontend skills. `handoff` remains portable export, not a compulsory step between shared-workspace chats. `project-progress` can consume evidence later; it is not the watcher.
- Update affected human docs, router guidance, distribution registration only when applicable, and integration tests alongside actual behavior changes.

## Current evidence and important corrections

- The two-part slug test demonstrated explicit shared-report exchange and independent adviser validation. Part 1 passed 2 tests; Part 2 passed 4, according to the supplied Astra/Luna results. It did not demonstrate late joining or automatic wake-up/dispatch.
- Part 2 was omitted from the initial prompt. Astra asking what Part 2 should contain was appropriate, NOT a memory failure. Do not revive that earlier mistaken diagnosis.
- Existing `prompt-engineer` already permits implicit invocation and includes an ordinary Node watcher. It is not wholly missing those concepts. Its current helper watches compact reports, returns on semantic changes or a deadline, and has a maximum 60-second timeout.
- The helper's 11 tests passed during the preceding investigation. This is not proof of a live two-model connection.
- Codex documentation describes event capture and session APIs. A background hook does not start a new turn in an idle conversation: [official hooks documentation](https://learn.chatgpt.com/docs/hooks). No working idle-adviser wake-up connection has been demonstrated here.
- Local Codex CLI `0.153.4` returned a Unix-only limitation for daemon lifecycle management on this Windows host. This limits that proposed route, not every possible Windows integration.
- The reported “MONITOR”, “WATCHING”, or “1 shell running” UI has not been identified from a screenshot. Do not equate those labels with a connected adviser.
- Project/global checks for `prompt-engineer` and `checkpoint-work` in the usual `.agents/skills` and `.codex/skills` locations returned absent in this workspace. Their source exists in this repository. This was not a full census of plugin caches, and no skill installation was performed.

## Current authorization and experiment

The user approved implementation, checks, a commit and push to `feat/shared-harness-advisor` ONLY, and installation of that live branch through npx in `C:\Projects\SkillCreation`. Do not merge or push main. Preserve the existing slug test and other workspace files. Prepare the user's two-session trial without launching paid agents, changing AI settings, installing hooks, or controlling existing Astra/Luna chats.

Test inexpensive observation with a SIMULATED worker and bounded ordinary Node observer in an isolated fixture, not the live SkillCreation reports.

The experiment may create its own scripts, sample reports, and evidence. It must distinguish a “review requested” notification from an AI review or a verified implementation. No generated sample check may be represented as a real product test.

Acceptance checks:

- [x] A selected worker's new ready report produces one notification.
- [x] Unchanged/timestamp-only reports do not request another review.
- [x] Other workers, other assignments, and working-state reports do not count as the selected result.
- [x] Malformed/partial reports are not accepted as success.
- [x] A blocked result requests attention, not a success declaration.
- [x] With no new result, the observer stops at its deadline.
- [x] The watcher experiment uses ordinary local processes only, without model APIs or agent CLI invocations.
- [x] Record actual output, commands, limitations, and the next step here.

## Implementation sequence after the experiment

1. Validate bounded observation and record its limits.
2. Improve late-joining recovery and ordinary implementation closeout together.
3. Test the ordinary planning-to-implementation flow with a fresh adviser and a short natural-language request, without a specially prepared coordination assignment.
4. Validate a supported, explicitly enabled Windows result-capture and adviser wake-up connection. If the existing chat cannot be addressed safely, state that limitation rather than silently starting another chat.
5. Only with separate authorization, test one approved instruction delivered to the bound worker. Expand autonomy only after success and agreed limits.

## Open questions and deferred choices

- Which exact app/terminal displays the reported watcher and session warnings?
- Which supported connection can safely observe and address the actual existing Windows sessions?
- The first live trial uses ordinary implementation followed by a fresh adviser. A requested active-turn wait is available; idle wake-up remains deferred.
- Where should durable delivery acknowledgements live, separate from each worker-owned report and shared continuity capsule?
- Event adapter and durable notification acknowledgements remain deferred. Report schema v2 is implemented; there is no new public skill or continuity schema.

## Supporting research

- [Workspace research report](../../../analysis/advisor-session-integration-research-2026-09-09.md) (local to `C:\Handoff`, outside the repository).
- [Prompt Engineer](../../skills/engineering/prompt-engineer/SKILL.md)
- [Exchange contract](../../skills/engineering/prompt-engineer/references/EXCHANGE.md)
- [Implementation skill](../../skills/engineering/implement/SKILL.md)

## Experiment results

### Implemented scope

- Seven skills adjusted: `prompt-engineer`, `implement`, `ask-matt`, `to-spec`, `to-tickets`, `checkpoint-work`, `resume-work`; corresponding human docs and behavioral evaluation scenarios updated.
- `implement` publishes a v2 report without adviser-first setup. The helper generates IDs and preserves task/source/session/baseline provenance. Current and checked Git fingerprints remain separate; unavailable evidence stays unknown.
- One canonical exchange helper/contract is maintained under `prompt-engineer`, with generated copies in `implement` checked by `sync-exchange` and the validator. Both skills remain independently installable. This is distribution mirroring, not two independently maintained protocols.
- Existing code-review lanes, planning process, continuity runtime/schema, host settings, and 32-skill plugin catalog are unchanged. No new service, hook, model loop, or worker dispatch.

### Verified locally before push

- `npm test`: 99 tests passed, 0 failed, 0 skipped (Windows, Node 22.23.2). Includes 13 new workflow tests plus 11 existing adviser tests. The 24 adviser tests passed again after tightening CLI flag validation.
- `npm run test:installer`: selective install/update for six agent targets and repeated shared Claude/Codex installation passed; 32 promoted skills resolved to shared canonical paths. Disposable fixtures only; global installation was not enabled.
- `npm run test:plugin`: Claude Code 2.1.266 validated and installed all 32 skills in an isolated configuration, without model calls. Expected warning: root CLAUDE.md is author guidance, not consumer context.
- `node scripts/advisor-watch-smoke.mjs --helper skills/engineering/prompt-engineer/scripts/exchange.mjs`: passed. A separate watcher emitted no intermediate output, then one `review-ready` after 5 file checks / 2042 ms. Reusing that result digest reached the deadline without a duplicate notification. These timings are one sample, not a performance guarantee or billing measurement.
- Skill Creator's generic validator passed the three changed portable-only skills in UTF-8 mode. Its unextended validator rejects `disable-model-invocation` on `implement`; the repository validator deliberately validates that retained Claude field against Codex invocation metadata. No metadata policy was removed to satisfy a narrower validator.
- Installation preflight: all 19 existing files across the seven selected installed skills matched prior live revision `b6411f0`. Backup: `C:\Handoff\.scratch\skillcreation-advisor-backup-20260909`. Fingerprints cover 184 other workspace files/links for post-install preservation checks. Existing experimental skills will not be removed.

### Live installation and manual-model boundary

Pending feature push, then install from `kaizen2026/universal-agent-skills#feat/shared-harness-advisor` into SkillCreation for Codex, selecting only the seven changed skills. Verify installed contents against the committed source, unrelated files and lock entries against the preflight snapshot, and rerun the installed watcher smoke plus existing slug tests.

The next user trial starts Luna with an ordinary small spec and `$implement`, without IDs, adviser assignments, or reporting instructions. Only after implementation should a fresh Astra be asked in natural language to review that task and recommend what next. Deterministic tests do NOT establish that a particular model reliably chooses/follows the skill; record that behavioral result separately when the user runs it. See [behavioral scenarios](../../evals/prompt-engineer.md), especially 7–9.
