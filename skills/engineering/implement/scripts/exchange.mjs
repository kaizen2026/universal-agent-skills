#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const MAX_BYTES = 16384;
const MAX_WATCH_SECONDS = 300;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const statuses = new Set(["working", "blocked", "ready-for-review", "complete"]);
const outcomes = new Set(["passed", "failed", "unverified"]);

function identity(value) {
  if (typeof value !== "string" || !ID.test(value)) throw new Error("Invalid identity: use 1-64 lowercase letters, digits, or hyphens.");
  return value;
}

function redact(value) {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{12,}|github_pat_[\w]{12,})\b/g, "[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|passwd|token|secret|api[-_]?key|cookie|authorization)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
}

function text(value, limit, required = false) {
  if (typeof value !== "string" || (required && !value.trim())) throw new Error("Report text is missing or has the wrong type.");
  if (value.length > limit) throw new Error("Report text exceeds its field limit.");
  return redact(value);
}

function array(value, limit, map) {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Report array is missing or too large.");
  return value.map(map);
}

function rootFor(project, workItem, create = false) {
  if (!project) throw new Error("--project is required.");
  let path = realpathSync(resolve(project));
  for (const part of [".agents", "state", "coordination", ...(workItem === undefined ? [] : [identity(workItem)])]) {
    path = join(path, part);
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error("Exchange directories must be real directories inside the selected project.");
    }
    if (!info && create) {
      try { mkdirSync(path); }
      catch (error) {
        const raced = lstatSync(path, { throwIfNoEntry: false });
        if (error.code !== "EEXIST" || !raced?.isDirectory() || raced.isSymbolicLink()) throw error;
      }
    }
  }
  return path;
}

function readReport(path, workItem, worker) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_BYTES) {
    throw new Error("Report must be a regular file of at most 16 KiB.");
  }
  const source = readFileSync(path, "utf8");
  if (Buffer.byteLength(source) > MAX_BYTES) throw new Error("Report exceeds 16 KiB.");
  let data;
  try { data = JSON.parse(source); } catch { throw new Error("Report is not complete valid JSON."); }
  return normalizeReport(data, workItem, worker);
}

function normalizeReport(data, workItem, worker) {
  if (!data || ![1, 2].includes(data.schemaVersion) || data.workItemId !== workItem || data.workerId !== worker) throw new Error("Report schema or identity does not match its location.");
  identity(data.assignmentId);
  if (!statuses.has(data.status)) throw new Error("Unknown reported status.");
  if (typeof data.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(data.updatedAt) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Report needs a UTC timestamp.");
  const report = {
    schemaVersion: data.schemaVersion, workItemId: workItem, workerId: worker,
    assignmentId: data.assignmentId, status: data.status, updatedAt: data.updatedAt,
    workspace: text(data.workspace, 500, true), branch: text(data.branch, 200, true), head: text(data.head, 200, true),
    summary: text(data.summary, 1500, true),
    changes: array(data.changes, 20, value => text(value, 300, true)),
    checks: array(data.checks, 10, check => {
      if (!check || !outcomes.has(check.outcome)) throw new Error("A check must report passed, failed, or unverified.");
      return { command: text(check.command, 500, true), outcome: check.outcome, evidence: text(check.evidence, 500, true) };
    }),
    blockers: array(data.blockers, 10, value => text(value, 500, true)),
    nextSuggestion: text(data.nextSuggestion, 500),
  };
  if (data.schemaVersion === 2) {
    report.task = { title: text(data.task?.title, 300, true), source: text(data.task?.source, 500, true) };
    report.session = { harness: text(data.session?.harness, 80, true), id: text(data.session?.id, 200, true) };
    report.baseHead = text(data.baseHead, 200, true);
    for (const name of ["baseTreeDigest", "treeDigest", "checkedTreeDigest"]) {
      if (data[name] !== "unknown" && !/^[a-f0-9]{64}$/.test(data[name] || "")) throw new Error(`Invalid ${name}.`);
      report[name] = data[name];
    }
    report.artifacts = array(data.artifacts, 10, value => text(value, 500, true));
    report.review = text(data.review, 1500);
  }
  return report;
}

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function semantic(report) { const { updatedAt, ...content } = report; return content; }

export function status(project, workItem) {
  identity(workItem);
  const root = rootFor(project, workItem);
  const names = existsSync(root) ? readdirSync(root).filter(name => name.endsWith(".json")).sort() : [];
  if (names.length > 100) throw new Error("More than 100 reports: select a smaller work item.");
  const reports = [], invalid = [];
  for (const name of names) {
    const worker = name.slice(0, -5);
    try {
      identity(worker);
      const report = readReport(join(root, name), workItem, worker);
      reports.push({ workerId: worker, assignmentId: report.assignmentId, reportedStatus: report.status, updatedAt: report.updatedAt, digest: digest(semantic(report)), ...(report.schemaVersion === 2 ? { task: report.task, workspace: report.workspace, session: report.session } : {}) });
    } catch (error) {
      invalid.push({ file: ID.test(worker) ? name : "invalid-report-name", reason: redact(error.message) });
    }
  }
  const revision = digest({ reports: reports.map(({ updatedAt, ...rest }) => rest), invalid });
  return { workItemId: workItem, digest: revision, observation: "Worker-reported state; live session activity and results are unverified.", reports, invalid };
}

export function read(project, workItem, worker) {
  identity(workItem);
  const path = join(rootFor(project, workItem), `${identity(worker)}.json`);
  const report = readReport(path, workItem, worker);
  return { observation: "Unverified worker claims; reconcile assignment, commit, diff, and checks before acting.", digest: digest(semantic(report)), report };
}

export async function watch(project, workItem, after, timeoutSeconds = MAX_WATCH_SECONDS, intervalMs = 500) {
  if (!/^[a-f0-9]{64}$/.test(after || "")) throw new Error("--after must be the digest returned by status.");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > MAX_WATCH_SECONDS) throw new Error("--timeout must be greater than zero and at most 300 seconds (5 minutes).");
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (true) {
    const current = status(project, workItem);
    if (current.digest !== after) return { changed: true, ...current };
    if (Date.now() >= deadline) return { changed: false, digest: after, reason: "deadline-reached" };
    await delay(Math.min(intervalMs, deadline - Date.now()));
  }
}

// Report discovery is not a session census. No transcripts, process scans, or Git reads.
export function discover(project, query = "") {
  const root = rootFor(project);
  if (!existsSync(root)) return { observation: "No shared reports found; sessions may still exist.", candidates: [], invalid: [] };
  const entries = readdirSync(root, { withFileTypes: true });
  if (entries.length > 100) throw new Error("More than 100 work items; select --work-item explicitly.");
  const candidates = [], invalid = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ID.test(entry.name)) continue;
    try {
      const result = status(project, entry.name);
      invalid.push(...result.invalid.map(item => ({ workItemId: entry.name, ...item })));
      for (const item of result.reports) {
        const candidate = { workItemId: entry.name, ...item };
        if (!query || JSON.stringify(candidate).toLowerCase().includes(query.toLowerCase())) candidates.push(candidate);
        if (candidates.length > 100) throw new Error("More than 100 matching reports; narrow --query.");
      }
    } catch (error) {
      if (/More than 100/.test(error.message)) throw error;
      invalid.push({ workItemId: entry.name, reason: redact(error.message) });
    }
  }
  return { observation: "Worker-reported metadata only. Match task and workspace; never choose by recency alone.", candidates, invalid };
}

// Fingerprint current Git evidence, never the meaning or freshness of a test claim.
export function snapshot(project) {
  const workspace = realpathSync(resolve(project));
  let gitRoot = workspace;
  const git = args => execFileSync("git", ["-c", "core.fsmonitor=false", "-C", gitRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  let head = "unknown", branch = "unknown";
  try {
    gitRoot = realpathSync(git(["rev-parse", "--show-toplevel"]).trim());
    try { head = git(["rev-parse", "--verify", "HEAD"]).trim(); } catch { /* An unborn Git branch is valid. */ }
    try { branch = git(["symbolic-ref", "--short", "HEAD"]).trim(); } catch { branch = "detached"; }
    const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean).sort();
    if (untracked.length > 1000) throw new Error("Untracked inventory exceeds the snapshot bound.");
    let total = 0;
    const hashes = untracked.map(name => {
      const path = join(gitRoot, name);
      const info = lstatSync(path);
      total += info.size;
      if (!info.isFile() || info.isSymbolicLink() || total > 16 * 1024 * 1024) throw new Error("Untracked evidence is not safely bounded.");
      return [name, createHash("sha256").update(readFileSync(path)).digest("hex")];
    });
    const state = [head, git(["status", "--porcelain=v1", "-z", "--untracked-files=no"]), git(["diff", "--no-ext-diff", "--no-textconv", "--binary"]), git(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary"]), hashes];
    return { workspace, branch, head, treeDigest: digest(state), observation: "Current Git fingerprint; not proof that reported checks ran against it." };
  } catch {
    return { workspace, branch, head, treeDigest: "unknown", observation: "Git evidence unavailable, unsafe, or beyond the snapshot bound. Verification remains manual." };
  }
}

function ignoreReports(project) {
  const path = join(realpathSync(resolve(project)), ".gitignore");
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES)) throw new Error("Cannot safely update .gitignore; configure report exclusion manually.");
  const previous = info ? readFileSync(path, "utf8") : "";
  if (previous.split(/\r?\n/).some(line => [".agents/state/coordination/", "/.agents/state/coordination/"].includes(line.trim()))) return;
  const eol = previous.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(path, `${previous && !previous.endsWith("\n") ? eol : ""}.agents/state/coordination/${eol}`, { flag: info ? "a" : "wx" });
}

async function writeReport(project, data, expected) {
  const normalized = normalizeReport(data, identity(data.workItemId), identity(data.workerId));
  const source = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(source) > MAX_BYTES) throw new Error("Report exceeds 16 KiB after normalization.");
  const root = rootFor(project, data.workItemId, true);
  const path = join(root, `${data.workerId}.json`);
  const lock = join(root, `${data.workerId}.lock`);
  try { mkdirSync(lock); } catch (error) { if (error.code === "EEXIST") throw new Error("Report writer lock exists; do not overwrite or steal it."); throw error; }
  const temporary = join(root, `${data.workerId}.${randomUUID()}.tmp`);
  try {
    const present = lstatSync(path, { throwIfNoEntry: false });
    if (expected === undefined && present) throw new Error("Worker report already exists; use a new worker or publish with its expected digest.");
    if (expected !== undefined && (!present || digest(semantic(readReport(path, data.workItemId, data.workerId))) !== expected)) throw new Error("Report changed; read and reconcile before publishing again.");
    writeFileSync(temporary, source, { flag: "wx", mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { renameSync(temporary, path); break; }
      catch (error) { if (!["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 5) throw error; await delay(30 * (attempt + 1)); }
    }
    return { path, ...read(project, data.workItemId, data.workerId) };
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    rmdirSync(lock);
  }
}

export async function start(project, title, options = {}) {
  title = text(title, 300, true);
  const source = text(options.source || "conversation", 500, true);
  const workItem = identity(options.workItem || `task-${digest(source === "conversation" ? title : source).slice(0,16)}`);
  const worker = identity(options.worker || `worker-${randomUUID().slice(0, 8)}`);
  const assignment = identity(options.assignment || `run-${randomUUID().slice(0, 12)}`);
  const shared = options.sharedProject || project;
  // Validate every directory before changing even the ignore file.
  rootFor(shared, workItem);
  const before = snapshot(project);
  const data = normalizeReport({
    schemaVersion: 2, workItemId: workItem, workerId: worker, assignmentId: assignment,
    task: { title, source }, session: { harness: options.harness || "unknown", id: options.session || "unknown" },
    status: "working", updatedAt: new Date().toISOString(), workspace: before.workspace, branch: before.branch, head: before.head,
    baseHead: before.head, baseTreeDigest: before.treeDigest, treeDigest: "unknown", checkedTreeDigest: "unknown",
    summary: "Implementation started; no outcome is asserted.", changes: [], checks: [], artifacts: [], review: "", blockers: [], nextSuggestion: "",
  }, workItem, worker);
  ignoreReports(shared);
  data.treeDigest = snapshot(project).treeDigest;
  return writeReport(shared, data);
}

export async function publish(project, workItem, worker, assignment, expected, workspace, input) {
  identity(workItem); identity(worker); identity(assignment);
  if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("Input must be a JSON object.");
  if (!/^[a-f0-9]{64}$/.test(expected || "")) throw new Error("Publish requires the digest from start/read or the previous publish.");
  const current = read(project, workItem, worker).report;
  if (current.schemaVersion !== 2 || current.assignmentId !== assignment) throw new Error("Publish requires the existing v2 assignment; never replace a different run.");
  if (realpathSync(resolve(workspace)) !== realpathSync(current.workspace)) throw new Error("Publish workspace does not match this worker.");
  const patch = normalizeReport({ ...current, ...input, schemaVersion: 2, workItemId: workItem, workerId: worker, assignmentId: assignment,
    task: current.task, session: current.session, workspace: current.workspace, baseHead: current.baseHead, baseTreeDigest: current.baseTreeDigest,
    updatedAt: new Date().toISOString(), checkedTreeDigest: input.checkedTreeDigest || "unknown",
  }, workItem, worker);
  const now = snapshot(workspace);
  patch.head = now.head; patch.branch = now.branch; patch.treeDigest = now.treeDigest;
  return writeReport(project, patch, expected);
}

export async function watchResult(project, workItem, worker, assignment, after, timeoutSeconds = MAX_WATCH_SECONDS, intervalMs = 500) {
  identity(workItem); identity(worker); identity(assignment);
  rootFor(project, workItem);
  if (after !== undefined && !/^[a-f0-9]{64}$/.test(after)) throw new Error("--after must be the selected report digest from read or watch-result.");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > MAX_WATCH_SECONDS) throw new Error("--timeout must be greater than zero and at most 300 seconds (5 minutes).");
  if (!Number.isFinite(intervalMs) || intervalMs < 5) throw new Error("Watch interval must be at least 5 milliseconds.");
  const started = performance.now(), deadline = started + timeoutSeconds * 1000;
  const wallStart = Date.now();
  const timing = () => ({ startedAt: new Date(wallStart).toISOString(), deadlineAt: new Date(wallStart + timeoutSeconds * 1000).toISOString(),
    finishedAt: new Date().toISOString(), timeoutSeconds, elapsedMs: Math.round(performance.now() - started) });
  let checks = 0, lastIssue;
  while (true) {
    checks++;
    try {
      const selected = read(project, workItem, worker);
      const report = selected.report;
      lastIssue = undefined;
      if (report.assignmentId === assignment && selected.digest !== after && ["blocked", "ready-for-review", "complete"].includes(report.status)) {
        return { event: report.status === "blocked" ? "needs-attention" : "review-ready", workItemId: workItem, workerId: worker, assignmentId: assignment,
          reportedStatus: report.status, reportUpdatedAt: report.updatedAt, digest: selected.digest, path: join(rootFor(project, workItem), `${worker}.json`),
          observation: "Unverified worker result. Notification is not a review, a successful task, or a live session signal.", fileChecks: checks, ...timing() };
      }
    } catch (error) {
      lastIssue = error.code === "ENOENT" ? "No report yet." : redact(error.message);
    }
    if (performance.now() >= deadline) return { event: "deadline-reached", workItemId: workItem, workerId: worker, assignmentId: assignment, fileChecks: checks, ...timing(), ...(lastIssue ? { lastIssue } : {}) };
    await delay(Math.min(intervalMs, Math.max(0, deadline - performance.now())));
  }
}

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") {
    return { usage: "discover|snapshot|start|publish|status|read|watch|watch-result --project PATH [--help]", effects: "Only start/publish write reports; start also adds their Git ignore. No network, model calls, dispatch, hooks, or daemon.",
      commands: { discover: "[--query TEXT]", snapshot: "Current Git fingerprint, not validation", start: "--task TITLE [--source REF --work-item ID --worker ID --assignment ID --shared-project PATH --harness NAME --session ID]", publish: "--work-item ID --worker ID --assignment ID --expected-digest DIGEST --workspace PATH --input FILE", read: "--work-item ID --worker ID", status: "--work-item ID", watch: "--work-item ID --after STATUS_DIGEST [--timeout 300] (legacy metadata watch)", "watch-result": "--work-item ID --worker ID --assignment ID [--after REPORT_DIGEST --timeout 300]" } };
  }
  const flags = {
    discover: ["--query"], snapshot: [],
    start: ["--task", "--source", "--work-item", "--worker", "--assignment", "--shared-project", "--harness", "--session"],
    publish: ["--work-item", "--worker", "--assignment", "--expected-digest", "--workspace", "--input"],
    status: ["--work-item"], read: ["--work-item", "--worker"],
    watch: ["--work-item", "--after", "--timeout"],
    "watch-result": ["--work-item", "--worker", "--assignment", "--after", "--timeout"],
  };
  if (!Object.hasOwn(flags, command)) throw new Error("Unknown command; use help to list commands.");
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--project", ...flags[command]].includes(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--") || Object.hasOwn(args, rest[i])) throw new Error("Unknown, duplicate, or valueless argument.");
    args[rest[i]] = rest[i + 1];
  }
  if (!args["--project"]) throw new Error("--project is required.");
  if (command === "discover") return discover(args["--project"], args["--query"]);
  if (command === "snapshot") return snapshot(args["--project"]);
  if (command === "start") return start(args["--project"], args["--task"], { source: args["--source"], workItem: args["--work-item"], worker: args["--worker"], assignment: args["--assignment"], sharedProject: args["--shared-project"], harness: args["--harness"], session: args["--session"] });
  if (command === "publish") {
    if (!args["--workspace"] || !args["--input"]) throw new Error("Publish requires --workspace and --input.");
    const info = lstatSync(args["--input"]);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error("Input must be a regular file of at most 16 KiB.");
    const input = JSON.parse(readFileSync(args["--input"], "utf8"));
    if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("Input must be a JSON object.");
    return publish(args["--project"], args["--work-item"], args["--worker"], args["--assignment"], args["--expected-digest"], args["--workspace"], input);
  }
  if (command === "status") return status(args["--project"], args["--work-item"]);
  if (command === "read") return read(args["--project"], args["--work-item"], args["--worker"]);
  if (command === "watch") return watch(args["--project"], args["--work-item"], args["--after"], Number(args["--timeout"] ?? MAX_WATCH_SECONDS));
  if (command === "watch-result") return watchResult(args["--project"], args["--work-item"], args["--worker"], args["--assignment"], args["--after"], Number(args["--timeout"] ?? MAX_WATCH_SECONDS));
  throw new Error("Unknown command; use help to list commands.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
}
