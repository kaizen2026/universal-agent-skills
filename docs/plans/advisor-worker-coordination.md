# Adviser-worker coordination: agreed design and working notes

Last updated: 2026-09-09. Status: the authorized five-minute follow-up is pushed and installed; local suite and delayed installed-helper checks passed. The user-run five-minute watcher delivered a new Luna report to active Astra after about three minutes, followed by review with a command approval. This establishes active-wait delivery, not fully unattended review or zero-token waiting. The earlier 60-second trial remains an expiry. GitHub CI was last checked as blocked before execution by an account billing lock. Idle-adviser wake-up and dispatch remain unimplemented.

Latest implementation: the native/shared checklist changes were committed as `49dc7364bd4e9efdcd7ad6b210f7ba374e5a9978`, pushed to the feature branch, and installed in SkillCreation through npx. The user subsequently reported successful testing and explicitly approved promotion to main. The tested feature tip `f828513878f48528b3d38b590d1ce9b78d4f4efc` is now integrated into local main with its full history preserved. All 110 automated tests, isolated Claude plugin installation, and cross-harness installation checks passed again before integration. Exact Codex UI parity remains optional; portable saved progress is required. No new test trace was supplied, so user acceptance does not establish identical native rendering in every harness or a session-control capability. No UI/settings change or session control was added. The last observed GitHub CI attempts could not start because of the account billing lock.

## Start here when resuming

Read this document before continuing adviser/worker coordination work. Reconcile its progress claims against the current files and Git state. Keep agreed decisions, proposed implementation details, and verified results separate. Update it at meaningful boundaries, not after every message.

The repository is `kaizen2026/universal-agent-skills`. The tested development branch is `feat/shared-harness-advisor`; its accepted tip is `f828513878f48528b3d38b590d1ce9b78d4f4efc`. The user has now explicitly authorized integrating and pushing these tested changes to main, superseding the earlier test-branch-only restriction for this promotion. Check live Git state rather than treating these values as permanent. This approval does not authorize unrelated changes, releases/tags, session control, or settings changes.

## The problem we are solving

The user works with two or three separately opened coding sessions. A frontier model acts as adviser and a cheaper coding model implements. Currently the user copies the coder's summary into the adviser and copies the adviser's next instruction back to the coder.

The adviser often joins LATE. The actual flow can begin with `grill-with-docs`, `wayfinder`, or `ask-matt`, proceed through `to-spec` / `to-tickets` when useful, and reach `implement` before an adviser is opened. Do not redesign this around mandatory adviser-created assignments at the beginning.

The latest detailed manual-test trace used Astra as adviser and Luna as coder, BOTH in Codex, in `C:\Projects\SkillCreation`. The later checklist acceptance did not include a trace or specify the harness. Roles must remain independent of model names and harness brands. Explain things in simple English; for hands-on user testing, give one step at a time.

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
- Existing `prompt-engineer` already permitted implicit invocation and included an ordinary Node watcher before this work. It was not wholly missing those concepts. Its initial helper watched compact reports, returned on semantic changes or a deadline, and had a maximum 60-second timeout. The authorized follow-up below extends that limit to five minutes.
- The helper's 11 tests passed during the preceding investigation. This is not proof of a live two-model connection.
- Codex documentation describes event capture and session APIs. A background hook does not start a new turn in an idle conversation: [official hooks documentation](https://learn.chatgpt.com/docs/hooks). No working idle-adviser wake-up connection has been demonstrated here.
- Local Codex CLI `0.153.4` returned a Unix-only limitation for daemon lifecycle management on this Windows host. This limits that proposed route, not every possible Windows integration.
- The reported “MONITOR”, “WATCHING”, or “1 shell running” UI has not been identified from a screenshot. Do not equate those labels with a connected adviser.
- Project/global checks for `prompt-engineer` and `checkpoint-work` in the usual `.agents/skills` and `.codex/skills` locations returned absent in this workspace. Their source exists in this repository. This was not a full census of plugin caches, and no skill installation was performed.

## Current authorization and experiment

The user previously approved test-branch implementation, checks, publication, and the selected-skill npx update in `C:\Projects\SkillCreation`; those steps are complete and recorded below. After testing the installed update, the user explicitly asked to proceed to main. Integrate and push the accepted test-branch history, record their acceptance and fresh checks, and preserve the test branch. Do not force-push, create a release/tag, change AI settings, launch paid agents, or control existing chats. This promotion does not reinstall SkillCreation or change its files, reports, or installer branch selection. Asking whether automatic rechecking is possible does not authorize unlimited repeats or an idle-session connector.

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
- Event adapter and durable notification acknowledgements remain deferred. The test workspace now has helpers supporting v1/v2/v3 reports; its existing reports were preserved without migration. New structured progress explicitly uses v3. There is no new public skill or continuity schema.

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

Implementation commit `8589a0af636311b2078071880a77806118562314` was pushed to `feat/shared-harness-advisor`. Remote main remained `89fe9cdc0388fd46278ae16956fe498303e7e95d`.

Executed in `C:\Projects\SkillCreation`:

```powershell
npx.cmd --yes skills@latest add "kaizen2026/universal-agent-skills#feat/shared-harness-advisor" --agent codex --skill prompt-engineer implement ask-matt to-spec to-tickets checkpoint-work resume-work --yes
```

The CLI cloned the live branch and updated only those seven skills. All 21 installed files matched source (normalizing line endings), all 184 protected files/links and unrelated lock entries remained unchanged. Existing Claude junctions still point to the shared canonical skill directories; no second installation or settings change was made.

Both installed helper copies passed `advisor-watch-smoke.mjs`: each emitted one `review-ready` after 5 local checks (~2 seconds), and suppressed the duplicate until deadline. The original `sandbox/slug-test/slugify.test.mjs` independently passed all 4 tests. Smoke fixtures were temporary and removed; no simulated result was left in the real test project's report directory.

GitHub CI did not run: [run 34333339566](https://github.com/kaizen2026/universal-agent-skills/actions/runs/34333339566) failed before any job steps, with the annotation “The job was not started because your account is locked due to a billing issue.” Local checks passed, but this is not remote Windows/Ubuntu CI acceptance. Do not change billing/account settings or repeatedly rerun jobs without user direction.

After preservation checks, added only a new trial spec (`docs/specs/advisor-trial-labels.md`) and local ticket (`.scratch/advisor-late-join/issues/01-format-label.md`) in SkillCreation. No formatter code, coordination assignment, or result report was pre-created. Existing slug files, skill settings, and prior reports were preserved.

The user trial started Luna with an ordinary small spec and `$implement`, without IDs, adviser assignments, or reporting instructions. After implementation, the user was asked to open fresh Astra and request advice in natural language. Deterministic tests do NOT establish that a particular model reliably chooses/follows the skill; the observed behavioral result is recorded separately below. See [behavioral scenarios](../../evals/prompt-engineer.md), especially 7–9.

### User-run late-joining trial: observed result

- The user supplied Luna's completion: formatter and tests created, 7 combined tests passed, Standards and Spec reviews found no issues, and no commit/push/dependency installation/AI-setting change was reported. The supplied trace showed two Luna review subagents; one could not run its own test because its shell setup failed. This is AI review work, not the deterministic watcher. Luna's final report separately records successful test commands.
- At initial review, directly inspected the v2 result at `C:\Projects\SkillCreation\.agents\state\coordination\task-68093017cccac495\worker-b53eab74.json`. It identifies assignment `run-8bb88691-3f0`, the local ticket/spec, two changed files, 3 formatter tests plus 4 existing slug tests, and reusable review findings. State was `ready-for-review`; actual session identity remains `unknown` rather than guessed.
- The user was instructed to open fresh Astra in the same workspace and give only a natural-language task/adviser request, without the summary or report path. The supplied Astra reply accepted the implementation against the spec, distinguished Luna's reported tests from its own assessment, and proposed a narrowly scoped ticket/report closeout prompt. This supports successful late-joining advice in this trial, not a guarantee across models or tasks. The supplied final reply alone does not prove exactly which skill was invoked; a tool trace would establish that separately.
- Astra did not claim to have independently rerun the tests. It said the tested fingerprint matched current files. This development session also ran the installed helper's read-only snapshot and confirmed the same fingerprint (`2550590e5ea08aae8f8181594e46ed6aaafd1ffa4b920d5970f1d6f0e90d3a4c`). This confirms consistency, not a new test execution; do not relabel reported tests as independently rerun.
- After the user sent Astra's closeout instruction to Luna, directly confirmed all four ticket criteria are checked, a dated resolution cites the test evidence, and `Status` is `closed`. The same worker report now says `complete` with timestamp `2026-09-09T09:37:44.848Z`. It correctly describes the tests as earlier evidence and leaves `checkedTreeDigest` unknown rather than claiming new checks during paperwork. No implementation/settings changes or commits/pushes were reported. This development session only inspected the artifacts; it did not close the ticket or control either chat.
- This trial does not establish live watcher delivery, idle wake-up, automatic prompt dispatch, or measured token savings. The deterministic watcher tests above remain separate evidence. No new commit/push is implied by receiving trial results; this milestone note is a local update until publication is authorized.

### First user-run active-wait test

Keep the same Astra and Luna sessions in SkillCreation. Astra should first read the CURRENT completed report as its baseline (not the older ready-for-review digest), then start one bounded 60-second `watch-result` for that worker/assignment. Once the watcher is actually waiting, the user can ask Luna for a fresh verification of the existing formatter/slug tests and closed ticket, updating its existing report without product changes. This is a follow-up verification on the selected task, not a new implementation assignment.

The acceptance criterion was a changed result reaching the active watcher and Astra assessing it without another user message or pasted summary. An old completion read immediately, an ordinary on-demand review, or a timestamp-only rewrite does not establish this result. A deadline is normal bounded expiry, not implementation failure; do not rearm automatically. This test still cannot establish waking an idle chat or automatically sending a worker prompt.

Observed outcome:

- The user says they started Luna after Astra began the Node command. Astra's supplied trace shows the correct selected work item, worker, assignment, and baseline report digest `84eab7e7d2aa6b7f9b88ef4a2d8303d9242afa1de191501f715ac12c9c5353d4`. Read and watch commands each required user approval in that session.
- Astra ran one `watch-result` and received `deadline-reached` after 60002 ms. It did not rearm, claim receipt of the fresh result, or change files. This demonstrates bounded expiry, NOT successful live notification/review.
- Luna's supplied trace shows fresh Node test executions (3 formatter and 4 slug tests, exit code 0), confirmation of the closed ticket, then report publication using the same baseline digest. Direct inspection confirms a new complete report with `updatedAt: 2026-09-09T09:45:30.900Z`, new summary/check evidence, and digest `0d21098551c1d1dddb91842824bebbc01e421fb388353d39ab08ac5b119211d7`.
- As a read-only diagnostic, this development session called the installed watcher with the exact selection and old baseline digest but a 1-second limit. It immediately returned `review-ready` after one file check / 2 ms. The helper recognizes this new report; this replay does not demonstrate historical delivery to Astra or wake its ended conversation.
- Most likely the report was published after Astra's 60-second window. The supplied Astra trace lacks absolute start/end timestamps, so the relative timing cannot be proved from these artifacts alone. Do not describe the original trial as passed or assert an exact publication delay.
- The next proposed improvement was a five-minute bounded wait with explicit timing evidence. The user subsequently approved five minutes; implementation and checks are recorded below. The original installed version still rejected timeouts above 60 seconds at the time of this trial.

### Authorized five-minute follow-up

- Both helper watch commands now default to, and are capped at, 300 seconds; explicit shorter waits remain supported. `watch-result` still checks the selected local report every 500 ms inside one process, emits no intermediate status, ignores duplicate/irrelevant results, and stops after a selected finished result or deadline. No model request, scheduler, hook, automatic rearm, worker dispatch, or AI-settings change was added.
- Selected-result output now includes `startedAt`, `deadlineAt`, `finishedAt`, `timeoutSeconds`, and elapsed time. A result also includes `reportUpdatedAt`. These make a future timing investigation possible; a publisher timestamp is still untrusted metadata, not proof of review quality or synchronized clocks.
- Prompt Engineer, its generated Implement helper/contract, Ask Matt routing, human docs, and behavioral evaluations now explain the five-minute bound. When the host yields a running-process handle, retain that same process rather than launching another watcher. Do not promise zero total tokens: the host may require model/tool continuation even though the file-checking process makes no model requests.
- Automatic rechecking has two meanings. During the five-minute window, the local program already repeats the file checks. After the deadline, this version stops. Longer or repeated observation is technically possible in an ordinary program but needs a separately agreed overall duration/stop policy. A model-driven rearm involves the adviser again; an idle chat requires a supported opt-in wake-up connection. Official Codex background hooks wait for the next user turn when no turn is active; hook completion does not itself start a new one.
- `npm test`: 100 passed, 0 failed, 0 skipped; catalog, versions, and generated mirrors also passed. Focused adviser tests: 25 passed. Skill Creator's UTF-8 validator passed Prompt Engineer; existing explicit-invocation policies were retained.
- Source helper smoke with a separate publisher delayed by 65 seconds passed: one `review-ready`, 129 file checks, 65297 ms elapsed, default timeout 300 seconds. Watch start `2026-09-09T09:55:48.301Z`, deadline `2026-09-09T10:00:48.301Z`, report timestamp `2026-09-09T09:56:53.325Z`, finish `2026-09-09T09:56:53.598Z`. The child watcher emitted no output before publication, and a duplicate digest subsequently expired without another notification.
- These checks prove ordinary-process delivery beyond the old 60-second limit, not a full five-minute wall-clock expiry, live Astra delivery, idle wake-up, or measured token savings. Short-expiry and timeout-bound tests cover deadline behavior separately. Publication, protected installation, and installed-helper results follow below.
- Installation preflight passed: all 12 files in the three affected installed skills (`prompt-engineer`, `implement`, `ask-matt`) match the prior live branch revision `b9a1c30`; no local edits will be overwritten. Recoverable backup: `C:\Handoff\.scratch\skillcreation-five-minute-backup-20260909`. Fingerprints cover 199 other files/links, including the completed user trial and reports. Other installed skills and unrelated lock entries are outside this update.

### Five-minute publication and installed checks

- Implementation commit `09c6380d1ed33ab040de4c9f653da7873a709821` was pushed to `feat/shared-harness-advisor`. Remote main remained `89fe9cdc0388fd46278ae16956fe498303e7e95d`.
- The live branch was installed through npx in SkillCreation, selecting only `prompt-engineer`, `implement`, and `ask-matt` for Codex. All 12 installed files match source, all 199 protected files/links are unchanged, and unrelated lock entries are preserved. Existing shared Claude links were not changed. No project implementation, ticket, report, dependency, AI settings, or Git history was modified in SkillCreation.
- The INSTALLED Prompt Engineer helper passed the separate-publisher test with a 65-second delay: one `review-ready`, 129 file checks, 65380 ms elapsed, and a 300-second default. Start `2026-09-09T10:01:37.240Z`, deadline `2026-09-09T10:06:37.240Z`, report timestamp `2026-09-09T10:02:42.262Z`, finish `2026-09-09T10:02:42.621Z`. No intermediate watcher output; duplicate notification suppressed on the follow-up bounded check.
- The installed Implement helper also passed the smoke test (one notification, 5 checks / 2042 ms, same 300-second default). This development session independently reran the existing formatter and slug tests: 7 passed, 0 failed. Simulated reports lived only in disposable fixtures, which were removed; no new AI review or model session was launched.
- [GitHub CI run 34337950658](https://github.com/kaizen2026/universal-agent-skills/actions/runs/34337950658) again could not start either Windows or Ubuntu job because of the account billing lock. Do not label local checks as remote CI success; no billing changes or manual CI retries were made.
- The subsequent user-run test had Astra reload the updated Prompt Engineer instructions, read the CURRENT friendly-label report as baseline, and run one five-minute selected-result wait. Only after it was actually waiting, the user was told to ask the same Luna session (no clear/new session) to rerun the existing verification and publish a substantive fresh result. Its observed outcome follows below.

### User-run five-minute active-wait test: delivery observed

- The supplied Astra trace shows it reading the installed Prompt Engineer skill and exchange contract, then selecting work item `task-68093017cccac495`, worker `worker-b53eab74`, assignment `run-8bb88691-3f0`, and current baseline digest `0d21098551c1d1dddb91842824bebbc01e421fb388353d39ab08ac5b119211d7`.
- One watcher returned `review-ready` with `elapsedMs: 179974` (about three minutes). Astra said it retained the same watcher, which stopped on delivery. The trace then continued into report/snapshot/ticket/code inspection and advice, with no intervening user request to review and no pasted worker summary. This is the first observed live active-adviser delivery, distinct from the separate-process smoke tests.
- Command approval was still requested for the post-notification read/inspection. Therefore the result demonstrates automatic detection and review continuation WITH approval, not completely hands-free review. The trace also contains a `Permissions updated to Full Access` notice. This development session did not change permissions; the notice does not establish that future commands need no approval, nor authorize changing any settings.
- Astra produced two progress messages while the original watcher was waiting. These are adviser output, not the Node helper emitting repeated report results. The file-checking process makes no model requests, but this host run was not a zero-token wait. No usage/billing measurement was supplied, so the amount of overhead and savings remain unknown. Do not equate sparse host continuation with repeatedly asking the worker for status or starting another watcher.
- A read-only inspection by this development session confirms a changed `complete` report: timestamp `2026-09-09T10:16:47.780Z`, digest `62272cff42e76cf3e7c74611f8959250200d0f2a48fb498a3f652ff50e76a299`. It records fresh formatter and slug command run windows, 3 and 4 passing tests respectively, exit codes 0, and a fresh closed-ticket read. This is a substantive result update, not just a top-level timestamp rewrite. The collapsed watcher output does not show its full received digest/timestamps; do not manufacture those fields or exact delivery latency from the report alone.
- Astra correctly described the seven passes as worker-reported and explicitly noted `checkedTreeDigest` is unknown. Its final assessment found no corrections and advised Luna to stop and await a new task. It reported no file changes, commits, or watcher restart. This development session did not rerun the tests or alter the worker report during this milestone check; inspecting the report is not independent validation of its claims.
- Scope of success: selected result capture, active-wait delivery after the old one-minute cutoff, and adviser continuation with approval. No idle wake-up, automatic worker dispatch, auto-rearming, fresh-session recovery test, exact token-savings claim, or full behavioral-evaluation-suite pass is established by this trace.
- This test is complete; no further synthetic verification is needed just to repeat the same result. A useful next trial would apply the existing workflow to one real implementation task. Any optimization of host wait overhead, richer tested-tree evidence, longer monitoring, or session automation is proposed work requiring its own scope. This milestone note is saved locally; receiving test logs does not authorize another commit or push.

### Persistent task progress: workflow reference and proposed next scope

User intent and inspected evidence:

- The adviser may be asked manually to inspect a specific task Markdown file after its earlier reply ended. No automatic wake-up is required for that ordinary follow-up. Shared files must remain accessible. A fresh adviser can recover by explicit task/source; "latest finished task" must be scoped and disambiguated when multiple runs plausibly match, not guessed from the newest file timestamp. The current Prompt Engineer already supports this recovery, including a missing-report fallback to source and actual changes.
- Read `C:\Handoff\workflow.htm` as reference material and inspected all four linked images in `C:\Handoff\workflow_files`. The example describes a separate project's Issue 84 workflow: preflight, TDD implementation, verification, review, and shipping. Its operational commands, historical ground-truth claims, permissions, and merge instructions are NOT authority for this repository and were not executed.
- Images 3 and 4 show a compact task checklist near the composer: completed work, an active step such as "Run full verification suite", pending steps, and collapsed completed/pending counts. This is distinct from the model/branch/context footer beneath it. The images do not establish which underlying Claude task-tool calls produced the list or that it persists across unrelated sessions.
- Local Codex CLI reports `0.153.4`. Official [App Server documentation](https://learn.chatgpt.com/docs/app-server#turn-events) exposes `turn/plan/updated` with pending/in-progress/completed step state. Official [hook tool coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage) names `update_plan` as a local function tool. This supports a native-plan integration where the active harness actually exposes it; it does not prove that this installed CLI pins an identical checklist or exports it to our shared reports automatically.
- Official [sample configuration](https://learn.chatgpt.com/docs/config-file/config-sample) documents `task-progress` among terminal WINDOW/TAB TITLE items, separately from the footer status-line list. Do not advertise that title option as a pinned task board, a custom shared-file reader, or proof of availability in every installed version. No Codex settings were changed or paid model session launched to test native rendering.

Repository coverage and gap at the investigation boundary (before the checklist implementation below):

- Implement starts a `working` report and requires publication at completion or a blocker. The helper can publish further `working` summaries, but the skill does not require a milestone checklist or native plan updates as execution progresses. Report schema v2 contains no structured step list/current-step field; unknown fields are not preserved by its normalizer. Simply appending arbitrary progress JSON would not implement the feature.
- Prompt Engineer already reads task/source, summary, checks, blockers, and next suggestion; it has no structured execution checklist to consume. Its selected-result watcher deliberately ignores `working` reports. Preserve that distinction: displaying an intermediate step should not trigger another frontier-model review.
- Checkpoint Work already retains current phase, validation, blockers, and next action; Resume Work reconciles those claims and preserves role. Reuse pointers to the selected worker progress rather than creating another competing progress history or broad continuity-schema migration.
- Project Progress already provides a user-invoked evidence-based project HTML dashboard. It is a project overview, not the screenshot's continuously visible per-run checklist or an installed auto-refresh service. It could consume compact worker progress later, without being regenerated by a model at every step.

Design proposed during that investigation, subsequently approved by the user's Claude-first clarification:

1. Extend the existing worker-owned exchange record/contract with a small bounded execution plan: stable step identity, concise label, step state, current/next action, blockers, last-reported time, and evidence pointers where meaningful. Keep the task/spec as the scope authority and the progress record as execution claims. Any readable Markdown or visual view should be derived from that one record, not a second independently edited truth. Preserve per-worker/run ownership, safe replacement, stale-digest checks, redaction, and backward compatibility.
2. Have Implement derive an appropriately sized checklist from the actual authorized task, update it at meaningful step transitions, and reflect the same state through the host's native planning/task tool when available. Do not invent unavailable tools or force every trivial change into a large plan. Never import commit/push/merge steps from the example unless the actual task authorizes them. Mark unavailable checks as unverified and blocked work as blocked, not completed.
3. Have Prompt Engineer explain what was last reported done, what is in progress, what is next, and what needs attention. Distinguish last-reported progress from independently observed session liveness and verified completion. Keep review-on-result behavior separate from human progress display and manual on-demand reads.
4. Make only focused Checkpoint/Resume pointer-and-recovery adjustments; synchronize Ask Matt routing and human docs. Code Review's independent lanes need no mandatory redesign. Project Progress consumption is optional later. No new public skill or rewritten planning chain is presently justified.
5. Start with portable saved progress plus the available native checklist. Exact permanently pinned Codex placement remains unverified and cannot be promised by SKILL.md alone. If that placement is essential and the host cannot provide it, a read-only side panel or local view is a separate explicitly scoped UI option; do not silently build a custom client, hooks, or service.
6. Keep updates inexpensive: publish on step changes, not a timer or every shell command. Deterministic display/file refresh can avoid AI calls; the worker's plan updates and adviser reads/reviews still use tokens. A small bounded transition history may be useful later, but raw transcripts and unbounded append logs are not required.

Acceptance to establish before claiming full delivery: an ordinary implementation produces matching native/shared progress; intermediate `working` updates do not wake the result-review loop; a specified task can be recovered in a fresh adviser without pasted summaries; ambiguous "latest" requests are not guessed; interrupted/blocked work is not shown as done; old reports remain readable; unrelated workers and task instructions remain untouched. A source-code test alone cannot establish the installed host's pinned visual behavior. The original investigation changed notes only; the subsequently approved implementation follows.

### Authorized native/shared task-progress implementation

Scope and capability decisions:

- The user clarified that `workflow.htm` shows Claude Code CLI, not Codex. They want normal skill invocation to produce the checklist without the special steering document. Claude's native display is the priority; exact Codex placement is optional. The shared worker report must still work across harnesses.
- Official [Claude interactive-mode documentation](https://code.claude.com/docs/en/interactive-mode#task-list) describes the task checklist and `Ctrl+T` visibility toggle. This differs from `/tasks`, which lists background work. The screenshot alone does not prove which line of the example prompt caused task-tool use; explicitly requiring available task tools removes that accidental dependency.
- Official [Claude tool-availability documentation](https://code.claude.com/docs/en/tools-reference#task-tool-availability) says some model/session configurations omit Task tools. Check the tools actually exposed, not the model name. The skill cannot guarantee a native panel when the host withholds its tools. Do not enable flags, change model settings, or install hooks just to obtain it. A user-approved configuration change, if desired later, is a separate action.

Implemented locally:

- `implement` derives a concise, appropriately sized execution checklist from the actual authorized task. It uses Claude `TaskCreate`/`TaskUpdate` when exposed, a supported `TodoWrite` or native plan-update tool where applicable, and otherwise shared progress plus concise Done / Now / Next / Blocked chat updates. It does not import shipping permission from the example document. Native task IDs are returned by the host, not invented or treated as cross-session identities.
- The new bundled `TASK-PROGRESS.md` covers tool selection, matching a resumed worker's own native tasks to report/assignment/step markers, preserving unrelated tasks, truthful blocked/skipped mapping, and separate handling of native and shared-write failures.
- The canonical exchange helper/contract remains under `prompt-engineer`, with generated Implement mirrors. New `progress` writes only the selected existing worker/run, preserves ownership and stale-digest/atomic-write protections, and stores 1–20 stable steps. At most one high-level step is active; blocked/skipped steps require reasons. Existing step IDs cannot silently disappear, and unfinished steps prevent a finished report.
- Structured progress explicitly upgrades the selected v2 report to v3. Old v1/v2 reports retain their read/digest behavior. Both the worker and adviser helpers must be updated before exchanging v3 reports; an older helper is not forward-compatible. No bulk report migration or continuity-schema change was performed.
- Milestone updates do not run Git, tests, timers, or model calls. They clear current Git/check fingerprints to `unknown`, preserving earlier check entries only as historical claims. Final `publish` retains fresh snapshot behavior. Updating the last checkbox alone does not complete the report or request a review. Intermediate `working` changes remain ignored by `watch-result`; blocked work requests attention, not a success declaration.
- `prompt-engineer` can read last-reported Done / Now / Next / Blocked on demand, including after its previous reply ended, without editing the worker's checklist or claiming session liveness. `checkpoint-work` stores pointers; `resume-work` reconciles those pointers and preserves roles; `ask-matt` routes implementation and separate-worker status appropriately. No redesign of `code-review`, planning skills, or Project Progress was needed.
- Corresponding human docs, README, behavioral evaluation scenarios, a patch changeset, regression tests, and an installed-helper smoke test were updated. The catalog stays at 32 skills. No new public skill, second editable progress document, unbounded log, custom dashboard, model polling loop, automatic rearm, idle wake-up, or worker dispatch was added.

Verification and remaining boundary:

- `npm test`: 110 passed, 0 failed, 0 skipped on Windows/Node 22.23.2. Catalog validation, version checks, and generated mirrors passed. Ten new regression tests cover progress recovery, result-notification separation, blocked/resumed work, invalid/oversized data, retained step IDs, stale/concurrent writes, redaction/provenance, legacy compatibility, independent workers, and the installed helper without Git available.
- `npm run test:plugin`: Claude Code 2.1.266 validated and installed all 32 skills in an isolated configuration. The installed Implement task-progress instructions matched source; its v3 progress exchange smoke passed. No model call or user configuration mutation was involved. Expected authoring warning: root CLAUDE.md is repository guidance, not consumer context.
- `npm run test:installer`: selective installation/update passed for six agent targets; all 32 promoted skills retained shared canonical paths across repeated Claude/Codex installation in disposable fixtures. This is not an update to the user's SkillCreation installation.
- Skill Creator's UTF-8 generic validator passed Prompt Engineer, Checkpoint Work, and Resume Work. The repository validator covers the retained explicit-invocation metadata on Implement and Ask Matt; no policy was removed to satisfy a narrower validator.
- Automated tests establish saved-progress and packaging behavior, not that a particular model follows every instruction or that its host pins the checklist. The next live trial should use ordinary `/implement` on one authorized small task, confirm exposed native task-tool calls/display and matching saved progress, then let a fresh adviser recover it by task reference. If Claude has tasks but hides the panel, `Ctrl+T` is its documented toggle; if tools are absent, the fallback is expected.
- At the end of the implementation turn, the checklist update remained local and uncommitted on `feat/shared-harness-advisor`. No push, merge, main change, SkillCreation report/ticket/code change, AI-settings change, paid agent invocation, or live-chat control was performed for it. The user subsequently authorized publication and selected-skill installation, recorded below. The earlier GitHub account billing lock remains unresolved; local checks are not remote CI acceptance.

### Checklist publication and SkillCreation update

- The user explicitly approved committing/pushing to the test branch and updating SkillCreation. Preflight confirmed local HEAD and the live test branch were both `5b22f8ae92f9aece09e44bc0ec5b814a538cbb15`; remote main was `89fe9cdc0388fd46278ae16956fe498303e7e95d` and is outside this operation.
- All 17 existing files across `implement`, `prompt-engineer`, `ask-matt`, `checkpoint-work`, and `resume-work` matched that prior revision, so no local skill edits were overwritten. A recoverable backup of those skills and the installer lock was created at `C:\Handoff\.scratch\skillcreation-task-progress-backup-20260909`. Fingerprints protect 194 other project files/links, including existing task reports and test artifacts.
- Implementation commit `49dc7364bd4e9efdcd7ad6b210f7ba374e5a9978` was pushed to `feat/shared-harness-advisor`. Remote main remained `89fe9cdc0388fd46278ae16956fe498303e7e95d`; no merge, main push, or force push was performed.
- Executed the following from `C:\Projects\SkillCreation`, cloning the live feature branch rather than copying the local source tree:

  ```powershell
  npx.cmd --yes skills@latest add "kaizen2026/universal-agent-skills#feat/shared-harness-advisor" --agent codex --skill implement prompt-engineer ask-matt checkpoint-work resume-work --yes
  ```

- The five selected skills now contain 18 files, all matching source after line-ending normalization. All 194 protected files/links and unrelated installer-lock entries remain unchanged. Claude's five existing junctions still target the same canonical `.agents/skills` directories, so its standalone skill files are updated too. No second Claude installation, global update, settings change, project dependency installation, or Git-history change in SkillCreation was performed.
- Ran `scripts/task-progress-smoke.mjs` against BOTH installed helper paths. Each passed v3 checklist recovery, suppression of intermediate working updates, one finished-result notification, duplicate suppression, task discovery, and unrelated-worker preservation. All simulated reports lived in disposable fixtures, which were cleaned up; neither helper changed the live task report or controlled a chat/model/native task UI.
- Independently reran `node --test sandbox/advisor-trial/format-label.test.mjs sandbox/slug-test/slugify.test.mjs` in SkillCreation: 7 passed, 0 failed. This verification was not republished into Luna's worker-owned report. The 110-test repository suite and isolated plugin/installer checks had already passed against the unchanged implementation before publication; skill catalog and generated exchange checks passed again before the commit.
- [GitHub CI run 34342847697](https://github.com/kaizen2026/universal-agent-skills/actions/runs/34342847697) could not start either Ubuntu or Windows job: the annotations cite the account billing lock. No account changes or manual reruns were attempted. This limitation does not invalidate the observed local tests, but remote CI has not accepted the commit.
- At this installation boundary, the remaining user trial was ordinary implementation and adviser recovery. The user subsequently reported successful testing and approved main promotion, recorded below. Native rendering across all configurations, implicit adviser invocation, idle wake-up, and dispatch remain separate evidence boundaries; do not automatically clear or interrupt existing sessions.

### User acceptance and mainline promotion

- On 2026-09-09, the user said they had tried/tested the update and asked to proceed to main. This is direct user acceptance and authorization to promote the tested branch. No new logs or screenshots accompanied that report; do not invent specific tool calls, model/harness identity, test counts, or session automation from it.
- Before integration, fetched origin and confirmed a clean worktree, the accepted local/remote feature tip `f828513878f48528b3d38b590d1ce9b78d4f4efc`, and local/remote main at `89fe9cdc0388fd46278ae16956fe498303e7e95d`. Main had no unique commits relative to the tested branch. GitHub reports main as the default branch and not protected; no protection settings were changed or bypassed.
- Reran `npm test`: 110 passed, 0 failed, 0 skipped (99386 ms), including catalog, version, and generated-mirror checks. Reran `npm run test:plugin`: all 32 skills installed in an isolated Claude Code 2.1.266 configuration and installed v3 progress checks passed without model calls. Reran `npm run test:installer`: selective installation/update passed across six targets and repeated Claude/Codex shared paths. These checks exercised the unchanged accepted feature tip, not live AI sessions.
- Fast-forwarded local main to the accepted feature tip, preserving all seven tested development commits without conflict resolution, squash, rebase, or force. This acceptance record is the only additional mainline change and accompanies the authorized main push. Verify the remote main SHA after pushing; the branch name alone is not proof of publication.
- SkillCreation was not reinstalled or modified for this promotion; its installed skills already contain the accepted implementation, and its installer lock still selects the test branch. The feature branch and recoverable installation backups are retained. No release workflow, tag, package-version bump, paid model invocation, hook, or AI-settings change was requested or performed.
- Once remote publication is verified, the ordinary main/default-branch npx installation route includes the accepted changes without the feature-branch suffix. Previous GitHub CI attempts were blocked before execution by the account billing lock; inspect the new main push separately and do not label local success as remote CI acceptance.
