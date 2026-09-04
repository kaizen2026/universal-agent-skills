import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import {
  executableAvailable,
  HOOK_CONTRACT,
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

export function installAdapters({ project, config, hosts, contextWindow, settingsPaths = {}, codexOptions = {} }) {
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
    const result = INSTALLERS[host]({ project, config, contextWindow, state: hostState, settingsPaths, codexOptions });
    hostState.adapterVersion = 2;
    hostState.hookContract = HOOK_CONTRACT;
    hostState.ownership = "universal-agent-skills";
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
      thresholdSource: hostState.threshold?.contextCapacitySource || "unverified",
      thresholdConfidence: hostState.threshold?.contextWindowVerified ? "verified" : "unverified",
      duplicateOwnership: managedHookDiagnostics(project, host),
      compatibility: {
        adapterVersion: hostState.adapterVersion || 1,
        hookContract: hostState.hookContract || "legacy-v1",
      },
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
      const source = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
      const hooks = readJson(hooksPath, {});
      return source.includes(`model_auto_compact_token_limit = ${state.managedThreshold} # universal-agent-skills`)
        && (!state.managedScope || source.includes(`model_auto_compact_token_limit_scope = "${state.managedScope}" # universal-agent-skills`))
        && (!state.managedCodexHooks || codexHooksVerified(hooks.hooks, state.managedCodexHooks));
    }
    if (host === "claude") {
      const settings = readJson(resolveWithin(project, ".claude/settings.local.json"), {});
      const windowVerified = !state.managedWindow || settings.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW === state.managedWindow;
      const percentVerified = !state.managedPercent || settings.env?.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === state.managedPercent;
      return windowVerified
        && percentVerified
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
  claude: "host-controlled compaction with an explicitly reported model window, independent trigger policy, and pre/post/session hooks",
  cursor: "native-threshold preCompact checkpointing; sessionStart applies only to a new composer and is unavailable in cloud",
  copilot: "CLI/cloud preCompact checkpointing plus session-start reconciliation; cloud state is ephemeral and VS Code uses a separate Preview schema",
  antigravity: "CLI status-line telemetry warning plus checkpoint/handoff; IDE continuity remains manual and a new session is explicit",
});

function installCodex({ project, config, contextWindow, state, codexOptions = {} }) {
  const configPath = resolveWithin(project, ".codex/config.toml");
  const hooksPath = resolveWithin(project, ".codex/hooks.json");
  const report = resolveCodexPolicy(project, configPath, config, contextWindow, codexOptions);
  rememberCreated(state, project, configPath);
  rememberCreated(state, project, hooksPath);
  mergeCodexThreshold(configPath, report.installedTokenLimit, state);
  mergeCodexScope(configPath, report.accountingScope, state);
  const hooks = readJson(hooksPath, { description: "Project lifecycle hooks.", hooks: {} });
  hooks.hooks ||= {};
  const managedHooks = {
    PreCompact: { matcher: "manual|auto", handler: commandHandler(project, "codex", "PreCompact") },
    PostCompact: { matcher: "manual|auto", handler: commandHandler(project, "codex", "PostCompact") },
    SessionStart: { matcher: "startup|resume|clear|compact", handler: commandHandler(project, "codex", "SessionStart", config.policy.capsuleBudgetTokens) },
  };
  for (const [event, managed] of Object.entries(managedHooks)) {
    upsertManagedNested(hooks.hooks, event, managed.matcher, managed.handler);
  }
  state.managedCodexHooks = managedHooks;
  writeJsonAtomic(hooksPath, hooks);
  return result("codex", [configPath, hooksPath], report, "Review and trust project hooks with /hooks; untrusted project config is skipped.");
}

function installClaude({ project, config, contextWindow, state, settingsPaths = {} }) {
  const detectedWindow = Number(contextWindow) > 0 ? Number(contextWindow) : null;
  const report = {
    ...thresholdReport(config, detectedWindow),
    contextCapacitySource: detectedWindow ? "setup-input" : "unverified",
  };
  const path = resolveWithin(project, ".claude/settings.local.json");
  rememberCreated(state, project, path);
  const settings = readJson(path, {});
  settings.env ||= {};
  state.claudeEnv ||= {};
  captureEnv(settings.env, state.claudeEnv, "CLAUDE_CODE_AUTO_COMPACT_WINDOW");
  if (detectedWindow) {
    settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(Math.floor(detectedWindow));
    state.managedWindow = String(Math.floor(detectedWindow));
    captureEnv(settings.env, state.claudeEnv, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE");
    settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = "75";
    state.managedPercent = "75";
  } else {
    if (state.managedWindow && settings.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW === state.managedWindow) {
      restoreEnv(settings.env, state.claudeEnv, "CLAUDE_CODE_AUTO_COMPACT_WINDOW");
    }
    delete state.managedWindow;
    if (state.managedPercent && settings.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === state.managedPercent) {
      restoreEnv(settings.env, state.claudeEnv, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE");
    }
    delete state.managedPercent;
  }
  state.modelContextWindow = detectedWindow || state.modelContextWindow || null;
  state.contextCapacitySource = detectedWindow ? "setup-input" : "unverified";
  state.compactionTriggerPolicy = { owner: "claude", strategy: "host-controlled", configuredPercent: state.managedPercent || null };
  settings.hooks ||= {};
  upsertNested(settings.hooks, "PreCompact", "manual|auto", claudeHandler("PreCompact"));
  upsertNested(settings.hooks, "PostCompact", "manual|auto", claudeHandler("PostCompact"));
  upsertNested(settings.hooks, "SessionStart", "startup|resume|clear|compact", claudeHandler("SessionStart"));
  writeJsonAtomic(path, settings);

  const statusLine = installClaudeStatusLine({ project, state, settingsPaths });
  const base = detectedWindow
    ? `Claude model window ${Math.floor(detectedWindow)} is configured separately from the host-controlled 75% trigger policy.`
    : "Claude model window is unverified; host-controlled compaction remains enabled without inventing a fallback capacity.";
  return result(
    "claude",
    statusLine.conflict ? [path] : [path, statusLine.path],
    report,
    statusLine.conflict
      ? `${base} An existing custom statusLine was preserved; compose the displayed command with it manually for smart-zone telemetry.`
      : `${base} The status line shows live usage against the effective threshold rather than raw percent-of-window.`,
  );
}

function claudeSettingsPath(project, settingsPaths = {}) {
  const override = settingsPaths.claude || process.env.UAS_CLAUDE_SETTINGS;
  return override ? resolve(project, override) : resolve(homedir(), ".claude/settings.json");
}

function claudeStatusLineCommand() {
  // Claude Code substitutes ${CLAUDE_PROJECT_DIR} when it runs the status line, so a
  // single user-scoped entry follows whichever project the session is in — the same
  // substitution claudeHandler relies on for hooks.
  return `node "\${CLAUDE_PROJECT_DIR}/${MANAGED_FRAGMENT}" statusline --harness claude --project "\${CLAUDE_PROJECT_DIR}"`;
}

function installClaudeStatusLine({ project, state, settingsPaths }) {
  // statusLine is a user-scoped Claude Code setting (~/.claude/settings.json), like the
  // Antigravity CLI status line. Tests and CI pass settingsPaths.claude to keep writes
  // out of the real home directory.
  const settingsPath = claudeSettingsPath(project, settingsPaths);
  rememberCreated(state, project, settingsPath);
  const managed = { type: "command", command: claudeStatusLineCommand() };
  const settings = readJson(settingsPath, {});
  const alreadyManaged = state.managedClaudeStatusLine && JSON.stringify(settings.statusLine) === state.managedClaudeStatusLine;
  const conflict = Boolean(settings.statusLine) && !alreadyManaged;
  if (!conflict) {
    state.claudeSettingsPath = settingsPath;
    settings.statusLine = managed;
    state.managedClaudeStatusLine = JSON.stringify(managed);
    writeJsonAtomic(settingsPath, settings);
  }
  return { conflict, path: settingsPath };
}

function installCursor({ project, config, contextWindow, state }) {
  const report = { ...thresholdReport(config, contextWindow), contextCapacitySource: Number(contextWindow) > 0 ? "setup-input" : "unverified" };
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
  const report = { ...thresholdReport(config, contextWindow), contextCapacitySource: Number(contextWindow) > 0 ? "setup-input" : "unverified" };
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
  const report = { ...thresholdReport(config, contextWindow), contextCapacitySource: Number(contextWindow) > 0 ? "setup-input" : "unverified" };
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
  if (existsSync(configPath)) {
    removeCodexScope(project, configPath, state);
    if (existsSync(configPath)) removeCodexThreshold(project, configPath, state);
  }
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
  removeClaudeStatusLine(state, project);
  return { host: "claude", removed: true };
}

function removeClaudeStatusLine(state, project) {
  const settingsPath = state.claudeSettingsPath;
  if (!settingsPath || !existsSync(settingsPath)) return;
  const settings = readJson(settingsPath, {});
  if (!state.managedClaudeStatusLine || JSON.stringify(settings.statusLine) !== state.managedClaudeStatusLine) return;
  delete settings.statusLine;
  if (Object.keys(settings).length === 0 && wasCreated(state, project, settingsPath)) unlinkSync(settingsPath);
  else writeJsonAtomic(settingsPath, settings);
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
  mergeCodexRootSetting({
    path,
    state,
    pattern: /^\s*model_auto_compact_token_limit\s*=.*$/m,
    managedLine: `model_auto_compact_token_limit = ${threshold} # universal-agent-skills`,
    reversalKey: "codexThreshold",
    managedKey: "managedThreshold",
    managedValue: threshold,
    insertionComment: "# universal-agent-skills managed auto-compaction threshold",
  });
}

function mergeCodexScope(path, scope, state) {
  mergeCodexRootSetting({
    path,
    state,
    pattern: /^\s*model_auto_compact_token_limit_scope\s*=.*$/m,
    managedLine: `model_auto_compact_token_limit_scope = "${scope}" # universal-agent-skills`,
    reversalKey: "codexScope",
    managedKey: "managedScope",
    managedValue: scope,
  });
}

function mergeCodexRootSetting({ path, state, pattern, managedLine, reversalKey, managedKey, managedValue, insertionComment }) {
  let source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const firstTable = source.search(/^\s*\[/m);
  const rootEnd = firstTable < 0 ? source.length : firstTable;
  const root = source.slice(0, rootEnd);
  const rest = source.slice(rootEnd);
  if (pattern.test(root)) {
    const prior = root.match(pattern)[0];
    if (!state[reversalKey]) state[reversalKey] = { action: "replaced", previousLine: prior };
    source = root.replace(pattern, managedLine) + rest;
  } else {
    if (!state[reversalKey]) state[reversalKey] = { action: "added" };
    const comment = insertionComment ? `${insertionComment}${eol}` : "";
    source = `${root}${root && !root.endsWith(eol) ? eol : ""}${comment}${managedLine}${eol}${rest}`;
  }
  writeTextAtomic(path, source);
  state[managedKey] = managedValue;
}

function resolveCodexPolicy(project, path, config, contextWindow, options) {
  const source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const firstTable = source.search(/^\s*\[/m);
  const root = source.slice(0, firstTable < 0 ? source.length : firstTable);
  const configuredCapacity = Number(root.match(/^\s*model_context_window\s*=\s*(\d+)\s*(?:#.*)?$/m)?.[1]);
  const explicitCapacity = Number(contextWindow);
  const capacity = Number.isFinite(explicitCapacity) && explicitCapacity > 0
    ? Math.floor(explicitCapacity)
    : Number.isFinite(configuredCapacity) && configuredCapacity > 0
      ? Math.floor(configuredCapacity)
      : null;
  if (!capacity) {
    throw new Error("Codex context capacity is unknown. Configure model_context_window or pass --context-window before installing the Codex adapter.");
  }
  const report = thresholdReport(config, capacity);
  const activeModel = root.match(/^\s*model\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/m)?.[1] || null;
  const requestedScope = options.accountingScope || "total";
  if (!new Set(["total", "body_after_prefix"]).has(requestedScope)) {
    throw new Error("Codex accounting scope must be total or body_after_prefix");
  }
  let prefixTokens = null;
  let prefixVerification = null;
  let installedTokenLimit = report.effectiveTokens;
  let scopeConfidence = "safe-default";
  if (requestedScope === "body_after_prefix") {
    prefixTokens = Number(options.prefixTokens);
    if (!Number.isInteger(prefixTokens) || prefixTokens < 0) {
      throw new Error("body_after_prefix requires a verified non-negative --codex-prefix-tokens value");
    }
    if (!options.prefixEvidence) throw new Error("body_after_prefix requires --codex-prefix-evidence from an observed Codex session");
    const evidencePath = resolveWithin(project, options.prefixEvidence);
    const evidence = readJson(evidencePath, null);
    const observedAt = Date.parse(evidence?.observedAt);
    if (evidence?.kind !== "codex-prefix-measurement"
      || !String(evidence.source || "").trim()
      || !String(evidence.model || "").trim()
      || !Number.isFinite(observedAt)
      || evidence.contextCapacity !== capacity
      || evidence.prefixTokens !== prefixTokens
      || evidence.model !== activeModel) {
      throw new Error("Codex prefix evidence must identify its source, model, capacity, prefix token count, and observation time, and must match the active configuration");
    }
    installedTokenLimit = report.effectiveTokens - prefixTokens;
    // capacity - (prefixTokens + installedTokenLimit) always equals capacity - report.effectiveTokens,
    // which thresholdReport() already guarantees is >= config.policy.minimumReserveTokens; only the
    // prefix itself can make the remaining body budget non-positive, so that's the one real check.
    if (installedTokenLimit < 1) {
      throw new Error("body_after_prefix cannot preserve the configured token reserve with this prefix");
    }
    scopeConfidence = "evidence-verified-prefix";
    prefixVerification = {
      evidencePath: relative(project, evidencePath).replaceAll("\\", "/"),
      source: String(evidence.source).trim(),
      model: evidence.model,
      observedAt: new Date(observedAt).toISOString(),
    };
  }
  return {
    ...report,
    contextCapacitySource: explicitCapacity > 0 ? "setup-input" : "codex-config:model_context_window",
    activeModel,
    accountingScope: requestedScope,
    scopeConfidence,
    prefixTokens,
    prefixVerification,
    installedTokenLimit,
  };
}

function removeCodexThreshold(project, path, state) {
  removeCodexRootSetting({
    project,
    path,
    state,
    managedPattern: /^model_auto_compact_token_limit\s*=\s*\d+\s*# universal-agent-skills\s*$/m,
    reversalKey: "codexThreshold",
    insertionCommentPattern: /^# universal-agent-skills managed auto-compaction threshold\r?\n/m,
  });
}

function removeCodexScope(project, path, state) {
  removeCodexRootSetting({
    project,
    path,
    state,
    managedPattern: /^model_auto_compact_token_limit_scope\s*=\s*"(?:total|body_after_prefix)"\s*# universal-agent-skills\s*$/m,
    reversalKey: "codexScope",
  });
}

function removeCodexRootSetting({ project, path, state, managedPattern, reversalKey, insertionCommentPattern }) {
  let source = readFileSync(path, "utf8");
  if (!managedPattern.test(source)) return;
  const reversal = state[reversalKey];
  if (reversal?.action === "replaced" && reversal.previousLine) {
    source = source.replace(managedPattern, reversal.previousLine);
  } else {
    if (insertionCommentPattern) source = source.replace(insertionCommentPattern, "");
    source = source.replace(managedPattern, "").replace(/^\s*\r?\n/, "");
  }
  if (source.trim() === "" && wasCreated(state, project, path)) unlinkSync(path);
  else writeTextAtomic(path, source);
}

function commandHandler(_project, host, event, additionalContextLimit) {
  const posix = `root=$(git rev-parse --show-toplevel) || exit $?; node "$root/${MANAGED_FRAGMENT}" hook ${host} ${event} --project "$root"`;
  const powerShell = `$root = (git rev-parse --show-toplevel).Trim()\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n& node (Join-Path $root '${MANAGED_FRAGMENT}') hook ${host} ${event} --project $root\nexit $LASTEXITCODE`;
  const encodedPowerShell = Buffer.from(powerShell, "utf16le").toString("base64");
  const handler = {
    type: "command",
    command: posix,
    commandWindows: `powershell -NoProfile -NonInteractive -EncodedCommand ${encodedPowerShell}`,
    timeout: 30,
  };
  if (additionalContextLimit) handler.additionalContextLimit = additionalContextLimit;
  return handler;
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

function codexHooksVerified(hooks, expected) {
  if (!hooks || !expected) return false;
  return Object.entries(expected).every(([event, managed]) => {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    const managedHandlers = entries.flatMap((entry) => Array.isArray(entry?.hooks)
      ? entry.hooks.filter((handler) => JSON.stringify(handler).includes(MANAGED_FRAGMENT)).map((handler) => ({ matcher: entry.matcher, handler }))
      : []);
    return managedHandlers.length === 1
      && managedHandlers[0].matcher === managed.matcher
      && JSON.stringify(managedHandlers[0].handler) === JSON.stringify(managed.handler);
  });
}

function upsertManagedNested(hooks, event, matcher, handler) {
  const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
  const preserved = [];
  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) {
      if (!JSON.stringify(entry).includes(MANAGED_FRAGMENT)) preserved.push(entry);
      continue;
    }
    const userHandlers = entry.hooks.filter((candidate) => !JSON.stringify(candidate).includes(MANAGED_FRAGMENT));
    if (userHandlers.length > 0) preserved.push({ ...entry, hooks: userHandlers });
  }
  hooks[event] = [...preserved, { matcher, hooks: [handler] }];
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
    compatibility: { adapterVersion: 2, hookContract: HOOK_CONTRACT },
    ownership: "universal-agent-skills",
  };
}

function managedHookDiagnostics(project, host) {
  const counts = {};
  try {
    if (host === "codex") {
      const hooks = readJson(resolveWithin(project, ".codex/hooks.json"), {}).hooks || {};
      for (const [event, entries] of Object.entries(hooks)) {
        counts[event] = (Array.isArray(entries) ? entries : []).reduce(
          (total, entry) => total + (Array.isArray(entry?.hooks) ? entry.hooks.filter((item) => JSON.stringify(item).includes(MANAGED_FRAGMENT)).length : 0),
          0,
        );
      }
    } else if (host === "claude") {
      const hooks = readJson(resolveWithin(project, ".claude/settings.local.json"), {}).hooks || {};
      for (const [event, entries] of Object.entries(hooks)) {
        counts[event] = (Array.isArray(entries) ? entries : []).reduce(
          (total, entry) => total + (Array.isArray(entry?.hooks) ? entry.hooks.filter((item) => JSON.stringify(item).includes(MANAGED_FRAGMENT)).length : 0),
          0,
        );
      }
    }
  } catch {
    return { owner: "universal-agent-skills", duplicate: false, counts, confidence: "unverified" };
  }
  return {
    owner: "universal-agent-skills",
    counts,
    duplicate: Object.values(counts).some((count) => count > 1),
    confidence: Object.keys(counts).length > 0 ? "verified" : "unverified",
  };
}
