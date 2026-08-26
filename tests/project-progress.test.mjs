import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = join(repository, "skills/engineering/project-progress/scripts/render-dashboard.mjs");

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function run(project, ...args) {
  return spawnSync(process.execPath, [renderer, "--project", project, ...args], {
    encoding: "utf8",
  });
}

function fixture(project) {
  write(join(project, "plans/map.md"), "# Delivery map\n");
  write(join(project, "plans/issues/01-decide.md"), [
    "# Decide the boundary",
    "",
    "Status: closed",
    "Assignee: Codex",
    "Blocked by: None",
    "",
  ].join("\n"));
  write(join(project, "plans/issues/02-build.md"), [
    "# Build the slice",
    "",
    "Status: in-progress",
    "Assignee: Codex",
    "Blocked by: [Decide the boundary](./01-decide.md) - resolved",
    "",
  ].join("\n"));
  write(join(project, "plans/issues/03-validate.md"), [
    "# Validate the slice",
    "",
    "Status: open",
    "Assignee: unassigned",
    "Blocked by: [Decide the boundary](./01-decide.md) - resolved",
    "",
  ].join("\n"));
  write(join(project, "docs/decision.md"), "# Decision\n");
  write(join(project, "docs/prototype.html"), "<!doctype html><title>Prototype</title>\n");
  write(join(project, "docs/project-progress.json"), JSON.stringify({
    schemaVersion: 1,
    project: {
      name: "Fixture Project",
      subtitle: "Renderer acceptance fixture",
      reviewedOn: "2026-08-26",
      northStar: "A real end-to-end slice",
      currentTruth: "Decisions exist; production implementation remains in progress.",
    },
    progressRules: ["Prototype evidence is not production code."],
    sources: [{
      id: "delivery-map",
      name: "Delivery map",
      type: "local-markdown-map",
      mapPath: "plans/map.md",
      issuesDirectory: "plans/issues",
      summary: "Tracks the fixture decisions.",
      scopeNote: "Closing the map does not deploy the product.",
    }],
    routes: [{
      id: "finish-slice",
      name: "Finish one slice",
      recommended: true,
      horizon: "Now",
      outcome: "A testable browser journey",
      why: "It is the nearest useful proof.",
      doesNotDeliver: "Production operations remain later.",
      steps: ["Finish implementation", "Run the end-to-end test"],
      suggestedSkills: [{ name: "implement", reason: "Build the approved slice." }],
      discussionTopics: ["Acceptance journey", "Authority boundary"],
    }],
    milestones: [
      { id: "decide", name: "Decide", state: "complete", detail: "The boundary is recorded." },
      { id: "build", name: "Build", state: "next", detail: "Production-intended code is next." },
    ],
    workstreams: [{
      id: "core-slice",
      name: "Core slice",
      lane: "now",
      summary: "Definition is complete and implementation is in progress.",
      next: "Pass the real journey.",
      stages: {
        defined: "complete",
        designed: "partial",
        prototyped: "complete",
        implemented: "in-progress",
        validated: "not-started",
        operational: "not-started",
      },
      evidence: [{ label: "Boundary decision", path: "docs/decision.md" }],
    }],
    journeys: [{
      actor: "User",
      flow: "Sign in → perform action → see result",
      proof: "A passing browser test against the real data boundary",
    }],
    artifacts: [{
      name: "Logic prototype",
      kind: "throwaway prototype",
      status: "Reviewed",
      meaning: "Answers a question but does not implement the product.",
      path: "docs/prototype.html",
    }],
  }, null, 2));
}

test("project-progress renders, parses a local frontier, and detects stale output", () => {
  const project = mkdtempSync(join(tmpdir(), "project-progress-"));
  try {
    fixture(project);
    const rendered = run(project);
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.stdout, /1\/3 closed tracked item/);

    const dashboardPath = join(project, "docs/project-progress.html");
    const dashboard = readFileSync(dashboardPath, "utf8");
    assert.match(dashboard, /data-generated-by="project-progress"/);
    assert.match(dashboard, /<strong>1 \/ 3<\/strong><span>tracked items closed<\/span>/);
    assert.match(dashboard, /Build the slice/);
    assert.match(dashboard, /Validate the slice/);
    assert.match(dashboard, /Unclaimed frontier/);
    assert.match(dashboard, /does not mean the project is 33% built/);
    assert.match(dashboard, /Suggested skills/);
    assert.match(dashboard, /\/implement/);
    assert.match(dashboard, /\$implement/);
    assert.match(dashboard, /Topics to settle/);
    assert.match(dashboard, /\.workstream \{ min-width:0;/);
    assert.match(dashboard, /\.stage-grid \{ width:100%; max-width:100%; min-width:0;[^}]+overflow-x:auto;/);
    assert.doesNotMatch(dashboard, /<script\s+[^>]*src=/i);
    assert.doesNotMatch(dashboard, /<link\s+[^>]*rel=["']stylesheet/i);

    const current = run(project, "--check");
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, /dashboard is current/i);

    const issuePath = join(project, "plans/issues/03-validate.md");
    writeFileSync(issuePath, readFileSync(issuePath, "utf8").replace("Status: open", "Status: closed"), "utf8");
    const stale = run(project, "--check");
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /Dashboard is stale/);

    assert.equal(run(project).status, 0);
    assert.equal(run(project, "--check").status, 0);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("project-progress keeps output and local evidence inside the project", () => {
  const project = mkdtempSync(join(tmpdir(), "project-progress-"));
  try {
    fixture(project);
    const escaped = run(project, "--output", "../outside.html");
    assert.notEqual(escaped.status, 0);
    assert.match(escaped.stderr, /must stay inside the project root/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
