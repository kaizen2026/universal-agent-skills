#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  activateWorkItem,
  buildCapsuleInjection,
  ensureConfig,
  ensureGitignore,
  exportHandoff,
  checkpointPaths,
  importLegacyCheckpointIntoCapsule,
  installRuntime,
  loadConfig,
  readJson,
  reconcileCheckpoint,
  reconcileWorkItem,
  redactSensitive,
  resolveProjectPath,
  recordContinuityDiagnostic,
  processContinuityEvent,
  saveCheckpoint,
  saveWorkItemCapsule,
  thresholdReport,
  validateCheckpoint,
  writeJsonAtomic,
} from "./core.mjs";
import { adapterStatus, detectHosts, hostSignals, HOSTS, installAdapters, removeAdapters } from "./adapters.mjs";

export { HOOK_CONTRACT } from "./core.mjs";

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const [command = "help", ...rest] = argv;
  const args = parseArgs(rest);
  const project = resolve(args.project || process.cwd());
  try {
    if (command === "help" || args.help) return printHelp(io);
    if (command === "setup") return setup(project, args, io);
    if (command === "remove") return remove(project, args, io);
    if (command === "status") return status(project, args, io);
    if (command === "threshold") return threshold(project, args, io);
    if (command === "activate") return activate(project, args, io);
    if (command === "checkpoint") return checkpoint(project, args, io);
    if (command === "import-legacy-checkpoint") return importLegacyCheckpoint(project, args, io);
    if (command === "validate") return validate(project, args, io);
    if (command === "resume") return resume(project, args, io);
    if (command === "handoff") return handoff(project, args, io);
    if (command === "hook") return hook(project, rest, args, io);
    if (command === "telemetry") return telemetry(project, args, io);
    if (command === "statusline") return statusline(project, args, io);
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.error(redactSensitive(error?.stack || error?.message || error));
    io.setExitCode(1);
    return { ok: false, error: error?.message || String(error) };
  }
}

function setup(project, args, io) {
  const detected = detectHosts(project);
  const hosts = parseHosts(args.hosts);
  if (!Object.hasOwn(args, "hosts")) {
    io.write(JSON.stringify({ ok: false, reason: "No adapters selected. Setup is opt-in.", detected }, null, 2));
    io.setExitCode(2);
    return { ok: false, detected };
  }
  if (hosts.length === 0 && String(args.hosts).toLowerCase() !== "none") {
    throw new Error("Select adapters with --hosts codex,claude,cursor,copilot,antigravity, or use --hosts none for portable setup only");
  }
  const { config } = ensureConfig(project);
  const runtimeFiles = installRuntime(project, runtimeDirectory);
  const ignored = ensureGitignore(project, config);
  const contextWindow = numberArg(args["context-window"]);
  const results = installAdapters({
    project,
    config,
    hosts,
    contextWindow,
    settingsPaths: { antigravity: args["antigravity-settings"], claude: args["claude-settings"] },
    codexOptions: {
      accountingScope: args["codex-accounting-scope"],
      prefixTokens: args["codex-prefix-tokens"] === undefined
        ? undefined
        : nonNegativeIntegerArg(args["codex-prefix-tokens"], "--codex-prefix-tokens"),
      prefixEvidence: args["codex-prefix-evidence"],
    },
  });
  const output = {
    ok: true,
    project,
    runtimeFiles,
    gitignoreAdded: ignored,
    threshold: thresholdReport(config, contextWindow),
    adapters: results,
    detected,
    signals: hostSignals(project),
  };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function remove(project, args, io) {
  const hosts = parseHosts(args.hosts);
  if (hosts.length === 0) throw new Error("Select adapters with --hosts codex,claude,cursor,copilot,antigravity");
  const results = removeAdapters({ project, hosts });
  const output = { ok: true, project, adapters: results, runtimePreserved: true };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function status(project, args, io) {
  const configResult = existsSync(resolve(project, ".agents/universal-agent-skills/config.json")) ? loadConfig(project) : { config: null };
  const adapters = adapterStatus(project);
  const suppliedWindow = numberArg(args["context-window"]);
  const storedWindows = [...new Set(adapters
    .filter((adapter) => adapter.configured)
    .map((adapter) => adapter.installedThreshold?.detectedContextWindow)
    .filter((value) => Number.isFinite(value) && value > 0))];
  const reportWindow = suppliedWindow || (storedWindows.length === 1 ? storedWindows[0] : null);
  const thresholdValue = configResult.config ? thresholdReport(configResult.config, reportWindow) : null;
  if (thresholdValue) {
    thresholdValue.source = suppliedWindow
      ? "current explicit or detected context window"
      : storedWindows.length === 1
        ? "stored setup input; current session window is unverified"
        : "configured default; current session window is unverified";
    thresholdValue.currentSessionVerified = Boolean(suppliedWindow);
    thresholdValue.sourceTag = {
      contextWindow: suppliedWindow
        ? "measured-current-session"
        : storedWindows.length === 1
          ? "configured-setup"
          : "unverified",
      policy: "configured-policy",
      confidence: suppliedWindow || storedWindows.length === 1 ? "verified-capacity" : "unverified-capacity",
    };
  }
  const output = {
    ok: true,
    project,
    config: configResult.config,
    detected: detectHosts(project),
    signals: hostSignals(project),
    threshold: thresholdValue,
    adapters,
  };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function threshold(project, args, io) {
  const { config } = loadConfig(project);
  const output = thresholdReport(config, numberArg(args["context-window"]));
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function activate(project, args, io) {
  const { config } = ensureConfig(project);
  ensureGitignore(project, config);
  const result = activateWorkItem({
    project,
    config,
    workItemId: args["work-item"],
    harness: args.harness,
    sessionId: args.session,
  });
  const output = {
    ok: true,
    workItemId: result.workItemId,
    created: result.created,
    revision: result.revision,
    binding: { harness: result.binding.harness, sessionId: result.binding.sessionId },
  };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function checkpoint(project, args, io) {
  const { config } = ensureConfig(project);
  ensureGitignore(project, config);
  const workItem = saveWorkItemCapsule({
    project,
    config,
    workItemId: args["work-item"],
    harness: args.harness,
    sessionId: args.session,
    expectedRevision: nonNegativeIntegerArg(args["expected-revision"], "--expected-revision"),
    lockTimeoutMs: args["lock-timeout-ms"] === undefined
      ? undefined
      : positiveIntegerArg(args["lock-timeout-ms"], "--lock-timeout-ms"),
    fields: {
      objective: stringArg(args.objective, "--objective"),
      successCriteria: stringArg(args["success-criteria"], "--success-criteria"),
      phase: stringArg(args.phase, "--phase"),
      decisions: stringArg(args.decisions, "--decisions"),
      validation: joinValues(stringArg(args.completed, "--completed"), stringArg(args.validation, "--validation")),
      blockers: stringArg(args.blockers, "--blockers") || stringArg(args.risks, "--risks"),
      next: stringArg(args.next, "--next"),
      pointers: stringArg(args.pointers, "--pointers"),
    },
  });
  return writeSaveWorkItemResult(workItem, io);
}

function writeSaveWorkItemResult(workItem, io) {
  if (!workItem.ok) {
    if (workItem.reason === "stale-revision" || workItem.reason === "lock-unavailable") {
      const output = {
        ok: false,
        reason: workItem.reason,
        message: workItem.message,
        workItemId: workItem.workItemId,
        baseRevision: workItem.baseRevision,
        currentRevision: workItem.currentRevision,
        proposal: workItem.proposal,
      };
      io.write(JSON.stringify(output, null, 2));
      io.setExitCode(2);
      return output;
    }
    io.write(workItem.reason);
    io.setExitCode(2);
    return workItem;
  }
  const output = {
    ok: true,
    scope: "work-item",
    workItemId: workItem.workItemId,
    resolution: workItem.resolution,
    path: workItem.paths.capsule,
    revision: workItem.revision,
  };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function importLegacyCheckpoint(project, args, io) {
  const { config } = ensureConfig(project);
  ensureGitignore(project, config);
  if (!args["work-item"]) {
    throw new Error("import-legacy-checkpoint requires an explicit --work-item; a legacy checkpoint is never imported automatically.");
  }
  const workItem = importLegacyCheckpointIntoCapsule({
    project,
    config,
    workItemId: args["work-item"],
    harness: args.harness,
    sessionId: args.session,
    inputPath: args.input,
    expectedRevision: nonNegativeIntegerArg(args["expected-revision"], "--expected-revision"),
    lockTimeoutMs: args["lock-timeout-ms"] === undefined
      ? undefined
      : positiveIntegerArg(args["lock-timeout-ms"], "--lock-timeout-ms"),
  });
  return writeSaveWorkItemResult(workItem, io);
}

function validate(project, args, io) {
  const { config } = loadConfig(project);
  const path = args.input ? resolveProjectPath(project, args.input) : resolve(project, config.stateRoot, "current.md");
  if (!existsSync(path)) throw new Error(`Checkpoint not found: ${path}`);
  const output = validateCheckpoint(readFileSync(path, "utf8"));
  io.write(JSON.stringify({ path, ...output }, null, 2));
  if (!output.valid) io.setExitCode(1);
  return output;
}

function resume(project, args, io) {
  const { config } = loadConfig(project);
  let result;
  if (args.input) {
    const legacy = reconcileCheckpoint(project, config, args.input);
    result = {
      ...legacy,
      resolution: "explicit-legacy-evidence",
      report: `# Legacy continuity evidence (explicit only)\n\nThis workspace-wide checkpoint is inactive and was not selected as a Work-Item Capsule.\n\n${legacy.report}`,
    };
  } else {
    result = reconcileWorkItem({
      project,
      config,
      workItemId: args["work-item"],
      harness: args.harness,
      sessionId: args.session,
    });
  }
  io.write(result.report);
  if (!result.ok) io.setExitCode(2);
  return result;
}

function handoff(project, args, io) {
  const { config } = loadConfig(project);
  const result = exportHandoff({
    project,
    config,
    inputPath: args.input,
    outputPath: args.output,
    destination: args.destination || "another session",
    workItemId: args["work-item"],
    harness: args.harness,
    sessionId: args.session,
  });
  io.write(JSON.stringify({ ok: true, path: result.path, workItemId: result.workItemId, revision: result.revision }, null, 2));
  return result;
}

function hook(project, rawArgs, args, io) {
  const host = rawArgs[0];
  const event = rawArgs[1];
  if (!HOSTS.includes(host)) throw new Error(`Unknown hook host: ${host}`);
  const spec = HOST_HOOK_SPECS[host];
  if (spec) {
    let input = {};
    try {
      input = parseHookInput(io.readStdin());
      return lifecycleHook(spec, project, event, input, io);
    } catch (error) {
      return degradedHook(project, host, event, error, io, input);
    }
  }
  const input = safeStdinJson(io.readStdin());
  const hookProject = project;
  const { config } = ensureConfig(hookProject);
  const normalized = String(event || input.hook_event_name || "").toLowerCase();
  if (normalized.includes("precompact") || normalized === "precompact") {
    const saved = saveCheckpoint({ project: hookProject, config, harness: host, event: "pre-compact", fields: { preserveClaims: true } });
    const observedWindow = numberArg(input.context_window_size ?? input.contextWindowSize);
    const observedTokens = numberArg(input.context_tokens ?? input.contextTokens);
    const report = thresholdReport(config, observedWindow);
    const observation = observedWindow
      ? ` Observed ${observedTokens ?? "unknown"}/${observedWindow} tokens; policy threshold ${report.effectiveTokens}.`
      : " The host did not report token telemetry for this event.";
    const message = `Continuity checkpoint saved at ${saved.path}.${observation}`;
    return writeHookOutput(host, event, message, "precompact", io);
  }
  if (normalized.includes("postcompact") || normalized === "postcompact") {
    return writeHookOutput(host, event, "Compaction completed; reconcile the saved checkpoint before continuing.", "postcompact", io);
  }
  if (normalized.includes("sessionstart") || normalized === "sessionstart") {
    const sessionId = input.session_id || input.sessionId || input.conversation_id || input.conversationId;
    const result = reconcileWorkItem({
      project: hookProject,
      config,
      workItemId: args["work-item"],
      harness: host,
      sessionId,
    });
    const context = result.workItemId
      ? `Work item ${result.workItemId} resolved by ${result.resolution}. Automatic capsule injection is not enabled by the manual runtime; run the resume command to reconcile it.`
      : `Continuity state was not activated. ${result.report}`;
    return writeHookOutput(host, event, context, "sessionstart", io);
  }
  io.write("{}");
  return {};
}

function telemetry(project, args, io) {
  const { config } = ensureConfig(project);
  const tokens = numberArg(args.tokens);
  const contextWindow = numberArg(args["context-window"]);
  if (!tokens || !contextWindow) throw new Error("telemetry requires --tokens and --context-window");
  const report = thresholdReport(config, contextWindow);
  const reached = tokens >= report.effectiveTokens;
  const crossing = processThresholdCrossing({
    project,
    config,
    harness: args.harness || "other",
    sessionId: args.session || "manual",
    reached,
  });
  const output = {
    ok: true,
    reached,
    tokens,
    threshold: report,
    checkpoint: crossing.checkpoint,
    handoff: crossing.handoff,
    newlyCrossed: crossing.newlyCrossed,
    next: reached ? "Review the automatic checkpoint or replace it with a phase-aware one, then start a new session explicitly if the host cannot compact." : "Continue until the next meaningful boundary.",
  };
  io.write(JSON.stringify(output, null, 2));
  return output;
}

function statusline(project, args, io) {
  // --harness labels the telemetry source (antigravity by default, or claude). It is a
  // plain string passed through to processThresholdCrossing so each harness tracks its
  // own threshold crossing; the token math is identical for both.
  const harness = typeof args.harness === "string" ? args.harness : "antigravity";
  const label = harness === "claude" ? "Claude" : "UAS";
  const input = safeStdinJson(io.readStdin());
  const context = input.context_window || input.contextWindow || {};
  const contextWindow = numberArg(context.context_window_size ?? context.contextWindowSize);
  const usedPercent = Number(context.used_percentage ?? context.usedPercentage);
  const tokens = contextWindow && Number.isFinite(usedPercent)
    ? Math.max(0, Math.round((contextWindow * usedPercent) / 100))
    : currentUsageTokens(context.current_usage ?? context.currentUsage);

  if (!contextWindow || !tokens) {
    io.write(`${label}: context telemetry unavailable; use /checkpoint-work at the next phase boundary`);
    return { ok: false, reached: false };
  }

  const { config } = ensureConfig(project);
  const report = thresholdReport(config, contextWindow);
  const reached = tokens >= report.effectiveTokens;
  const crossing = processThresholdCrossing({
    project,
    config,
    harness,
    sessionId: input.conversation_id || input.session_id || "unknown",
    reached,
  });
  const suffix = crossing.newlyCrossed
    ? ` | checkpoint + handoff saved; start a new session explicitly`
    : reached
      ? " | threshold crossed"
      : "";
  io.write(`${label} ${tokens}/${report.effectiveTokens}${suffix}`);
  return { ok: true, reached, tokens, threshold: report, ...crossing };
}

function processThresholdCrossing({ project, config, harness, sessionId, reached }) {
  const paths = checkpointPaths(project, config);
  const telemetryPath = join(paths.root, "telemetry.json");
  const state = readJson(telemetryPath, { schemaVersion: 1, sessions: {} });
  const key = `${harness}:${sessionId}`;
  const previous = Boolean(state.sessions[key]?.reached);
  let checkpoint = null;
  let handoff = null;

  if (reached && !previous) {
    const saved = saveCheckpoint({ project, config, harness, event: "threshold-warning", fields: { preserveClaims: true } });
    checkpoint = saved.path;
    const outputPath = join(paths.root, "handoff-current.md");
    handoff = exportHandoff({ project, config, outputPath, destination: "a fresh explicit session" }).path;
  }

  state.sessions[key] = { reached, updatedAt: new Date().toISOString() };
  const cutoff = Date.now() - config.retention.eventDays * 24 * 60 * 60 * 1000;
  const retained = Object.entries(state.sessions)
    .filter(([, value]) => Date.parse(value.updatedAt || "") >= cutoff)
    .sort(([, left], [, right]) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))
    .slice(0, config.retention.maxEvents)
    .reduce((output, [session, value]) => ({ ...output, [session]: value }), {});
  state.sessions = retained;
  writeJsonAtomic(telemetryPath, state);
  return { newlyCrossed: reached && !previous, checkpoint, handoff };
}

function currentUsageTokens(value) {
  if (!value || typeof value !== "object") return null;
  const fields = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"];
  const total = fields.reduce((sum, key) => sum + (Number(value[key]) || 0), 0);
  return total > 0 ? Math.floor(total) : null;
}

function writeHookOutput(host, event, message, phase, io) {
  let output = {};
  if (phase === "sessionstart") {
    if (host === "cursor") output = { additional_context: message };
    else if (host === "copilot") output = { additionalContext: message };
    else output = { hookSpecificOutput: { hookEventName: event || "SessionStart", additionalContext: message } };
  } else if (host === "cursor") {
    output = { user_message: message };
  } else if (host === "copilot") {
    output = {};
  } else {
    output = { systemMessage: message };
  }
  io.write(JSON.stringify(output));
  return output;
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function parseHosts(value) {
  if (!value) return [];
  if (String(value).trim().toLowerCase() === "none") return [];
  const hosts = String(value).split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  return [...new Set(hosts)];
}

function numberArg(value) {
  if (value === undefined || value === true) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

const COMPACT_TRIGGERS = new Set(["manual", "auto"]);

// Everything host-specific about the capsule lifecycle lives in one spec per host; the
// lifecycle itself (kind detection, unbound fallback, idempotent event recording,
// reconcile-and-inject, duplicate handling) is shared in lifecycleHook so the two hosts
// cannot silently drift apart again.
const HOST_HOOK_SPECS = Object.freeze({
  codex: {
    harness: "codex",
    sessionId: (input) => input.session_id,
    nativeIdentity: (input) => input.turn_id || null,
    trigger: (input) => input.trigger,
    // Codex documents turn_id and a manual|auto trigger on compaction events; anything else is malformed.
    validateCompactionInput: (input, label) => {
      if (!input.turn_id || !COMPACT_TRIGGERS.has(input.trigger)) throw new Error(`${label} input requires turn_id and a manual or auto trigger.`);
    },
    sessionStartSource: (input) => input.source,
    // A Codex session start that did not follow compaction gets a diagnostic only; nothing is injected.
    sessionStartWithoutCompaction: ({ input, io }) =>
      writeSystemMessage(io, `SessionStart source ${input.source || "unknown"} did not follow compaction; no capsule was injected.`),
  },
  claude: {
    harness: "claude",
    sessionId: (input) => input.session_id || input.sessionId || input.conversation_id || input.conversationId,
    nativeIdentity: (input) => input.turn_id || input.event_id || input.compaction_id || input.compact_id || input.uuid || input.id || null,
    trigger: (input) => input.trigger || "auto",
    validateCompactionInput: () => {},
    sessionStartSource: (input) => String(input.source || "").toLowerCase(),
    // Claude's SessionStart output is always the hookSpecificOutput shape, so a plain
    // startup/resume reports binding status as context instead of a bare system message.
    sessionStartWithoutCompaction: ({ project, config, event, sessionId, io }) => {
      const reconciliation = reconcileWorkItem({ project, config, harness: "claude", sessionId });
      // `document` is present whenever the capsule resolved and validated (drift or not);
      // a bound-but-invalid capsule has a workItemId and no document, and must say so now
      // rather than surfacing as a hard error at the next compaction.
      const context = reconciliation.document
        ? `Work item ${reconciliation.workItemId} resolved by ${reconciliation.resolution}. Automatic capsule injection is not enabled outside compaction.`
        : reconciliation.workItemId
          ? `Work item ${reconciliation.workItemId} is bound to this session but could not be reconciled: ${reconciliation.report}`
          : `Continuity state was not activated. ${reconciliation.report}`;
      return writeHookOutput("claude", event, context, "sessionstart", io);
    },
  },
});

function lifecycleHook(spec, project, event, input, io) {
  const { config } = ensureConfig(project);
  const { harness } = spec;
  const normalized = String(event || input.hook_event_name || "").toLowerCase();
  const sessionId = spec.sessionId(input);
  let kind;
  let transition;
  if (normalized.includes("precompact")) {
    spec.validateCompactionInput(input, "PreCompact");
    kind = "pre-compact";
    transition = "checkpoint-recorded";
  } else if (normalized.includes("postcompact")) {
    spec.validateCompactionInput(input, "PostCompact");
    kind = "post-compact";
    transition = "compaction-recorded";
  } else if (normalized.includes("sessionstart")) {
    if (spec.sessionStartSource(input) !== "compact") {
      return spec.sessionStartWithoutCompaction({ project, config, event, input, sessionId, io });
    }
    kind = "session-start-compact";
  } else {
    io.write("{}");
    return {};
  }
  // With no session there is nothing to bind to; keep the legacy workspace checkpoint's
  // provenance current on pre-compact (expand phase) and report rather than fail.
  const preserveLegacyProvenance = () => {
    if (kind === "pre-compact") saveCheckpoint({ project, config, harness, event: kind, fields: { preserveClaims: true } });
  };
  if (!sessionId) {
    preserveLegacyProvenance();
    return writeSystemMessage(io, "No active work item. Supply --work-item or a bound --harness and --session.");
  }
  const result = processContinuityEvent({
    project,
    config,
    harness,
    sessionId,
    kind,
    input: { ...input, turn_id: spec.nativeIdentity(input), trigger: spec.trigger(input) },
    action: kind === "session-start-compact"
      ? () => {
          const reconciliation = reconcileWorkItem({ project, config, harness, sessionId });
          if (!reconciliation.document) throw new Error(`Capsule reconciliation failed. ${reconciliation.report}`);
          const injection = buildCapsuleInjection(reconciliation.document, config.policy.capsuleBudgetTokens);
          return {
            transition: "reconciled-and-injected",
            reconciliation: reconciliation.ok ? "confirmed" : "confirmed-with-drift",
            injectedTokenEstimate: injection.estimatedTokens,
            additionalContext: injection.text,
          };
        }
      : () => ({ transition, reconciliation: "not-applicable", injectedTokenEstimate: 0 }),
  });
  if (!result.ok) {
    preserveLegacyProvenance();
    return writeSystemMessage(io, result.message || result.reason);
  }
  if (result.duplicate) return writeSystemMessage(io, `Equivalent duplicate ${event} delivery ignored for work item ${result.workItemId}.`);
  if (kind === "session-start-compact") {
    const output = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: result.additionalContext } };
    io.write(JSON.stringify(output));
    return output;
  }
  return writeSystemMessage(io, `${event} ${transition} for work item ${result.workItemId}.`);
}

function parseHookInput(text) {
  if (!text || !text.trim()) return {};
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Hook input must be a JSON object.");
  return value;
}

function degradedHook(project, harness, event, error, io, input = {}) {
  const message = `Continuity degraded; ${harness} lifecycle continues. ${redactSensitive(error?.message || error)}`;
  try {
    const { config } = ensureConfig(project);
    const sessionId = HOST_HOOK_SPECS[harness]?.sessionId(input) ?? null;
    recordContinuityDiagnostic({ project, config, harness, sessionId, event, message, input });
  } catch {
    // Hook failure must remain fail-open even when local diagnostics cannot be persisted.
  }
  io.write(JSON.stringify({ systemMessage: message }));
  return { ok: false, degraded: true, message };
}

function writeSystemMessage(io, message) {
  const output = { systemMessage: redactSensitive(message || "No active work item.") };
  io.write(JSON.stringify(output));
  return output;
}

function nonNegativeIntegerArg(value, name) {
  return integerArgAtLeast(value, name, 0);
}

function positiveIntegerArg(value, name) {
  return integerArgAtLeast(value, name, 1);
}

function integerArgAtLeast(value, name, minimum) {
  const number = /^\d+$/.test(String(value)) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < minimum) {
    const range = minimum === 0 ? "a non-negative integer" : `an integer of at least ${minimum}`;
    throw new Error(`${name} must be ${range}`);
  }
  return number;
}

function joinValues(...values) {
  return values.filter(Boolean).join("\n\n");
}

function stringArg(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} requires a text value`);
  return value;
}

function safeStdinJson(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function printHelp(io) {
  io.write(`Universal Agent Skills runtime

Commands:
  setup --hosts <list|none> [--context-window <tokens>] [--codex-accounting-scope <total|body_after_prefix>] [--codex-prefix-tokens <tokens> --codex-prefix-evidence <path>] [--project <path>] [--claude-settings <path>] [--antigravity-settings <path>]
  remove --hosts <list> [--project <path>]
  status [--project <path>]
  threshold --context-window <tokens>
  activate --work-item <id> --harness <name> --session <id>
  checkpoint --expected-revision <n> [--work-item <id> | --harness <name> --session <id>] [capsule fields]
  import-legacy-checkpoint --work-item <id> --expected-revision <n> [--input <legacy-path>] [--harness <name> --session <id>]
  validate [--input <path>]
  resume [--work-item <id> | --harness <name> --session <id> | --input <legacy-path>]
  handoff [--work-item <id> | --harness <name> --session <id> | --input <legacy-path>] [--output <path>] [--destination <text>]
  hook <codex|claude|cursor|copilot|antigravity> <Event> --project <path>  # reads the host's hook JSON from stdin
  telemetry --harness <name> --tokens <count> --context-window <tokens>
  statusline [--harness antigravity|claude] [--project <path>]  # reads status-line JSON from stdin

No adapter is installed unless setup receives an explicit --hosts list.`);
  return { ok: true };
}

function defaultIo() {
  return {
    write: (value) => process.stdout.write(`${value}\n`),
    error: (value) => process.stderr.write(`${value}\n`),
    readStdin: () => {
      try {
        return readFileSync(0, "utf8");
      } catch {
        return "";
      }
    },
    setExitCode: (value) => {
      process.exitCode = value;
    },
  };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();
