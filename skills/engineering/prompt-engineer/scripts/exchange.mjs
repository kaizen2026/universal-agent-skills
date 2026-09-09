#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const MAX_BYTES = 16384;
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

function rootFor(project, workItem) {
  if (!project) throw new Error("--project is required.");
  let path = realpathSync(resolve(project));
  for (const part of [".agents", "state", "coordination", identity(workItem)]) {
    path = join(path, part);
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error("Exchange directories must be real directories inside the selected project.");
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
  if (!data || data.schemaVersion !== 1 || data.workItemId !== workItem || data.workerId !== worker) throw new Error("Report schema or identity does not match its location.");
  identity(data.assignmentId);
  if (!statuses.has(data.status)) throw new Error("Unknown reported status.");
  if (typeof data.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(data.updatedAt) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Report needs a UTC timestamp.");
  return {
    schemaVersion: 1, workItemId: workItem, workerId: worker,
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
}

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function semantic(report) { const { updatedAt, ...content } = report; return content; }

export function status(project, workItem) {
  const root = rootFor(project, workItem);
  const names = existsSync(root) ? readdirSync(root).filter(name => name.endsWith(".json")).sort() : [];
  if (names.length > 100) throw new Error("More than 100 reports: select a smaller work item.");
  const reports = [], invalid = [];
  for (const name of names) {
    const worker = name.slice(0, -5);
    try {
      identity(worker);
      const report = readReport(join(root, name), workItem, worker);
      reports.push({ workerId: worker, assignmentId: report.assignmentId, reportedStatus: report.status, updatedAt: report.updatedAt, digest: digest(semantic(report)) });
    } catch (error) {
      invalid.push({ file: ID.test(worker) ? name : "invalid-report-name", reason: redact(error.message) });
    }
  }
  const revision = digest({ reports: reports.map(({ updatedAt, ...rest }) => rest), invalid });
  return { workItemId: workItem, digest: revision, observation: "Worker-reported state; live session activity and results are unverified.", reports, invalid };
}

export function read(project, workItem, worker) {
  const path = join(rootFor(project, workItem), `${identity(worker)}.json`);
  const report = readReport(path, workItem, worker);
  return { observation: "Unverified worker claims; reconcile assignment, commit, diff, and checks before acting.", digest: digest(semantic(report)), report };
}

export async function watch(project, workItem, after, timeoutSeconds = 60, intervalMs = 500) {
  if (!/^[a-f0-9]{64}$/.test(after || "")) throw new Error("--after must be the digest returned by status.");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 60) throw new Error("--timeout must be greater than zero and at most 60 seconds.");
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (true) {
    const current = status(project, workItem);
    if (current.digest !== after) return { changed: true, ...current };
    if (Date.now() >= deadline) return { changed: false, digest: after, reason: "deadline-reached" };
    await delay(Math.min(intervalMs, deadline - Date.now()));
  }
}

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") {
    return { usage: "status|read|watch --project PATH --work-item ID [--worker ID] [--after DIGEST --timeout SECONDS]", effects: "Read-only; no network, model calls, dispatch, or daemon." };
  }
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--project", "--work-item", "--worker", "--after", "--timeout"].includes(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--") || Object.hasOwn(args, rest[i])) throw new Error("Unknown, duplicate, or valueless argument.");
    args[rest[i]] = rest[i + 1];
  }
  if (command === "status") return status(args["--project"], args["--work-item"]);
  if (command === "read") return read(args["--project"], args["--work-item"], args["--worker"]);
  if (command === "watch") return watch(args["--project"], args["--work-item"], args["--after"], Number(args["--timeout"] ?? 60));
  throw new Error("Unknown command; use status, read, or watch.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
}
