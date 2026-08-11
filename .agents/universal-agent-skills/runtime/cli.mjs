#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ensureConfig,
  ensureGitignore,
  exportHandoff,
  checkpointPaths,
  installRuntime,
  loadConfig,
  readJson,
  reconcileCheckpoint,
  redactSensitive,
  resolveProjectPath,
  saveCheckpoint,
  thresholdReport,
  validateCheckpoint,
  writeJsonAtomic,
} from "./core.mjs";
import { adapterStatus, detectHosts, hostSignals, HOSTS, installAdapters, removeAdapters } from "./adapters.mjs";

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
    if (command === "checkpoint") return checkpoint(project, args, io);
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
    settingsPaths: { antigravity: args["antigravity-settings"] },
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

function checkpoint(project, args, io) {
  const { config } = ensureConfig(project);
  ensureGitignore(project, config);
  const fields = {
    objective: args.objective,
    phase: args.phase,
    decisions: args.decisions,
    completed: joinValues(args.completed, args.validation),
    pointers: args.pointers,
    risks: args.risks,
    next: args.next,
    skills: args.skills,
    status: args.status,
    refreshExisting: !args.fresh,
  };
  fields.preserveClaims = !args.fresh && ![
    fields.objective,
    fields.phase,
    fields.decisions,
    fields.completed,
    fields.pointers,
    fields.risks,
    fields.next,
    fields.skills,
    fields.status,
  ].some(Boolean);
  const saved = saveCheckpoint({ project, config, harness: args.harness || "other", event: args.event || "manual", fields });
  const output = { ok: true, path: saved.path, timestamp: saved.validation.metadata.timestamp, valid: true };
  io.write(JSON.stringify(output, null, 2));
  return output;
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
  const result = reconcileCheckpoint(project, config, args.input);
  io.write(result.report);
  if (!result.ok) io.setExitCode(2);
  return result;
}

function handoff(project, args, io) {
  const { config } = loadConfig(project);
  const result = exportHandoff({ project, config, inputPath: args.input, outputPath: args.output, destination: args.destination || "another session" });
  io.write(JSON.stringify({ ok: true, path: result.path }, null, 2));
  return result;
}

function hook(project, rawArgs, _args, io) {
  const host = rawArgs[0];
  const event = rawArgs[1];
  if (!HOSTS.includes(host)) throw new Error(`Unknown hook host: ${host}`);
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
    const result = reconcileCheckpoint(hookProject, config);
    const context = result.ok
      ? truncate(result.report, 12000)
      : `Continuity state requires reconciliation. Do not act on saved claims until Changed and Missing items are resolved.\n\n${truncate(result.report, 12000)}`;
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

function statusline(project, _args, io) {
  const input = safeStdinJson(io.readStdin());
  const context = input.context_window || input.contextWindow || {};
  const contextWindow = numberArg(context.context_window_size ?? context.contextWindowSize);
  const usedPercent = Number(context.used_percentage ?? context.usedPercentage);
  const tokens = contextWindow && Number.isFinite(usedPercent)
    ? Math.max(0, Math.round((contextWindow * usedPercent) / 100))
    : currentUsageTokens(context.current_usage ?? context.currentUsage);

  if (!contextWindow || !tokens) {
    io.write("UAS: context telemetry unavailable; use /checkpoint-work at the next phase boundary");
    return { ok: false, reached: false };
  }

  const { config } = ensureConfig(project);
  const report = thresholdReport(config, contextWindow);
  const reached = tokens >= report.effectiveTokens;
  const crossing = processThresholdCrossing({
    project,
    config,
    harness: "antigravity",
    sessionId: input.conversation_id || input.session_id || "unknown",
    reached,
  });
  const suffix = crossing.newlyCrossed
    ? ` | checkpoint + handoff saved; start a new session explicitly`
    : reached
      ? " | threshold crossed"
      : "";
  io.write(`UAS ${tokens}/${report.effectiveTokens}${suffix}`);
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

function joinValues(...values) {
  return values.filter(Boolean).join("\n\n");
}

function safeStdinJson(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max)}\n\n[Reconciliation truncated; run /resume-work for the full report.]`;
}

function printHelp(io) {
  io.write(`Universal Agent Skills runtime

Commands:
  setup --hosts <list|none> [--context-window <tokens>] [--project <path>]
  remove --hosts <list> [--project <path>]
  status [--project <path>]
  threshold --context-window <tokens>
  checkpoint [--harness <name>] [--event <name>] [checkpoint fields]
  validate [--input <path>]
  resume [--input <path>]
  handoff [--input <path>] [--output <path>] [--destination <text>]
  telemetry --harness <name> --tokens <count> --context-window <tokens>
  statusline [--project <path>]  # reads Antigravity CLI JSON from stdin

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
