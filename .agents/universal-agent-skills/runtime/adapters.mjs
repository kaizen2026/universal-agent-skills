import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import {
  executableAvailable,
  readJson,
  removeFileIfEmptyJson,
  resolveWithin,
  thresholdReport,
  writeJsonAtomic,
  writeTextAtomic,
} from "./core.mjs";

export const HOSTS = Object.freeze(["codex", "claude", "cursor", "copilot", "antigravity"]);
const MANAGED_FRAGMENT = ".agents/universal-agent-skills/runtime/cli.mjs";

export function adapterStatePath(project) {
  return resolveWithin(project, ".agents/universal-agent-skills/adapter-state.json");
}

export function loadAdapterState(project) {
  return readJson(adapterStatePath(project), { schemaVersion: 1, hosts: {} });
}

export function saveAdapterState(project, state) {
  writeJsonAtomic(adapterStatePath(project), state);
}

export function detectHosts(project) {
  const signals = hostSignals(project);
  return Object.fromEntries(HOSTS.map((host) => [host, signals[host].commandAvailable]));
}

export function hostSignals(project) {
  return {
    codex: signal(executableAvailable("codex"), existsSync(resolveWithin(project, ".codex"))),
    claude: signal(executableAvailable("claude"), existsSync(resolveWithin(project, ".claude"))),
    cursor: signal(executableAvailable("cursor") || executableAvailable("cursor-agent"), existsSync(resolveWithin(project, ".cursor"))),
    copilot: signal(executableAvailable("copilot"), existsSync(resolveWithin(project, ".github/hooks"))),
    antigravity: signal(executableAvailable("agy") || executableAvailable("antigravity"), existsSync(resolveWithin(project, ".agents/hooks.json"))),
  };
}

function signal(commandAvailable, configPresent) {
  return {
    commandAvailable,
    configPresent,
    note: commandAvailable
      ? "Host command detected."
      : configPresent
        ? "Configuration is present, but no host command was detected; availability is unverified."
        : "No host command or configuration signal was detected.",
  };
}

export function installAdapters({ project, config, hosts, contextWindow, settingsPaths = {} }) {
  for (const host of hosts) {
    if (!HOSTS.includes(host)) throw new Error(`Unknown host: ${host}`);
  }
  const state = loadAdapterState(project);
  for (const host of hosts) {
    if (!state.hosts[host]?.configuredAt && managedConfigurationPresent(project, host, settingsPaths)) {
      throw new Error(`Managed ${host} configuration exists but reversal state is missing. Configuration was preserved; recover or remove it manually before setup.`);
    }
  }
  const results = [];
  for (const host of hosts) {
    const hostState = state.hosts[host] || { createdFiles: [], configuredAt: null };
    const result = INSTALLERS[host]({ project, config, contextWindow, state: hostState, settingsPaths });
    hostState.configuredAt = new Date().toISOString();
    hostState.configured = result.configured;
    hostState.threshold = result.threshold;
    state.hosts[host] = hostState;
    results.push(result);
    saveAdapterState(project, state);
  }
  if (hosts.length === 0) saveAdapterState(project, state);
  return results;
}

export function removeAdapters({ project, hosts }) {
  for (const host of hosts) {
    if (!HOSTS.includes(host)) throw new Error(`Unknown host: ${host}`);
  }
  const state = loadAdapterState(project);
  const results = [];
  for (const host of hosts) {
    if (!state.hosts[host]?.configuredAt) {
      results.push({ host, removed: false, limitation: "No reversal state was found; possible configuration was preserved for manual recovery." });
      continue;
    }
    results.push(REMOVERS[host]({ project, state: state.hosts[host] }));
    delete state.hosts[host];
    saveAdapterState(project, state);
  }
  if (hosts.length === 0) saveAdapterState(project, state);
  return results;
}

export function adapterStatus(project) {
  const signals = hostSignals(project);
  const state = loadAdapterState(project);
  return HOSTS.map((host) => {
    const hostState = state.hosts[host] || {};
    const attempted = Boolean(hostState.configuredAt);
    const recorded = Boolean(attempted && hostState.configured !== false);
    const configured = recorded && adapterConfigurationVerified(project, host, hostState);
    const configurationDrift = recorded && !configured;
    const status = configured
      ? "Configured"
      : attempted || configurationDrift || signals[host].configPresent
        ? "Detected with limitations"
        : signals[host].commandAvailable
          ? "Available but not configured"
          : "Not detected";
    return {
      host,
      status,
      detected: signals[host].commandAvailable,
      configPresent: signals[host].configPresent,
      detectionNote: configurationDrift ? "Managed adapter state and current configuration differ." : signals[host].note,
      configured,
      configurationDrift,
      installedThreshold: hostState.threshold || null,
      capability: CAPABILITIES[host],
    };
  });
}

function managedConfigurationPresent(project, host, settingsPaths = {}) {
  if (host === "codex") {
    return fileContains(resolveWithin(project, ".codex/config.toml"), "# universal-agent-skills")
      || fileContains(resolveWithin(project, ".codex/hooks.json"), MANAGED_FRAGMENT);
  }
  if (host === "claude") return fileContains(resolveWithin(project, ".claude/settings.local.json"), MANAGED_FRAGMENT);
  if (host === "cursor") return fileContains(resolveWithin(project, ".cursor/hooks.json"), MANAGED_FRAGMENT);
  if (host === "copilot") return fileContains(resolveWithin(project, ".github/hooks/universal-agent-skills.json"), MANAGED_FRAGMENT);
  if (host === "antigravity") {
    const settingsCandidate = settingsPaths.antigravity || process.env.UAS_ANTIGRAVITY_SETTINGS;
    const settingsPath = settingsCandidate ? resolve(project, settingsCandidate) : resolve(homedir(), ".gemini/antigravity-cli/settings.json");
    return fileContains(settingsPath, MANAGED_FRAGMENT)
      || fileContains(resolveWithin(project, ".agents/universal-agent-skills/adapters/antigravity.json"), MANAGED_FRAGMENT);
  }
  return false;
}

function adapterConfigurationVerified(project, host, state) {
  try {
    if (host === "codex") {
      const configPath = resolveWithin(project, ".codex/config.toml");
      const hooksPath = resolveWithin(project, ".codex/hooks.json");
      return fileContains(configPath, "# universal-agent-skills") && fileContains(hooksPath, MANAGED_FRAGMENT);
    }
    if (host === "claude") {
      const settings = readJson(resolveWithin(project, ".claude/settings.local.json"), {});
      return settings.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW === state.managedWindow
        && JSON.stringify(settings.hooks || {}).includes(MANAGED_FRAGMENT);
    }
    if (host === "cursor") return fileContains(resolveWithin(project, ".cursor/hooks.json"), MANAGED_FRAGMENT);
    if (host === "copilot") return fileContains(resolveWithin(project, ".github/hooks/universal-agent-skills.json"), MANAGED_FRAGMENT);
    if (host === "antigravity") {
      if (!state.antigravitySettingsPath || !state.managedStatusLine) return false;
      const settings = readJson(state.antigravitySettingsPath, {});
      return JSON.stringify(settings.statusLine) === state.managedStatusLine;
    }
  } catch {
    return false;
  }
  return false;
}

function fileContains(path, fragment) {
  return existsSync(path) && readFileSync(path, "utf8").includes(fragment);
}

const CAPABILITIES = Object.freeze({
  codex: "threshold-controlled compaction with PreCompact, PostCompact, and SessionStart hooks",
  claude: "host-controlled compaction with a 155k calculation window and pre/post/session hooks",
  cursor: "native-threshold preCompact checkpointing; sessionStart applies only to a new composer and is unavailable in cloud",
  copilot: "CLI/cloud preCompact checkpointing plus session-start reconciliation; cloud state is ephemeral and VS Code uses a separate Preview schema",
  antigravity: "CLI status-line telemetry warning plus checkpoint/handoff; IDE continuity remains manual and a new session is explicit",
});

function installCodex({ project, config, contextWindow, state }) {
  const report = thresholdReport(config, contextWindow);
  const configPath = resolveWithin(project, ".codex/config.toml");
  const hooksPath = resolveWithin(project, ".codex/hooks.json");
  rememberCreated(state, project, configPath);
  rememberCreated(state, project, hooksPath);
  mergeCodexThreshold(configPath, report.effectiveTokens, state);
  const hooks = readJson(hooksPath, { description: "Project lifecycle hooks.", hooks: {} });
  hooks.hooks ||= {};
  upsertNested(hooks.hooks, "PreCompact", "manual|auto", commandHandler(project, "codex", "PreCompact"));
  upsertNested(hooks.hooks, "PostCompact", "manual|auto", commandHandler(project, "codex", "PostCompact"));
  upsertNested(hooks.hooks, "SessionStart", "startup|resume|clear|compact", commandHandler(project, "codex", "SessionStart"));
  writeJsonAtomic(hooksPath, hooks);
  return result("codex", [configPath, hooksPath], report, "Review and trust project hooks with /hooks; untrusted project config is skipped.");
}

function installClaude({ project, config, contextWindow, state }) {
  const detectedWindow = Number(contextWindow) > 0 ? Number(contextWindow) : null;
  const report = thresholdReport(config, detectedWindow);
  const path = resolveWithin(project, ".claude/settings.local.json");
  rememberCreated(state, project, path);
  const settings = readJson(path, {});
  settings.env ||= {};
  state.claudeEnv ||= {};
  captureEnv(settings.env, state.claudeEnv, "CLAUDE_CODE_AUTO_COMPACT_WINDOW");
  const calculationWindow = detectedWindow && detectedWindow < 200000
    ? Math.max(100000, Math.floor(detectedWindow))
    : 155000;
  settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(calculationWindow);
  state.managedWindow = String(calculationWindow);

  if (detectedWindow && detectedWindow < 200000) {
    captureEnv(settings.env, state.claudeEnv, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE");
    settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = "75";
    state.managedPercent = "75";
  } else if (state.managedPercent && settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === state.managedPercent) {
    restoreEnv(settings.env, state.claudeEnv, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE");
    delete state.managedPercent;
  }
  settings.hooks ||= {};
  upsertNested(settings.hooks, "PreCompact", "manual|auto", claudeHandler("PreCompact"));
  upsertNested(settings.hooks, "PostCompact", "manual|auto", claudeHandler("PostCompact"));
  upsertNested(settings.hooks, "SessionStart", "startup|resume|clear|compact", claudeHandler("SessionStart"));
  writeJsonAtomic(path, settings);
  return result("claude", [path], report, "The 155k calculation window is an upper bound, not an exact consumed-token trigger; actual timing remains Claude-controlled.");
}

function installCursor({ project, config, contextWindow, state }) {
  const report = thresholdReport(config, contextWindow);
  const path = resolveWithin(project, ".cursor/hooks.json");
  rememberCreated(state, project, path);
  const settings = readJson(path, { version: 1, hooks: {} });
  settings.version ||= 1;
  settings.hooks ||= {};
  upsertFlat(settings.hooks, "preCompact", cursorCommand("preCompact"));
  upsertFlat(settings.hooks, "sessionStart", cursorCommand("sessionStart"));
  writeJsonAtomic(path, settings);
  return result("cursor", [path], report, "Cursor's native compaction threshold is not overridden; preCompact token telemetry determines the effective report.");
}

function installCopilot({ project, config, contextWindow, state }) {
  const report = thresholdReport(config, contextWindow);
  const path = resolveWithin(project, ".github/hooks/universal-agent-skills.json");
  rememberCreated(state, project, path);
  const settings = readJson(path, { version: 1, hooks: {} });
  settings.version ||= 1;
  settings.hooks ||= {};
  upsertFlat(settings.hooks, "preCompact", copilotCommand("preCompact", "manual|auto"));
  upsertFlat(settings.hooks, "sessionStart", copilotCommand("sessionStart"));
  writeJsonAtomic(path, settings);
  return result("copilot", [path], report, "Cloud jobs load repository hooks, but their filesystem is ephemeral; persist team truth in tracked artifacts.");
}

function installAntigravity({ project, config, contextWindow, state, settingsPaths }) {
  const report = thresholdReport(config, contextWindow);
  const helperPath = resolveWithin(project, ".agents/universal-agent-skills/adapters/antigravity.json");
  const settingsOverride = settingsPaths.antigravity || process.env.UAS_ANTIGRAVITY_SETTINGS;
  const settingsPath = settingsOverride
    ? resolve(project, settingsOverride)
    : resolve(homedir(), ".gemini/antigravity-cli/settings.json");
  rememberCreated(state, project, helperPath);
  rememberCreated(state, project, settingsPath);
  const managed = {
    type: "command",
    command: antigravityCommand(project),
    enabled: true,
    stack_with_default: true,
  };
  const settings = readJson(settingsPath, {});
  const alreadyManaged = state.managedStatusLine && JSON.stringify(settings.statusLine) === state.managedStatusLine;
  const conflict = settings.statusLine && !alreadyManaged;

  if (!conflict) {
    state.antigravitySettingsPath = settingsPath;
    state.antigravityStatusLine ||= { existed: false };
    settings.statusLine = managed;
    state.managedStatusLine = JSON.stringify(managed);
    writeJsonAtomic(settingsPath, settings);
  }

  writeJsonAtomic(helperPath, {
    schemaVersion: 1,
    mode: conflict ? "manual-compose-required" : "cli-status-line",
    effectiveThresholdTokens: report.effectiveTokens,
    settingsPath,
    statusLine: managed,
    limitation: conflict
      ? "An existing custom statusLine was preserved. Compose the displayed command with it manually to enable telemetry."
      : "CLI telemetry is configured. Antigravity IDE has no documented equivalent telemetry or compaction hook.",
  });
  return result(
    "antigravity",
    conflict ? [helperPath] : [helperPath, settingsPath],
    report,
    conflict
      ? "Existing custom statusLine preserved; telemetry requires manual composition. IDE continuity and starting another session remain explicit."
      : "CLI status-line telemetry checkpoints and exports a handoff once per threshold crossing. IDE continuity and starting another session remain explicit.",
    !conflict,
  );
}

function removeCodex({ project, state }) {
  const configPath = resolveWithin(project, ".codex/config.toml");
  const hooksPath = resolveWithin(project, ".codex/hooks.json");
  if (existsSync(configPath)) removeCodexThreshold(project, configPath, state);
  cleanJsonHooks(hooksPath, state, project);
  return { host: "codex", removed: true };
}

function removeClaude({ project, state }) {
  const path = resolveWithin(project, ".claude/settings.local.json");
  if (!existsSync(path)) return { host: "claude", removed: false };
  const settings = readJson(path, {});
  cleanHooksObject(settings.hooks);
  if (settings.env && settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW === state.managedWindow) {
    restoreEnv(settings.env, state.claudeEnv, "CLAUDE_CODE_AUTO_COMPACT_WINDOW");
  }
  if (settings.env && settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === state.managedPercent) {
    restoreEnv(settings.env, state.claudeEnv, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE");
  }
  if (settings.env && Object.keys(settings.env).length === 0) delete settings.env;
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeJsonAtomic(path, settings);
  removeFileIfEmptyJson(path, wasCreated(state, project, path));
  return { host: "claude", removed: true };
}

function removeCursor({ project, state }) {
  const path = resolveWithin(project, ".cursor/hooks.json");
  cleanJsonHooks(path, state, project);
  return { host: "cursor", removed: true };
}

function removeCopilot({ project, state }) {
  const path = resolveWithin(project, ".github/hooks/universal-agent-skills.json");
  cleanJsonHooks(path, state, project);
  return { host: "copilot", removed: true };
}

function removeAntigravity({ project, state }) {
  const helperPath = resolveWithin(project, ".agents/universal-agent-skills/adapters/antigravity.json");
  const settingsPath = state.antigravitySettingsPath;
  if (settingsPath && existsSync(settingsPath)) {
    const settings = readJson(settingsPath, {});
    if (state.managedStatusLine && JSON.stringify(settings.statusLine) === state.managedStatusLine) {
      if (state.antigravityStatusLine?.existed) settings.statusLine = state.antigravityStatusLine.value;
      else delete settings.statusLine;
      writeJsonAtomic(settingsPath, settings);
      removeFileIfEmptyJson(settingsPath, wasCreated(state, project, settingsPath));
    }
  }
  if (existsSync(helperPath) && wasCreated(state, project, helperPath)) unlinkSync(helperPath);
  return { host: "antigravity", removed: true };
}

const INSTALLERS = { codex: installCodex, claude: installClaude, cursor: installCursor, copilot: installCopilot, antigravity: installAntigravity };
const REMOVERS = { codex: removeCodex, claude: removeClaude, cursor: removeCursor, copilot: removeCopilot, antigravity: removeAntigravity };

function mergeCodexThreshold(path, threshold, state) {
  let source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const firstTable = source.search(/^\s*\[/m);
  const rootEnd = firstTable < 0 ? source.length : firstTable;
  const root = source.slice(0, rootEnd);
  const rest = source.slice(rootEnd);
  const pattern = /^\s*model_auto_compact_token_limit\s*=.*$/m;
  const managedLine = `model_auto_compact_token_limit = ${threshold} # universal-agent-skills`;
  if (pattern.test(root)) {
    const prior = root.match(pattern)[0];
    if (!state.codexThreshold) state.codexThreshold = { action: "replaced", previousLine: prior };
    source = root.replace(pattern, managedLine) + rest;
  } else {
    if (!state.codexThreshold) state.codexThreshold = { action: "added" };
    const insertion = `# universal-agent-skills managed auto-compaction threshold${eol}${managedLine}${eol}`;
    source = `${root}${root && !root.endsWith(eol) ? eol : ""}${insertion}${rest}`;
  }
  writeTextAtomic(path, source);
  state.managedThreshold = threshold;
}

function removeCodexThreshold(project, path, state) {
  let source = readFileSync(path, "utf8");
  const managed = /^model_auto_compact_token_limit\s*=\s*\d+\s*# universal-agent-skills\s*$/m;
  if (!managed.test(source)) return;
  if (state.codexThreshold?.action === "replaced" && state.codexThreshold.previousLine) {
    source = source.replace(managed, state.codexThreshold.previousLine);
  } else {
    source = source.replace(/^# universal-agent-skills managed auto-compaction threshold\r?\n/m, "").replace(managed, "");
    source = source.replace(/^\s*\r?\n/, "");
  }
  if (source.trim() === "" && wasCreated(state, project, path)) unlinkSync(path);
  else writeTextAtomic(path, source);
}

function commandHandler(_project, host, event) {
  const posix = `root=$(git rev-parse --show-toplevel) || exit $?; node "$root/${MANAGED_FRAGMENT}" hook ${host} ${event} --project "$root"`;
  const powerShell = `$root = (git rev-parse --show-toplevel).Trim()\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n& node (Join-Path $root '${MANAGED_FRAGMENT}') hook ${host} ${event} --project $root\nexit $LASTEXITCODE`;
  const encodedPowerShell = Buffer.from(powerShell, "utf16le").toString("base64");
  return {
    type: "command",
    command: posix,
    commandWindows: `powershell -NoProfile -NonInteractive -EncodedCommand ${encodedPowerShell}`,
    timeout: 30,
  };
}

function claudeHandler(event) {
  return {
    type: "command",
    command: "node",
    args: [`${"${CLAUDE_PROJECT_DIR}"}/${MANAGED_FRAGMENT}`, "hook", "claude", event, "--project", "${CLAUDE_PROJECT_DIR}"],
    timeout: 30,
  };
}

function cursorCommand(event) {
  return { command: `node "${MANAGED_FRAGMENT}" hook cursor ${event} --project .`, timeout: 30 };
}

function copilotCommand(event, matcher) {
  const item = {
    type: "command",
    command: `node "${MANAGED_FRAGMENT}" hook copilot ${event} --project .`,
    cwd: ".",
    timeoutSec: 30,
  };
  if (matcher) item.matcher = matcher;
  return item;
}

function upsertNested(hooks, event, matcher, handler) {
  hooks[event] ||= [];
  if (hooks[event].some((group) => JSON.stringify(group).includes(MANAGED_FRAGMENT))) return;
  hooks[event].push({ matcher, hooks: [handler] });
}

function upsertFlat(hooks, event, item) {
  hooks[event] ||= [];
  if (!hooks[event].some((entry) => JSON.stringify(entry).includes(MANAGED_FRAGMENT))) hooks[event].push(item);
}

function cleanJsonHooks(path, state, project) {
  if (!existsSync(path)) return;
  const value = readJson(path, {});
  cleanHooksObject(value.hooks);
  if (value.hooks && Object.keys(value.hooks).length === 0) delete value.hooks;
  writeJsonAtomic(path, value);
  removeFileIfEmptyJson(path, wasCreated(state, project, path));
}

function cleanHooksObject(hooks) {
  if (!hooks || typeof hooks !== "object") return;
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const cleaned = [];
    for (const entry of entries) {
      if (Array.isArray(entry?.hooks)) {
        const handlers = entry.hooks.filter((handler) => !JSON.stringify(handler).includes(MANAGED_FRAGMENT));
        if (handlers.length > 0) cleaned.push({ ...entry, hooks: handlers });
      } else if (!JSON.stringify(entry).includes(MANAGED_FRAGMENT)) {
        cleaned.push(entry);
      }
    }
    if (cleaned.length > 0) hooks[event] = cleaned;
    else delete hooks[event];
  }
}

function rememberCreated(state, project, path) {
  const rel = relative(project, path).replaceAll("\\", "/");
  state.createdFiles ||= [];
  if (!existsSync(path) && !state.createdFiles.includes(rel)) state.createdFiles.push(rel);
}

function captureEnv(env, state, key) {
  if (Object.hasOwn(state, key)) return;
  state[key] = Object.hasOwn(env, key) ? { existed: true, value: env[key] } : { existed: false };
}

function restoreEnv(env, state, key) {
  const previous = state?.[key];
  if (previous?.existed) env[key] = previous.value;
  else delete env[key];
}

function wasCreated(state, project, path) {
  const rel = relative(project, path).replaceAll("\\", "/");
  return Array.isArray(state.createdFiles) && state.createdFiles.includes(rel);
}

function antigravityCommand(project) {
  const runtime = resolveWithin(project, MANAGED_FRAGMENT).replaceAll("\\", "/");
  const root = resolve(project).replaceAll("\\", "/");
  const quote = process.platform === "win32" ? quotePowerShell : quotePosix;
  return `node ${quote(runtime)} statusline --project ${quote(root)}`;
}

function quotePosix(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function result(host, paths, threshold, limitation, configured = true) {
  return {
    host,
    status: configured ? "Configured" : "Detected with limitations",
    configured,
    files: paths.map((path) => path.replaceAll("\\", "/")),
    threshold,
    limitation,
  };
}
