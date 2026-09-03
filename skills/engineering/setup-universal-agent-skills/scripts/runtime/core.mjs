import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const SCHEMA_VERSION = 2;
export const CHECKPOINT_SCHEMA_VERSION = 1;
export const CAPSULE_SCHEMA_VERSION = 1;
export const DEFAULT_POLICY = Object.freeze({
  checkpointUtilization: 0.68,
  compactUtilization: 0.78,
  minimumReserveTokens: 30000,
  capsuleBudgetTokens: 500,
});
export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  policy: DEFAULT_POLICY,
  designRoot: "docs/design",
  stateRoot: ".agents/state/continuity",
  frontendDesignVariants: 3,
  phaseBoundaryCheckpointing: true,
});

export const REQUIRED_HEADINGS = Object.freeze([
  "Objective and success criteria",
  "Current phase and completion status",
  "Decisions and rejected alternatives",
  "Completed work and validation",
  "Dirty working tree",
  "Pointers",
  "Remaining risks and blockers",
  "Next action",
  "Suggested skills and resume instructions",
]);

const ALLOWED_HARNESSES = new Set(["codex", "claude", "cursor", "copilot", "antigravity", "other"]);
const ALLOWED_EVENTS = new Set(["phase-boundary", "decision", "pre-compact", "interruption", "manual", "threshold-warning", "handoff"]);
const ALLOWED_STATUSES = new Set(["in-progress", "blocked", "ready-for-review", "complete"]);
const STALE_CHECKPOINT_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveWithin(root, candidate) {
  const base = resolve(root);
  const target = isAbsolute(candidate) ? resolve(candidate) : resolve(base, candidate);
  const rel = relative(base, target);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return target;
  }
  throw new Error(`Refusing path outside project: ${candidate}`);
}

export function resolveProjectPath(project, candidate) {
  return isAbsolute(candidate) ? resolve(candidate) : resolve(project, candidate);
}

export function readJson(path, fallback = {}) {
  if (!existsSync(path)) return structuredClone(fallback);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeTextAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

export function writeJsonAtomic(path, value) {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function thresholdReport(config, contextWindow) {
  validatePolicy(config.policy);
  const detected = Number(contextWindow);
  const verified = Number.isFinite(detected) && detected > 0;
  let checkpointTokens = null;
  let compactTokens = null;
  let reserveTokens = null;
  if (verified) {
    if (!Number.isInteger(detected)) throw new Error("contextWindow must be a positive integer");
    if (detected <= config.policy.minimumReserveTokens) {
      throw new Error("contextWindow must exceed policy.minimumReserveTokens");
    }
    checkpointTokens = Math.floor(detected * config.policy.checkpointUtilization);
    compactTokens = Math.min(
      Math.floor(detected * config.policy.compactUtilization),
      detected - config.policy.minimumReserveTokens,
    );
    if (checkpointTokens >= compactTokens) {
      throw new Error("effective checkpoint threshold must be lower than the compact threshold");
    }
    reserveTokens = detected - compactTokens;
  }
  return {
    policy: { ...config.policy },
    detectedContextWindow: verified ? detected : null,
    contextWindowVerified: verified,
    checkpointTokens,
    compactTokens,
    reserveTokens,
    capsuleBudgetTokens: config.policy.capsuleBudgetTokens,
    effectiveTokens: compactTokens,
    effectivePercent: verified ? Math.floor((compactTokens / detected) * 100) : null,
  };
}

export function loadConfig(project) {
  const path = resolveWithin(project, ".agents/universal-agent-skills/config.json");
  const existing = readJson(path, {});
  const config = migrateConfig(existing);
  validateConfig(config);
  return { config, path };
}

export function ensureConfig(project) {
  const path = resolveWithin(project, ".agents/universal-agent-skills/config.json");
  const existing = readJson(path, {});
  const config = migrateConfig(existing);
  validateConfig(config);
  if (!existsSync(path) || JSON.stringify(existing) !== JSON.stringify(config)) {
    writeJsonAtomic(path, config);
  }
  return { config, path };
}

export function validateConfig(config) {
  if (config.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported config schemaVersion: ${config.schemaVersion}`);
  }
  validatePolicy(config.policy);
  if (config.frontendDesignVariants !== 3) {
    throw new Error("frontendDesignVariants must be exactly 3 in schema version 1");
  }
  if (typeof config.phaseBoundaryCheckpointing !== "boolean") {
    throw new Error("phaseBoundaryCheckpointing must be a boolean");
  }
  for (const key of ["designRoot", "stateRoot"]) {
    const portable = typeof config[key] === "string" ? config[key].trim().replaceAll("\\", "/") : "";
    if (!portable || isAbsolute(config[key]) || portable === "." || portable === ".." || portable.startsWith("../")) {
      throw new Error(`${key} must be a non-empty project-relative path`);
    }
  }
}

function migrateConfig(existing) {
  const version = existing.schemaVersion ?? SCHEMA_VERSION;
  if (![1, SCHEMA_VERSION].includes(version)) {
    throw new Error(`Unsupported config schemaVersion: ${version}`);
  }
  return {
    ...DEFAULT_CONFIG,
    ...existing,
    schemaVersion: SCHEMA_VERSION,
    policy: { ...DEFAULT_POLICY, ...(existing.policy || {}) },
  };
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("policy must be an object");
  }
  if (typeof policy.checkpointUtilization !== "number") {
    throw new Error("policy.checkpointUtilization must be a number");
  }
  if (typeof policy.compactUtilization !== "number") {
    throw new Error("policy.compactUtilization must be a number");
  }
  const checkpoint = policy.checkpointUtilization;
  const compact = policy.compactUtilization;
  if (!Number.isFinite(checkpoint) || checkpoint <= 0 || checkpoint >= 1) {
    throw new Error("policy.checkpointUtilization must be greater than 0 and less than 1");
  }
  if (!Number.isFinite(compact) || compact <= checkpoint || compact >= 1) {
    throw new Error("policy.compactUtilization must be greater than checkpointUtilization and less than 1");
  }
  for (const key of ["minimumReserveTokens", "capsuleBudgetTokens"]) {
    if (!Number.isInteger(policy[key]) || policy[key] <= 0) {
      throw new Error(`policy.${key} must be a positive integer`);
    }
  }
}

export function ensureGitignore(project, config = DEFAULT_CONFIG) {
  const path = resolveWithin(project, ".gitignore");
  const configuredStateRoot = config.stateRoot.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  const entries = [
    `${configuredStateRoot}/`,
    ".agents/universal-agent-skills/adapter-state.json",
    ".agents/universal-agent-skills/adapters/",
    ".claude/settings.local.json",
  ];
  const source = existsSync(path) ? readFileSync(path, "utf8") : "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const present = new Set(source.split(/\r?\n/).map((line) => line.trim()));
  const missing = entries.filter((entry) => !present.has(entry));
  if (missing.length === 0) return [];
  const prefix = source.length === 0 || source.endsWith("\n") ? "" : eol;
  writeTextAtomic(path, `${source}${prefix}${missing.join(eol)}${eol}`);
  return missing;
}

export function installRuntime(project, sourceDirectory) {
  const targetDirectory = resolveWithin(project, ".agents/universal-agent-skills/runtime");
  mkdirSync(targetDirectory, { recursive: true });
  const copied = [];
  for (const name of ["core.mjs", "adapters.mjs", "cli.mjs"]) {
    const source = join(sourceDirectory, name);
    if (!existsSync(source)) throw new Error(`Runtime source missing: ${source}`);
    const target = join(targetDirectory, name);
    const changed = !existsSync(target) || readFileSync(source).compare(readFileSync(target)) !== 0;
    if (changed) {
      copyFileSync(source, target);
      copied.push(relative(project, target).replaceAll("\\", "/"));
    }
  }
  return copied;
}

export function redactSensitive(input) {
  let text = String(input ?? "");
  text = text.replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]");
  text = text.replace(/\b(sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[oprsu]_[A-Za-z0-9_]{20,}|gl(?:pat|ptt|rt|dt|cbt)-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{12,}|npm_[A-Za-z0-9]{20,})\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]");
  text = text.replace(/\b(authorization)\b(\s*[:=]\s*)(["']?)(?:bearer|basic)\s+[^\s,"'\]}]+\3/gi, (_match, key, divider) => `${key}${divider}[REDACTED]`);
  const sensitiveKey = "authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|password|passwd|secret|client[_-]?secret|aws[_-]?secret[_-]?access[_-]?key|account[_-]?key|private[_-]?key|cookie|connection[_-]?string";
  text = text.replace(
    new RegExp(`(["'])(${sensitiveKey})\\1(\\s*:\\s*)(["'])([^\\r\\n]*?)\\4`, "gi"),
    (_match, quote, key, divider, valueQuote) => `${quote}${key}${quote}${divider}${valueQuote}[REDACTED]${valueQuote}`,
  );
  text = text.replace(
    new RegExp(`\\b(${sensitiveKey})\\b(\\s*[:=]\\s*)(["'])([^\\r\\n]*?)\\3`, "gi"),
    (_match, key, divider, valueQuote) => `${key}${divider}${valueQuote}[REDACTED]${valueQuote}`,
  );
  text = text.replace(
    new RegExp(`\\b(${sensitiveKey})\\b(\\s*[:=]\\s*)(["']?)([^\\s,"'\\]};&]+)\\3`, "gi"),
    (_match, key, divider) => `${key}${divider}[REDACTED]`,
  );
  text = text.replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, "$1[REDACTED]@[REDACTED_HOST]/");
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  return text;
}

export function redactPortable(input, project) {
  let text = redactSensitive(input);
  const roots = [
    [resolve(project), "[PROJECT_ROOT]"],
    [resolve(homedir()), "[USER_HOME]"],
  ];
  for (const [root, replacement] of roots) {
    const variants = [...new Set([root, root.replaceAll("\\", "/")])].sort((a, b) => b.length - a.length);
    for (const variant of variants) {
      const flags = process.platform === "win32" ? "gi" : "g";
      text = text.replace(new RegExp(escapeRegExp(variant), flags), replacement);
    }
  }
  return text;
}

export function gitSnapshot(project) {
  const head = runGit(project, ["rev-parse", "HEAD"]);
  const branch = runGit(project, ["branch", "--show-current"]);
  const status = runGit(project, ["status", "--short"]);
  return {
    available: head.ok || status.ok,
    head: head.ok ? head.stdout.trim() : "unavailable",
    branch: branch.ok ? branch.stdout.trim() || "detached" : "unavailable",
    dirty: status.ok ? status.stdout.replace(/\s+$/, "") : "unavailable",
  };
}

function runGit(project, args) {
  const result = spawnSync("git", args, { cwd: project, encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function buildCheckpoint({ project, config, harness, event, fields = {}, existing }) {
  const now = new Date().toISOString();
  const git = gitSnapshot(project);
  if (existing) {
    let updated = redactSensitive(existing);
    if (fields.preserveClaims === true) {
      updated = setFrontmatterValue(updated, "lastObservedAt", now);
      updated = setFrontmatterValue(updated, "lastObservedHarness", safeScalar(harness || "other"));
      updated = setFrontmatterValue(updated, "lastObservedEvent", safeScalar(event || "manual"));
      return updated.endsWith("\n") ? updated : `${updated}\n`;
    }
    const previousMetadata = parseFrontmatter(updated);
    updated = setFrontmatterValue(updated, "schemaVersion", String(CHECKPOINT_SCHEMA_VERSION));
    updated = setFrontmatterValue(updated, "timestamp", now);
    updated = setFrontmatterValue(updated, "originatingHarness", safeScalar(harness || "other"));
    updated = setFrontmatterValue(updated, "event", safeScalar(event || "manual"));
    updated = setFrontmatterValue(updated, "gitHead", git.head);
    if (fields.status) updated = setFrontmatterValue(updated, "status", safeScalar(fields.status));
    const sectionFields = [
      ["objective", "Objective and success criteria"],
      ["phase", "Current phase and completion status"],
      ["decisions", "Decisions and rejected alternatives"],
      ["completed", "Completed work and validation"],
      ["pointers", "Pointers"],
      ["risks", "Remaining risks and blockers"],
      ["next", "Next action"],
      ["skills", "Suggested skills and resume instructions"],
    ];
    for (const [field, heading] of sectionFields) {
      if (fields[field]) updated = replaceSection(updated, heading, redactSensitive(fields[field]));
    }
    if (fields.completed) {
      updated = setFrontmatterValue(updated, "validationGitHead", git.head);
      updated = setFrontmatterValue(updated, "validationTimestamp", now);
    } else {
      updated = setFrontmatterValue(updated, "validationGitHead", previousMetadata.validationGitHead || previousMetadata.gitHead || "unavailable");
      updated = setFrontmatterValue(updated, "validationTimestamp", previousMetadata.validationTimestamp || previousMetadata.timestamp || "unavailable");
    }
    updated = replaceSection(updated, "Dirty working tree", formatDirty(git));
    return updated.endsWith("\n") ? updated : `${updated}\n`;
  }

  const value = (key, fallback) => redactSensitive(fields[key] || fallback);
  return `---
schemaVersion: ${CHECKPOINT_SCHEMA_VERSION}
timestamp: ${now}
originatingHarness: ${safeScalar(harness || "other")}
event: ${safeScalar(event || "manual")}
status: ${safeScalar(fields.status || "in-progress")}
gitHead: ${git.head}
validationGitHead: ${fields.completed ? git.head : "unavailable"}
validationTimestamp: ${fields.completed ? now : "unavailable"}
---

# Continuity checkpoint

## Objective and success criteria

${value("objective", "Not captured automatically. Invoke /checkpoint-work to record the objective and success criteria.")}

## Current phase and completion status

${value("phase", "Automatic lifecycle checkpoint; phase detail was not available to the hook.")}

## Decisions and rejected alternatives

${value("decisions", "No decision detail was supplied to the runtime.")}

## Completed work and validation

${value("completed", "No completion or validation detail was supplied to the runtime.")}

## Dirty working tree

${formatDirty(git)}

## Pointers

${value("pointers", "No pointers were supplied to the runtime.")}

## Remaining risks and blockers

${value("risks", "Reconcile this automatic checkpoint against the repository before continuing.")}

## Next action

${value("next", "Invoke /resume-work, reconcile current state, and replace this automatic checkpoint with a phase-aware checkpoint.")}

## Suggested skills and resume instructions

${value("skills", "Use /resume-work. Load other skills only after reconciliation confirms they still fit.")}
`;
}

function formatDirty(git) {
  if (!git.available) return "Git unavailable.";
  if (!git.dirty) return `Clean on branch \`${git.branch}\`.`;
  return `Branch: \`${git.branch}\`\n\n\`\`\`text\n${redactSensitive(git.dirty)}\n\`\`\``;
}

function safeScalar(value) {
  return String(value).replace(/[\r\n:]/g, "-").trim() || "other";
}

function setFrontmatterValue(document, key, value) {
  const pattern = new RegExp(`(^---\\r?\\n[\\s\\S]*?^${escapeRegExp(key)}:\\s*)[^\\r\\n]*(?=\\r?$)`, "m");
  if (pattern.test(document)) return document.replace(pattern, `$1${value}`);
  return document.replace(/^---\r?\n/, `---\n${key}: ${value}\n`);
}

function replaceSection(document, heading, body) {
  const pattern = new RegExp(`(^## ${escapeRegExp(heading)}[ \\t]*\\r?\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");
  if (!pattern.test(document)) return document;
  return document.replace(pattern, `$1\n${body}\n\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateCheckpoint(document) {
  const errors = [];
  const metadata = parseFrontmatter(document);
  if (metadata.schemaVersion !== String(CHECKPOINT_SCHEMA_VERSION)) errors.push(`schemaVersion must be ${CHECKPOINT_SCHEMA_VERSION}`);
  for (const key of ["timestamp", "originatingHarness", "event", "status", "gitHead"]) {
    if (!metadata[key]) errors.push(`missing frontmatter field: ${key}`);
  }
  if (metadata.timestamp && !isIsoUtc(metadata.timestamp)) errors.push("timestamp must be ISO-8601 UTC");
  if (metadata.validationTimestamp && metadata.validationTimestamp !== "unavailable" && !isIsoUtc(metadata.validationTimestamp)) {
    errors.push("validationTimestamp must be ISO-8601 UTC or unavailable");
  }
  if (metadata.sourceCheckpointTimestamp && metadata.sourceCheckpointTimestamp !== "unavailable" && !isIsoUtc(metadata.sourceCheckpointTimestamp)) {
    errors.push("sourceCheckpointTimestamp must be ISO-8601 UTC or unavailable");
  }
  if (metadata.lastObservedAt && !isIsoUtc(metadata.lastObservedAt)) errors.push("lastObservedAt must be ISO-8601 UTC");
  if (metadata.originatingHarness && !ALLOWED_HARNESSES.has(metadata.originatingHarness)) {
    errors.push(`unsupported originatingHarness: ${metadata.originatingHarness}`);
  }
  if (metadata.lastObservedHarness && !ALLOWED_HARNESSES.has(metadata.lastObservedHarness)) {
    errors.push(`unsupported lastObservedHarness: ${metadata.lastObservedHarness}`);
  }
  if (metadata.event && !ALLOWED_EVENTS.has(metadata.event)) errors.push(`unsupported event: ${metadata.event}`);
  if (metadata.lastObservedEvent && !ALLOWED_EVENTS.has(metadata.lastObservedEvent)) {
    errors.push(`unsupported lastObservedEvent: ${metadata.lastObservedEvent}`);
  }
  if (metadata.status && !ALLOWED_STATUSES.has(metadata.status)) errors.push(`unsupported status: ${metadata.status}`);
  let previousIndex = -1;
  for (const heading of REQUIRED_HEADINGS) {
    const matches = [...String(document).matchAll(new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, "gm"))];
    if (matches.length === 0) {
      errors.push(`missing heading: ${heading}`);
      continue;
    }
    if (matches.length > 1) errors.push(`duplicate heading: ${heading}`);
    if (matches[0].index < previousIndex) errors.push(`heading out of order: ${heading}`);
    previousIndex = matches[0].index;
  }
  return { valid: errors.length === 0, errors, metadata };
}

function isIsoUtc(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export function parseFrontmatter(document) {
  const match = String(document).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

export function checkpointPaths(project, config) {
  const root = resolveWithin(project, config.stateRoot);
  return { root, current: join(root, "current.md"), history: join(root, "history") };
}

const CAPSULE_HEADINGS = Object.freeze([
  ["objective", "Objective"],
  ["successCriteria", "Success criteria"],
  ["phase", "Current phase"],
  ["decisions", "Binding decisions"],
  ["validation", "Validation state"],
  ["blockers", "Blockers"],
  ["next", "Next action"],
  ["pointers", "Authority pointers"],
]);

export function workItemPaths(project, config, workItemId) {
  const id = validateIdentity("workItemId", workItemId);
  const state = checkpointPaths(project, config);
  const root = resolveWithin(state.root, join("work-items", id));
  return { root, capsule: join(root, "semantic.md") };
}

export function activateWorkItem({ project, config, workItemId, harness, sessionId }) {
  const id = validateIdentity("workItemId", workItemId);
  const normalizedHarness = validateHarness(harness);
  const normalizedSession = validateIdentity("sessionId", sessionId);
  const paths = workItemPaths(project, config, id);
  const created = !existsSync(paths.capsule);
  if (created) {
    const document = buildCapsule({
      project,
      workItemId: id,
      revision: 0,
      harness: normalizedHarness,
      sessionId: normalizedSession,
      fields: {},
    });
    writeTextAtomic(paths.capsule, document);
  } else {
    const validation = validateCapsule(readFileSync(paths.capsule, "utf8"), id);
    if (!validation.valid) throw new Error(`Work-Item Capsule validation failed: ${validation.errors.join("; ")}`);
  }
  const binding = { schemaVersion: 1, workItemId: id, harness: normalizedHarness, sessionId: normalizedSession, boundAt: new Date().toISOString() };
  writeJsonAtomic(sessionBindingPath(project, config, normalizedHarness, normalizedSession), binding);
  const metadata = parseFrontmatter(readFileSync(paths.capsule, "utf8"));
  return { workItemId: id, created, revision: Number(metadata.revision), binding };
}

export function resolveActiveWorkItem({ project, config, workItemId, harness, sessionId }) {
  if (workItemId) {
    const id = validateIdentity("workItemId", workItemId);
    const paths = workItemPaths(project, config, id);
    return existsSync(paths.capsule)
      ? { ok: true, workItemId: id, resolution: "explicit", paths }
      : { ok: false, resolution: "explicit", reason: `Work item does not exist: ${id}` };
  }
  if (sessionId) {
    const normalizedHarness = validateHarness(harness);
    const normalizedSession = validateIdentity("sessionId", sessionId);
    const path = sessionBindingPath(project, config, normalizedHarness, normalizedSession);
    if (existsSync(path)) {
      const binding = readJson(path);
      const id = validateIdentity("workItemId", binding.workItemId);
      const paths = workItemPaths(project, config, id);
      return existsSync(paths.capsule)
        ? { ok: true, workItemId: id, resolution: "session-binding", paths, binding }
        : { ok: false, resolution: "session-binding", reason: `Bound work item does not exist: ${id}` };
    }
  }
  return { ok: false, resolution: "none", reason: "No active work item. Supply --work-item or a bound --harness and --session." };
}

export function saveWorkItemCapsule({ project, config, workItemId, harness, sessionId, fields = {} }) {
  const resolved = resolveActiveWorkItem({ project, config, workItemId, harness, sessionId });
  if (!resolved.ok) return resolved;
  const existing = readFileSync(resolved.paths.capsule, "utf8");
  const validation = validateCapsule(existing, resolved.workItemId);
  if (!validation.valid) throw new Error(`Work-Item Capsule validation failed: ${validation.errors.join("; ")}`);
  const document = buildCapsule({
    project,
    workItemId: resolved.workItemId,
    revision: Number(validation.metadata.revision) + 1,
    harness: validateHarness(harness || "other"),
    sessionId: sessionId ? validateIdentity("sessionId", sessionId) : "manual",
    fields,
    existing,
  });
  const updated = validateCapsule(document, resolved.workItemId);
  if (!updated.valid) throw new Error(`Work-Item Capsule validation failed: ${updated.errors.join("; ")}`);
  writeTextAtomic(resolved.paths.capsule, document);
  return { ...resolved, document, revision: Number(updated.metadata.revision) };
}

export function reconcileWorkItem({ project, config, workItemId, harness, sessionId }) {
  const resolved = resolveActiveWorkItem({ project, config, workItemId, harness, sessionId });
  if (!resolved.ok) return { ...resolved, report: resolved.reason };
  const document = redactSensitive(readFileSync(resolved.paths.capsule, "utf8"));
  const validation = validateCapsule(document, resolved.workItemId);
  if (!validation.valid) {
    return { ...resolved, ok: false, report: `Work-Item Capsule validation failed: ${validation.errors.join("; ")}` };
  }
  const git = gitSnapshot(project);
  const claims = [
    {
      item: "Capsule schema",
      status: "Confirmed",
      detail: `Schema v${CAPSULE_SCHEMA_VERSION} is structurally valid.`,
    },
    {
      item: "Git HEAD",
      status: validation.metadata.gitHead === "unavailable" || git.head === "unavailable"
        ? "Unverified"
        : validation.metadata.gitHead === git.head ? "Confirmed" : "Changed",
      detail: `capsule=${validation.metadata.gitHead || "missing"}; current=${git.head}`,
    },
    ...checkLocalPointers(project, extractSection(document, "Authority pointers")),
  ];
  const table = claims.map((claim) => `| ${escapeTable(claim.item)} | ${claim.status} | ${escapeTable(claim.detail)} |`).join("\n");
  const ok = !claims.some((claim) => claim.status === "Changed" || claim.status === "Missing");
  const report = `# Work-Item Capsule resume\n\nResolution: \`${resolved.resolution}\`\n\nWork Item: \`${resolved.workItemId}\`\n\nCapsule revision: ${validation.metadata.revision}\n\n| Claim | Status | Evidence |\n| --- | --- | --- |\n${table}\n\n## Reconciled capsule\n\n${document}`;
  return { ...resolved, ok, document, validation, claims, report, revision: Number(validation.metadata.revision) };
}

function buildCapsule({ project, workItemId, revision, harness, sessionId, fields, existing }) {
  const git = gitSnapshot(project);
  const prior = existing || "";
  const body = CAPSULE_HEADINGS.map(([field, heading]) => {
    const previous = prior ? extractSection(prior, heading) : "";
    const fallback = field === "next" ? "Record one concrete next action." : "Not recorded yet.";
    return `## ${heading}\n\n${redactSensitive(fields[field] || previous || fallback)}`;
  }).join("\n\n");
  return `---\nschemaVersion: ${CAPSULE_SCHEMA_VERSION}\nworkItemId: ${workItemId}\nrevision: ${revision}\nupdatedAt: ${new Date().toISOString()}\nupdatedByHarness: ${safeScalar(harness)}\nupdatedBySession: ${safeScalar(sessionId)}\ngitHead: ${safeScalar(git.head)}\n---\n\n# Work-Item Capsule\n\n${body}\n`;
}

export function validateCapsule(document, expectedWorkItemId) {
  const errors = [];
  const metadata = parseFrontmatter(document);
  if (metadata.schemaVersion !== String(CAPSULE_SCHEMA_VERSION)) errors.push(`schemaVersion must be ${CAPSULE_SCHEMA_VERSION}`);
  try {
    validateIdentity("workItemId", metadata.workItemId);
  } catch (error) {
    errors.push(error.message);
  }
  if (expectedWorkItemId && metadata.workItemId !== expectedWorkItemId) errors.push("workItemId does not match its storage path");
  if (!Number.isInteger(Number(metadata.revision)) || Number(metadata.revision) < 0) errors.push("revision must be a non-negative integer");
  if (!isIsoUtc(metadata.updatedAt)) errors.push("updatedAt must be ISO-8601 UTC");
  for (const key of ["updatedByHarness", "updatedBySession", "gitHead"]) {
    if (!metadata[key]) errors.push(`missing frontmatter field: ${key}`);
  }
  let previousIndex = -1;
  for (const [, heading] of CAPSULE_HEADINGS) {
    const matches = [...String(document).matchAll(new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, "gm"))];
    if (matches.length !== 1) errors.push(matches.length ? `duplicate heading: ${heading}` : `missing heading: ${heading}`);
    if (matches[0]?.index < previousIndex) errors.push(`heading out of order: ${heading}`);
    if (matches[0]) previousIndex = matches[0].index;
  }
  return { valid: errors.length === 0, errors, metadata };
}

function sessionBindingPath(project, config, harness, sessionId) {
  const state = checkpointPaths(project, config);
  return resolveWithin(state.root, join("bindings", harness, `${sessionId}.json`));
}

function validateHarness(value) {
  const harness = String(value || "").toLowerCase();
  if (!ALLOWED_HARNESSES.has(harness)) throw new Error(`unsupported harness: ${value || "missing"}`);
  return harness;
}

function validateIdentity(name, value) {
  const normalized = String(value || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error(`${name} must start with an alphanumeric character and contain only letters, numbers, dot, underscore, or hyphen`);
  }
  return normalized;
}

export function saveCheckpoint({ project, config, harness, event, fields = {} }) {
  const paths = checkpointPaths(project, config);
  mkdirSync(paths.history, { recursive: true });
  const existing = existsSync(paths.current) ? readFileSync(paths.current, "utf8") : null;
  if (existing) {
    const metadata = parseFrontmatter(existing);
    const stamp = archiveStamp(metadata.timestamp || new Date().toISOString());
    let archive = join(paths.history, `${stamp}-${slug(metadata.event || "checkpoint")}.md`);
    let suffix = 1;
    while (existsSync(archive)) archive = join(paths.history, `${stamp}-${slug(metadata.event || "checkpoint")}-${suffix++}.md`);
    writeTextAtomic(archive, redactSensitive(existing));
  }
  const document = buildCheckpoint({ project, config, harness, event, fields, existing: fields.refreshExisting === false ? null : existing });
  const validation = validateCheckpoint(document);
  if (!validation.valid) throw new Error(`Checkpoint validation failed: ${validation.errors.join("; ")}`);
  writeTextAtomic(paths.current, document);
  return { path: paths.current, document, validation };
}

function archiveStamp(value) {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
  return date.toISOString().replace(/[-:.]/g, "");
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "checkpoint";
}

export function reconcileCheckpoint(project, config, inputPath) {
  const paths = checkpointPaths(project, config);
  const path = inputPath ? resolveProjectPath(project, inputPath) : paths.current;
  if (!existsSync(path)) {
    return {
      ok: false,
      path,
      report: "No local continuity checkpoint exists. Reconstruct state from tracked issues, specs, ADRs, design contracts, and commits, or supply a portable handoff.",
    };
  }
  const document = redactSensitive(readFileSync(path, "utf8"));
  const validation = validateCheckpoint(document);
  const metadata = validation.metadata;
  const git = gitSnapshot(project);
  const claims = [];
  claims.push({
    item: "Checkpoint schema",
    status: validation.valid ? "Confirmed" : "Changed",
    detail: validation.valid ? "Schema v1 is structurally valid." : validation.errors.join("; "),
  });
  claims.push({
    item: "Git HEAD",
    status: metadata.gitHead === "unavailable" || git.head === "unavailable" ? "Unverified" : metadata.gitHead === git.head ? "Confirmed" : "Changed",
    detail: `checkpoint=${metadata.gitHead || "missing"}; current=${git.head}`,
  });
  const validationHead = metadata.validationGitHead || metadata.gitHead || "unavailable";
  claims.push({
    item: "Validation evidence",
    status: validationHead === "unavailable" || git.head === "unavailable" ? "Unverified" : validationHead === git.head ? "Confirmed" : "Changed",
    detail: `recordedFor=${validationHead}; current=${git.head}; recordedAt=${metadata.validationTimestamp || metadata.timestamp || "missing"}`,
  });
  const recordedDirty = extractSection(document, "Dirty working tree");
  const currentDirty = formatDirty(git);
  claims.push({
    item: "Dirty working tree",
    status: !git.available ? "Unverified" : normalizeWhitespace(recordedDirty) === normalizeWhitespace(currentDirty) ? "Confirmed" : "Changed",
    detail: currentDirty,
  });
  const pointerChecks = checkLocalPointers(project, extractSection(document, "Pointers"));
  claims.push(...pointerChecks);
  const semanticTimestamp = metadata.sourceCheckpointTimestamp || metadata.timestamp;
  const ageMs = semanticTimestamp && isIsoUtc(semanticTimestamp) ? Date.now() - Date.parse(semanticTimestamp) : Number.NaN;
  const ageStatus = !Number.isFinite(ageMs) || ageMs < 0
    ? "Unverified"
    : ageMs > STALE_CHECKPOINT_MS
      ? "Changed"
      : "Confirmed";
  claims.push({
    item: "Checkpoint age",
    status: ageStatus,
    detail: Number.isFinite(ageMs) && ageMs >= 0
      ? `${semanticTimestamp}; ageHours=${Math.floor(ageMs / 3600000)}; staleAfterHours=${STALE_CHECKPOINT_MS / 3600000}`
      : semanticTimestamp || "timestamp missing",
  });
  const table = claims.map((claim) => `| ${escapeTable(claim.item)} | ${claim.status} | ${escapeTable(claim.detail)} |`).join("\n");
  const report = `# Continuity reconciliation\n\nCheckpoint: \`${path}\`\n\n| Claim | Status | Evidence |\n| --- | --- | --- |\n${table}\n\n## Reconciled checkpoint\n\n${document}`;
  const ok = validation.valid && !claims.some((claim) => claim.status === "Changed" || claim.status === "Missing");
  return { ok, schemaValid: validation.valid, path, document, claims, report: redactSensitive(report) };
}

function extractSection(document, heading) {
  const match = document.match(new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return match ? match[1].trim() : "";
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function checkLocalPointers(project, content) {
  const checks = [];
  const seen = new Set();
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const raw = match[1].split("#")[0];
    if (!raw || /^(?:https?:|mailto:)/i.test(raw) || seen.has(raw)) continue;
    seen.add(raw);
    const target = isAbsolute(raw) ? raw : resolve(project, raw);
    checks.push({ item: `Pointer ${raw}`, status: existsSync(target) ? "Confirmed" : "Missing", detail: existsSync(target) ? "Local target exists." : "Local target does not exist." });
  }
  if (checks.length === 0) checks.push({ item: "Local pointers", status: "Unverified", detail: "No machine-checkable local Markdown links were recorded." });
  return checks;
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

export function exportHandoff({ project, config, inputPath, outputPath, destination = "another session" }) {
  const reconciliation = reconcileCheckpoint(project, config, inputPath);
  if (!reconciliation.document) throw new Error(reconciliation.report);
  if (!reconciliation.schemaValid) throw new Error(`Cannot export an invalid checkpoint: ${reconciliation.report}`);
  const timestamp = new Date().toISOString();
  const sourceMetadata = parseFrontmatter(reconciliation.document);
  const output = outputPath
    ? resolveProjectPath(project, outputPath)
    : join(tmpdir(), `universal-agent-skills-handoff-${archiveStamp(timestamp)}.md`);
  const reconciliationTable = reconciliation.claims
    .map((claim) => `| ${escapeTable(claim.item)} | ${claim.status} | ${escapeTable(claim.detail)} |`)
    .join("\n");
  const body = `---
schemaVersion: ${CHECKPOINT_SCHEMA_VERSION}
timestamp: ${timestamp}
originatingHarness: ${safeScalar(sourceMetadata.originatingHarness || "other")}
event: handoff
status: ${safeScalar(sourceMetadata.status || "in-progress")}
gitHead: ${safeScalar(sourceMetadata.gitHead || "unavailable")}
validationGitHead: ${safeScalar(sourceMetadata.validationGitHead || sourceMetadata.gitHead || "unavailable")}
validationTimestamp: ${sourceMetadata.validationTimestamp || sourceMetadata.timestamp || "unavailable"}
sourceCheckpointTimestamp: ${sourceMetadata.timestamp || "unavailable"}
destination: ${safeScalar(destination)}
---

# Portable work handoff

> Exported from a local continuity checkpoint. Reconcile every claim in the destination workspace before acting. Gitignored and absolute local pointers may not travel with this file.

## Export-time reconciliation

| Claim | Status | Evidence |
| --- | --- | --- |
${reconciliationTable}

${reconciliation.document.replace(/^---[\s\S]*?---\s*/, "")}`;
  const portable = redactPortable(body, project);
  writeTextAtomic(output, portable);
  return { path: output, document: portable };
}

export function removeFileIfEmptyJson(path, wasCreated) {
  if (!wasCreated || !existsSync(path)) return false;
  const value = readJson(path, {});
  const hooksEmpty = !value.hooks || Object.values(value.hooks).every((items) => Array.isArray(items) && items.length === 0);
  const otherKeys = Object.keys(value).filter((key) => !["version", "description", "hooks", "env"].includes(key));
  const envEmpty = !value.env || Object.keys(value.env).length === 0;
  if (hooksEmpty && otherKeys.length === 0 && envEmpty) {
    unlinkSync(path);
    return true;
  }
  return false;
}

export function executableAvailable(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], { encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

export function fileInfo(path) {
  return existsSync(path) ? { exists: true, size: statSync(path).size } : { exists: false, size: 0 };
}
