import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(repository, path), "utf8");

test("frontend-design gates product prerequisites and keeps approval human-owned", () => {
  const skill = read("skills/engineering/frontend-design/SKILL.md");
  for (const phrase of [
    "Product intent and success criteria",
    "Primary audience",
    "In-scope flows",
    "Target platform",
    "exactly three",
    "desktop and one mobile screenshot",
    "explicitly selects or approves",
    "Status: Draft",
  ]) assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(skill, /Every prerequisite must be explicitly resolved/);
  assert.match(skill, /true greenfield repository[\s\S]*isolated exploration scaffold/i);
  assert.match(skill, /route it back to `\/wayfinder`/);
  assert.match(skill, /`\/grilling`/);
  assert.match(skill, /automated screenshots are unavailable[\s\S]*manual capture steps[\s\S]*wait/i);
});

test("design contract covers production states, evidence, accessibility, and acceptance", () => {
  const contract = read("skills/engineering/frontend-design/references/DESIGN-CONTRACT.md");
  for (const heading of [
    "Selected direction",
    "Design principles",
    "Tokens and typography",
    "Layout and responsive behavior",
    "Component anatomy",
    "Loading",
    "Empty",
    "Error",
    "Disabled and permissions",
    "Interaction and motion",
    "Accessibility requirements",
    "Evidence",
    "Non-goals",
    "Implementation acceptance criteria",
  ]) assert.match(contract, new RegExp(`#+ ${heading}`));
});

test("frontend build and review fail closed on missing decisions or tooling", () => {
  const build = read("skills/engineering/frontend-build/SKILL.md");
  const review = read("skills/engineering/frontend-review/SKILL.md");
  assert.match(build, /require `Status: Approved`/);
  assert.match(build, /loading, empty, error, disabled, permission, success, and validation states/);
  assert.match(build, /unavailable browser or accessibility tooling as unverified, not passed/i);
  assert.match(review, /Review the rendered product, not just the component source/);
  assert.match(review, /Findings/);
  assert.match(review, /Verified/);
  assert.match(review, /Unverified/);
  assert.match(review, /Never translate a missing capability into a pass/);
  assert.match(review, /Disposition/);
  assert.match(review, /wholly unverified is always `Incomplete`/);
  assert.match(build, /runs it exactly once/);
  assert.match(build, /Do not invoke the final review from this build skill/);
});

test("upstream routing keeps prototype logic and delegates visual work", () => {
  const prototype = read("skills/engineering/prototype/SKILL.md");
  const logic = read("skills/engineering/prototype/LOGIC.md");
  const wayfinder = read("skills/engineering/wayfinder/SKILL.md");
  const implement = read("skills/engineering/implement/SKILL.md");
  const review = read("skills/engineering/code-review/SKILL.md");
  assert.match(prototype, /logic \/ state model feel right/);
  assert.match(prototype, /invoke `\/frontend-design`/);
  assert.match(logic, /Keep it pure/);
  assert.match(wayfinder, /Route logic or state-model questions to `\/prototype`/);
  assert.match(wayfinder, /Route visual-decision questions to `\/frontend-design` only after/);
  assert.match(implement, /approved contract clearly governs the feature[\s\S]*invoke `\/frontend-build`/);
  assert.match(implement, /prescribed maintenance change that introduces no visual decision/);
  assert.match(implement, /committed, staged, unstaged, and untracked work/);
  assert.match(review, /Frontend lane/);
  assert.match(review, /independent/);
  assert.match(review, /git diff --cached/);
  assert.match(review, /git ls-files --others --exclude-standard/);
  assert.match(prototype, /never resurrect a local UI-prototype path/);
});
