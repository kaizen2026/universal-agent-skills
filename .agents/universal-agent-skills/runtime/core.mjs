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

export const SCHEMA_VERSION = 1;
export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  thresholdTokens: 155000,
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

export function effectiveThreshold(thresholdTokens = 155000, contextWindow) {
  const configured = positiveInteger(thresholdTokens, 155000);
  const detected = Number(contextWindow);
  if (Number.isFinite(detected) && detected > 0 && detected < 200000) {
    return Math.min(configured, Math.floor(detected * 0.75));
  }
  return configured;
}

export function thresholdReport(config, contextWindow) {
  const detected = Number(contextWindow);
  const effective = effectiveThreshold(config.thresholdTokens, detected);
  return {
    configuredTokens: positiveInteger(config.thresholdTokens, 155000),
    detectedContextWindow: Number.isFinite(detected) && detected > 0 ? detected : null,
    contextWindowVerified: Number.isFinite(detected) && detected > 0,
    effectiveTokens: effective,
    clamped: Number.isFinite(detected) && detected > 0 && detected < 200000,
    effectivePercent:
      Number.isFinite(detected) && detected > 0
        ? Math.max(1, Math.min(100, Math.floor((effective / detected) * 100)))
        : null,
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function loadConfig(project) {
  const path = resolveWithin(project, ".agents/universal-agent-skills/config.json");
  const existing = readJson(path, {});
  const config = { ...DEFAULT_CONFIG, ...existing };
  validateConfig(config);
  return { config, path };
}

export function ensureConfig(project) {
  const path = resolveWithin(project, ".agents/universal-agent-skills/config.json");
  const existing = readJson(path, {});
  const config = { ...DEFAULT_CONFIG, ...existing };
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
  if (!Number.isInteger(config.thresholdTokens) || config.thresholdTokens <= 0) {
    throw new Error("thresholdTokens must be a positive integer");
  }
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
    updated = setFrontmatterValue(updated, "schemaVersion", String(SCHEMA_VERSION));
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
schemaVersion: ${SCHEMA_VERSION}
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
  if (metadata.schemaVersion !== String(SCHEMA_VERSION)) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
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
schemaVersion: ${SCHEMA_VERSION}
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
