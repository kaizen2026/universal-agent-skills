#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const STAGES = ["defined", "designed", "prototyped", "implemented", "validated", "operational"];
const STATES = new Set([
  "complete",
  "partial",
  "in-progress",
  "next",
  "blocked",
  "not-started",
  "not-applicable",
  "unknown",
]);
const LANES = new Set(["now", "next", "later", "platform"]);

function parseArgs(values) {
  const args = { check: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--check") args.check = true;
    else if (value === "--project" || value === "--model" || value === "--output") {
      const next = values[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value`);
      args[value.slice(2)] = next;
      index += 1;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Render an evidence-based project progress dashboard.",
    "",
    "Usage:",
    "  node render-dashboard.mjs [--project PATH] [--model PATH] [--output PATH] [--check]",
    "",
    "Defaults:",
    "  --project  current working directory",
    "  --model    docs/project-progress.json",
    "  --output   docs/project-progress.html",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
}

function assertUniqueIds(values, label) {
  const ids = new Set();
  values.forEach((value, index) => {
    assertObject(value, `${label}[${index}]`);
    assertString(value.id, `${label}[${index}].id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) fail(`${label}[${index}].id must be kebab-case`);
    if (ids.has(value.id)) fail(`${label} contains duplicate id ${value.id}`);
    ids.add(value.id);
  });
}

function validateReference(reference, label) {
  assertObject(reference, label);
  assertString(reference.label, `${label}.label`);
  if (Boolean(reference.path) === Boolean(reference.url)) fail(`${label} must contain exactly one of path or url`);
  if (reference.path) assertString(reference.path, `${label}.path`);
  if (reference.url) assertString(reference.url, `${label}.url`);
}

function validateModel(model) {
  assertObject(model, "model");
  if (model.schemaVersion !== 1) fail("model.schemaVersion must be 1");
  assertObject(model.project, "model.project");
  for (const field of ["name", "reviewedOn", "northStar", "currentTruth"]) {
    assertString(model.project[field], `model.project.${field}`);
  }
  if (model.project.subtitle !== undefined && typeof model.project.subtitle !== "string") {
    fail("model.project.subtitle must be a string when present");
  }
  for (const field of ["progressRules", "sources", "routes", "milestones", "workstreams", "journeys", "artifacts"]) {
    assertArray(model[field], `model.${field}`);
  }
  model.progressRules.forEach((rule, index) => assertString(rule, `model.progressRules[${index}]`));
  assertUniqueIds(model.sources, "model.sources");
  assertUniqueIds(model.routes, "model.routes");
  assertUniqueIds(model.milestones, "model.milestones");
  assertUniqueIds(model.workstreams, "model.workstreams");

  model.sources.forEach((source, index) => {
    const label = `model.sources[${index}]`;
    for (const field of ["name", "type", "summary", "scopeNote"]) assertString(source[field], `${label}.${field}`);
    if (source.type === "local-markdown-map") {
      assertString(source.mapPath, `${label}.mapPath`);
      assertString(source.issuesDirectory, `${label}.issuesDirectory`);
    } else if (source.type === "snapshot") {
      assertString(source.url, `${label}.url`);
      assertString(source.reviewedOn, `${label}.reviewedOn`);
      assertObject(source.counts, `${label}.counts`);
      for (const key of ["closed", "claimed", "frontier", "blocked"]) {
        if (!Number.isInteger(source.counts[key]) || source.counts[key] < 0) fail(`${label}.counts.${key} must be a non-negative integer`);
      }
      for (const key of ["claimedItems", "frontierItems"]) {
        if (source[key] !== undefined) {
          assertArray(source[key], `${label}.${key}`);
          source[key].forEach((item, itemIndex) => {
            assertObject(item, `${label}.${key}[${itemIndex}]`);
            assertString(item.name, `${label}.${key}[${itemIndex}].name`);
            assertString(item.url, `${label}.${key}[${itemIndex}].url`);
          });
        }
      }
    } else {
      fail(`${label}.type must be local-markdown-map or snapshot`);
    }
  });

  const recommendedRoutes = model.routes.filter((route) => route.recommended === true).length;
  if (recommendedRoutes > 1) fail("model.routes may contain at most one recommended route");
  model.routes.forEach((route, index) => {
    const label = `model.routes[${index}]`;
    for (const field of ["name", "horizon", "outcome", "why", "doesNotDeliver"]) assertString(route[field], `${label}.${field}`);
    if (typeof route.recommended !== "boolean") fail(`${label}.recommended must be boolean`);
    assertArray(route.steps, `${label}.steps`);
    route.steps.forEach((step, stepIndex) => assertString(step, `${label}.steps[${stepIndex}]`));
    assertArray(route.suggestedSkills, `${label}.suggestedSkills`);
    route.suggestedSkills.forEach((skill, skillIndex) => {
      assertObject(skill, `${label}.suggestedSkills[${skillIndex}]`);
      assertString(skill.name, `${label}.suggestedSkills[${skillIndex}].name`);
      assertString(skill.reason, `${label}.suggestedSkills[${skillIndex}].reason`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) fail(`${label}.suggestedSkills[${skillIndex}].name must be kebab-case without an invocation prefix`);
    });
    assertArray(route.discussionTopics, `${label}.discussionTopics`);
    route.discussionTopics.forEach((topic, topicIndex) => assertString(topic, `${label}.discussionTopics[${topicIndex}]`));
  });

  model.milestones.forEach((milestone, index) => {
    const label = `model.milestones[${index}]`;
    for (const field of ["name", "state", "detail"]) assertString(milestone[field], `${label}.${field}`);
    if (!STATES.has(milestone.state)) fail(`${label}.state is not recognized`);
  });

  model.workstreams.forEach((workstream, index) => {
    const label = `model.workstreams[${index}]`;
    for (const field of ["name", "lane", "summary", "next"]) assertString(workstream[field], `${label}.${field}`);
    if (!LANES.has(workstream.lane)) fail(`${label}.lane is not recognized`);
    assertObject(workstream.stages, `${label}.stages`);
    STAGES.forEach((stage) => {
      if (!STATES.has(workstream.stages[stage])) fail(`${label}.stages.${stage} is not recognized`);
    });
    assertArray(workstream.evidence, `${label}.evidence`);
    workstream.evidence.forEach((item, itemIndex) => validateReference(item, `${label}.evidence[${itemIndex}]`));
  });

  model.journeys.forEach((journey, index) => {
    const label = `model.journeys[${index}]`;
    assertObject(journey, label);
    for (const field of ["actor", "flow", "proof"]) assertString(journey[field], `${label}.${field}`);
  });

  model.artifacts.forEach((artifact, index) => {
    const label = `model.artifacts[${index}]`;
    assertObject(artifact, label);
    for (const field of ["name", "kind", "status", "meaning"]) assertString(artifact[field], `${label}.${field}`);
    if (Boolean(artifact.path) === Boolean(artifact.url)) fail(`${label} must contain exactly one of path or url`);
  });
}

function insideProject(projectRoot, value, label) {
  const absolute = resolve(projectRoot, value);
  const child = relative(projectRoot, absolute);
  if (child === "" || (!child.startsWith("..") && !isAbsolute(child))) return absolute;
  fail(`${label} must stay inside the project root`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function humanize(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeIssueStatus(value) {
  const normalized = String(value || "unknown").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["closed", "done", "resolved", "complete", "completed"].includes(normalized)) return "closed";
  if (["in-progress", "active", "claimed", "doing"].includes(normalized)) return "in-progress";
  if (["open", "unstarted", "pending", "todo"].includes(normalized)) return "open";
  return "unknown";
}

function field(source, name) {
  const match = source.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"));
  return match ? match[1].trim() : "";
}

function parseLocalMap(projectRoot, source) {
  const mapAbsolute = insideProject(projectRoot, source.mapPath, `${source.id}.mapPath`);
  const issuesAbsolute = insideProject(projectRoot, source.issuesDirectory, `${source.id}.issuesDirectory`);
  if (!existsSync(mapAbsolute) || !statSync(mapAbsolute).isFile()) fail(`${source.id}: map file not found: ${source.mapPath}`);
  if (!existsSync(issuesAbsolute) || !statSync(issuesAbsolute).isDirectory()) {
    fail(`${source.id}: issues directory not found: ${source.issuesDirectory}`);
  }

  const issuePaths = readdirSync(issuesAbsolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => resolve(issuesAbsolute, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const issues = issuePaths.map((issuePath) => {
    const markdown = readFileSync(issuePath, "utf8");
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || relative(projectRoot, issuePath);
    const status = normalizeIssueStatus(field(markdown, "Status"));
    const assignee = field(markdown, "Assignee") || "unknown";
    const blockedBy = field(markdown, "Blocked by");
    const blockerPaths = [...blockedBy.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)]
      .map((match) => resolve(dirname(issuePath), decodeURIComponent(match[1])))
      .filter((value, index, values) => values.indexOf(value) === index);
    const explicitNone = /^(none|n\/a)(?:\b|\s|[-—])/i.test(blockedBy);
    const assigned = !/^(|unassigned|none|unknown|n\/a)$/i.test(assignee);
    return {
      title,
      status,
      assignee,
      assigned,
      blockedBy,
      blockerPaths,
      explicitNone,
      absolute: issuePath,
      projectPath: relative(projectRoot, issuePath).replaceAll("\\", "/"),
    };
  });

  const issueByPath = new Map(issues.map((issue) => [issue.absolute.toLowerCase(), issue]));
  for (const issue of issues) {
    const blockersKnown = issue.blockerPaths.every((blocker) => issueByPath.has(blocker.toLowerCase()));
    const blockersClosed = blockersKnown && issue.blockerPaths.every((blocker) => issueByPath.get(blocker.toLowerCase()).status === "closed");
    const dependencyReady = issue.explicitNone || (issue.blockerPaths.length > 0 && blockersClosed);
    issue.bucket = issue.status === "closed"
      ? "closed"
      : issue.assigned || issue.status === "in-progress"
        ? "claimed"
        : issue.status === "open" && dependencyReady
          ? "frontier"
          : issue.status === "open" && issue.blockerPaths.length > 0 && blockersKnown
            ? "blocked"
            : "unknown";
  }

  const counts = { total: issues.length, closed: 0, claimed: 0, frontier: 0, blocked: 0, unknown: 0 };
  issues.forEach((issue) => { counts[issue.bucket] += 1; });
  return {
    ...source,
    href: source.mapPath,
    counts,
    claimedItems: issues.filter((issue) => issue.bucket === "claimed").map(issueItem),
    frontierItems: issues.filter((issue) => issue.bucket === "frontier").map(issueItem),
    blockedItems: issues.filter((issue) => issue.bucket === "blocked").map(issueItem),
    unknownItems: issues.filter((issue) => issue.bucket === "unknown").map(issueItem),
  };
}

function issueItem(issue) {
  return { name: issue.title, path: issue.projectPath, assignee: issue.assignee };
}

function parseSnapshot(source) {
  const counts = { unknown: 0, ...source.counts };
  counts.total = Number.isInteger(source.counts.total)
    ? source.counts.total
    : counts.closed + counts.claimed + counts.frontier + counts.blocked + counts.unknown;
  return {
    ...source,
    href: source.url,
    counts,
    claimedItems: source.claimedItems || [],
    frontierItems: source.frontierItems || [],
    blockedItems: source.blockedItems || [],
    unknownItems: source.unknownItems || [],
  };
}

function collectLocalPaths(model) {
  const values = [];
  for (const source of model.sources) {
    if (source.type === "local-markdown-map") values.push(source.mapPath, source.issuesDirectory);
  }
  for (const workstream of model.workstreams) {
    for (const evidence of workstream.evidence) if (evidence.path) values.push(evidence.path);
  }
  for (const artifact of model.artifacts) if (artifact.path) values.push(artifact.path);
  return [...new Set(values)];
}

function hrefFor(projectRoot, outputAbsolute, target) {
  if (/^https?:\/\//i.test(target)) return target;
  const absolute = insideProject(projectRoot, target, `link ${target}`);
  const link = relative(dirname(outputAbsolute), absolute).replaceAll("\\", "/");
  return encodeURI(link || ".");
}

function referenceHref(reference, projectRoot, outputAbsolute) {
  return hrefFor(projectRoot, outputAbsolute, reference.path || reference.url);
}

function renderItemLinks(items, projectRoot, outputAbsolute, emptyMessage) {
  if (!items || items.length === 0) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  return `<ul class="compact-list">${items.map((item) => {
    const target = item.path || item.url;
    const suffix = item.assignee && !/^(unknown|unassigned)$/i.test(item.assignee) ? ` · ${escapeHtml(item.assignee)}` : "";
    return `<li><a href="${escapeHtml(hrefFor(projectRoot, outputAbsolute, target))}">${escapeHtml(item.name)}</a>${suffix}</li>`;
  }).join("")}</ul>`;
}

function stateBadge(state) {
  return `<span class="badge state-${escapeHtml(state)}"><span class="badge-mark" aria-hidden="true"></span>${escapeHtml(humanize(state))}</span>`;
}

function renderDashboard(model, maps, projectRoot, outputAbsolute) {
  const totals = maps.reduce((result, map) => {
    for (const key of ["total", "closed", "claimed", "frontier", "blocked", "unknown"]) result[key] += map.counts[key] || 0;
    return result;
  }, { total: 0, closed: 0, claimed: 0, frontier: 0, blocked: 0, unknown: 0 });
  const implemented = model.workstreams.filter((item) => item.stages.implemented === "complete").length;
  const validated = model.workstreams.filter((item) => item.stages.validated === "complete").length;
  const operational = model.workstreams.filter((item) => item.stages.operational === "complete").length;
  const nextMilestone = model.milestones.find((item) => item.state === "next") || model.milestones.find((item) => item.state === "in-progress");
  const initialRoute = model.routes.find((route) => route.recommended) || model.routes[0];
  const subtitle = model.project.subtitle ? `<p class="subtitle">${escapeHtml(model.project.subtitle)}</p>` : "";

  const milestoneHtml = model.milestones.map((milestone, index) => `
    <li class="milestone milestone-${escapeHtml(milestone.state)}">
      <div class="milestone-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div>
      <div>
        <div class="milestone-heading"><h3>${escapeHtml(milestone.name)}</h3>${stateBadge(milestone.state)}</div>
        <p>${escapeHtml(milestone.detail)}</p>
      </div>
    </li>`).join("");

  const routeButtons = model.routes.map((route) => `
    <button class="route-button${route.id === initialRoute?.id ? " is-active" : ""}" type="button" data-route="${escapeHtml(route.id)}" aria-pressed="${route.id === initialRoute?.id}">
      <span class="route-kicker">${escapeHtml(route.horizon)}</span>
      <strong>${escapeHtml(route.name)}</strong>
      ${route.recommended ? '<span class="recommended">Recommended</span>' : ""}
    </button>`).join("");

  const routePanels = model.routes.map((route) => `
    <article class="route-detail" data-route-panel="${escapeHtml(route.id)}"${route.id === initialRoute?.id ? "" : " hidden"}>
      <div class="route-copy">
        <p class="route-outcome">${escapeHtml(route.outcome)}</p>
        <p>${escapeHtml(route.why)}</p>
        <div class="boundary"><strong>Boundary</strong><span>${escapeHtml(route.doesNotDeliver)}</span></div>
      </div>
      <div>
        <ol class="route-steps">${route.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <div class="route-guidance">
          <div>
            <h4>Suggested skills</h4>
            ${route.suggestedSkills.length ? `<ul>${route.suggestedSkills.map((skill) => `<li><span class="skill-invocations"><code>/${escapeHtml(skill.name)}</code><code>$${escapeHtml(skill.name)}</code></span><span>${escapeHtml(skill.reason)}</span></li>`).join("")}</ul>` : '<p class="empty">No specific skill is needed for this route.</p>'}
          </div>
          <div>
            <h4>Topics to settle</h4>
            ${route.discussionTopics.length ? `<ul>${route.discussionTopics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join("")}</ul>` : '<p class="empty">No unresolved discussion topic is recorded.</p>'}
          </div>
        </div>
      </div>
    </article>`).join("");

  const journeyHtml = model.journeys.map((journey) => `
    <article class="journey">
      <p class="journey-actor">${escapeHtml(journey.actor)}</p>
      <p class="journey-flow">${escapeHtml(journey.flow)}</p>
      <p class="journey-proof"><strong>Proof:</strong> ${escapeHtml(journey.proof)}</p>
    </article>`).join("");

  const workstreamHtml = model.workstreams.map((workstream) => `
    <article class="workstream" data-lane="${escapeHtml(workstream.lane)}" data-search="${escapeHtml(`${workstream.name} ${workstream.summary} ${workstream.next}`.toLowerCase())}">
      <div class="workstream-top">
        <div><span class="lane lane-${escapeHtml(workstream.lane)}">${escapeHtml(humanize(workstream.lane))}</span><h3>${escapeHtml(workstream.name)}</h3></div>
        <details>
          <summary>Evidence · ${workstream.evidence.length}</summary>
          ${workstream.evidence.length === 0 ? '<p class="empty">No linked evidence.</p>' : `<ul class="evidence-links">${workstream.evidence.map((evidence) => `<li><a href="${escapeHtml(referenceHref(evidence, projectRoot, outputAbsolute))}">${escapeHtml(evidence.label)}</a></li>`).join("")}</ul>`}
        </details>
      </div>
      <p>${escapeHtml(workstream.summary)}</p>
      <div class="stage-grid" aria-label="Delivery stages">
        ${STAGES.map((stage) => `<div class="stage-cell"><span>${escapeHtml(humanize(stage))}</span>${stateBadge(workstream.stages[stage])}</div>`).join("")}
      </div>
      <p class="next-action"><strong>Next evidence boundary</strong><span>${escapeHtml(workstream.next)}</span></p>
    </article>`).join("");

  const mapHtml = maps.map((map) => `
    <article class="map-card">
      <div class="map-heading">
        <div><span class="source-type">${map.type === "snapshot" ? `Snapshot · ${escapeHtml(map.reviewedOn)}` : "Live local map"}</span><h3><a href="${escapeHtml(hrefFor(projectRoot, outputAbsolute, map.href))}">${escapeHtml(map.name)}</a></h3></div>
        <span class="count-token">${map.counts.closed} / ${map.counts.total} closed</span>
      </div>
      <p>${escapeHtml(map.summary)}</p>
      <p class="scope-note"><strong>Scope boundary:</strong> ${escapeHtml(map.scopeNote)}</p>
      <div class="map-counts" aria-label="Tracker state">
        <span><strong>${map.counts.claimed}</strong> claimed</span>
        <span><strong>${map.counts.frontier}</strong> frontier</span>
        <span><strong>${map.counts.blocked}</strong> blocked</span>
        ${map.counts.unknown ? `<span><strong>${map.counts.unknown}</strong> unknown</span>` : ""}
      </div>
      <div class="map-lists">
        <div><h4>Claimed now</h4>${renderItemLinks(map.claimedItems, projectRoot, outputAbsolute, "Nothing claimed.")}</div>
        <div><h4>Unclaimed frontier</h4>${renderItemLinks(map.frontierItems, projectRoot, outputAbsolute, "No verified frontier item.")}</div>
      </div>
    </article>`).join("");

  const artifactHtml = model.artifacts.map((artifact) => `
    <article class="artifact">
      <div class="artifact-heading"><span class="artifact-kind">${escapeHtml(artifact.kind)}</span><span class="artifact-status">${escapeHtml(artifact.status)}</span></div>
      <h3><a href="${escapeHtml(referenceHref(artifact, projectRoot, outputAbsolute))}">${escapeHtml(artifact.name)}</a></h3>
      <p>${escapeHtml(artifact.meaning)}</p>
    </article>`).join("");

  const rulesHtml = [
    "Tracked-item closure is not overall delivery completion.",
    ...model.progressRules,
  ].map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");

  const clientData = JSON.stringify({ initialRoute: initialRoute?.id || null })
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: file:; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(model.project.name)} · Project progress</title>
  <style>
    :root { --ink:#151515; --muted:#66625d; --paper:#f4f1ec; --panel:#fff; --line:#d7d1c8; --soft:#ebe7e0; --red:#b5121b; --red-dark:#7d0c13; --green:#176b4d; --amber:#8a5a00; --blue:#1c527b; --radius:18px; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:var(--paper); color:var(--ink); font-family:Arial, Helvetica, sans-serif; line-height:1.5; }
    a { color:var(--red-dark); text-underline-offset:3px; }
    a:hover { text-decoration-thickness:2px; }
    button, input, summary { font:inherit; }
    button { color:inherit; }
    :focus-visible { outline:3px solid var(--blue); outline-offset:3px; }
    .skip-link { position:absolute; left:12px; top:-80px; z-index:50; background:var(--ink); color:#fff; padding:10px 14px; }
    .skip-link:focus { top:12px; }
    .shell { width:min(1240px, calc(100% - 32px)); margin:0 auto; }
    .masthead { border-top:7px solid var(--red); background:var(--panel); border-bottom:1px solid var(--line); }
    .masthead-inner { padding:46px 0 40px; display:grid; grid-template-columns:minmax(0, 1.5fr) minmax(260px, .7fr); gap:42px; align-items:end; }
    .eyebrow, .route-kicker, .source-type, .artifact-kind, .lane { text-transform:uppercase; letter-spacing:.11em; font-weight:800; font-size:.72rem; }
    .eyebrow { color:var(--red); margin:0 0 10px; }
    h1 { margin:0; max-width:850px; font-size:clamp(2.3rem, 6vw, 5rem); letter-spacing:-.055em; line-height:.98; }
    .subtitle { margin:14px 0 0; color:var(--muted); font-size:1.05rem; }
    .north-star { border-left:4px solid var(--red); padding-left:18px; }
    .north-star span { display:block; color:var(--muted); font-size:.78rem; text-transform:uppercase; letter-spacing:.1em; font-weight:700; }
    .north-star p { margin:8px 0 0; font-weight:700; }
    .truth-band { background:var(--ink); color:#fff; }
    .truth-inner { padding:24px 0; display:grid; grid-template-columns:1.4fr repeat(4, minmax(120px, .45fr)); gap:18px; align-items:stretch; }
    .truth-copy { padding-right:24px; border-right:1px solid #4b4b4b; }
    .truth-copy strong { display:block; color:#f2a7ac; text-transform:uppercase; letter-spacing:.1em; font-size:.74rem; margin-bottom:6px; }
    .truth-copy p { margin:0; font-size:1.05rem; }
    .metric { padding:4px 0 4px 14px; border-left:1px solid #4b4b4b; }
    .metric strong { display:block; font-size:1.45rem; line-height:1.1; }
    .metric span { color:#bbb; font-size:.77rem; }
    .warning { margin:24px auto 0; padding:14px 18px; background:#fff4e0; border:1px solid #d9b365; display:flex; gap:12px; align-items:flex-start; }
    .warning strong { white-space:nowrap; }
    .tabbar { margin-top:28px; display:flex; flex-wrap:wrap; gap:8px; position:sticky; top:0; z-index:10; background:rgba(244,241,236,.96); padding:10px 0; border-bottom:1px solid var(--line); }
    .tab { border:1px solid var(--line); background:var(--panel); padding:10px 18px; border-radius:999px; cursor:pointer; font-weight:700; }
    .tab[aria-selected="true"] { background:var(--ink); border-color:var(--ink); color:#fff; }
    main { padding-bottom:60px; }
    .tab-panel { padding-top:30px; }
    .section-heading { display:flex; justify-content:space-between; gap:24px; align-items:end; margin-bottom:18px; }
    .section-heading h2 { margin:0; font-size:clamp(1.7rem, 3vw, 2.6rem); letter-spacing:-.035em; }
    .section-heading p { max-width:620px; margin:0; color:var(--muted); }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:clamp(20px, 4vw, 38px); }
    .milestones { list-style:none; margin:0; padding:0; display:grid; gap:0; }
    .milestone { display:grid; grid-template-columns:62px 1fr; gap:16px; padding:18px 0; border-bottom:1px solid var(--line); position:relative; }
    .milestone:last-child { border-bottom:0; }
    .milestone-index { width:46px; height:46px; display:grid; place-items:center; border:2px solid var(--line); border-radius:50%; font-weight:800; color:var(--muted); background:#fff; }
    .milestone-complete .milestone-index, .milestone-substantially-complete .milestone-index { border-color:var(--green); color:var(--green); }
    .milestone-next .milestone-index, .milestone-in-progress .milestone-index { border-color:var(--red); color:var(--red); }
    .milestone-heading { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    .milestone h3 { margin:0; font-size:1.05rem; }
    .milestone p { margin:4px 0 0; color:var(--muted); }
    .badge { display:inline-flex; align-items:center; gap:6px; width:max-content; border:1px solid var(--line); border-radius:999px; padding:4px 8px; font-size:.69rem; font-weight:800; white-space:nowrap; background:#fff; }
    .badge-mark { width:7px; height:7px; border-radius:50%; background:var(--muted); }
    .state-complete .badge-mark { background:var(--green); }
    .state-partial .badge-mark, .state-in-progress .badge-mark, .state-next .badge-mark { background:var(--amber); }
    .state-blocked .badge-mark { background:var(--red); }
    .state-not-started .badge-mark, .state-unknown .badge-mark { background:#8d8d8d; }
    .route-area { margin-top:28px; }
    .route-picker { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
    .route-button { position:relative; text-align:left; border:1px solid var(--line); background:var(--panel); border-radius:14px; padding:18px; cursor:pointer; min-height:112px; }
    .route-button:hover { border-color:var(--ink); }
    .route-button.is-active { border:3px solid var(--red); padding:16px; }
    .route-button strong { display:block; margin-top:8px; font-size:1.03rem; }
    .route-kicker { color:var(--muted); }
    .recommended { display:inline-block; margin-top:10px; background:var(--red); color:#fff; border-radius:999px; padding:3px 8px; font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; }
    .route-detail { margin-top:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:clamp(22px, 4vw, 36px); display:grid; grid-template-columns:.9fr 1.1fr; gap:36px; }
    .route-outcome { font-size:1.28rem; font-weight:800; line-height:1.3; margin-top:0; }
    .boundary { margin-top:22px; border-left:4px solid var(--ink); padding-left:14px; display:grid; gap:3px; }
    .boundary strong { text-transform:uppercase; letter-spacing:.08em; font-size:.72rem; }
    .boundary span { color:var(--muted); }
    .route-steps { margin:0; padding:0 0 0 28px; counter-reset:route; }
    .route-steps li { padding:0 0 16px 8px; }
    .route-guidance { margin-top:10px; padding-top:18px; border-top:1px solid var(--line); display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .route-guidance h4 { margin:0 0 8px; text-transform:uppercase; letter-spacing:.08em; font-size:.72rem; }
    .route-guidance ul { margin:0; padding-left:19px; }
    .route-guidance li + li { margin-top:8px; }
    .skill-invocations { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:3px; }
    .skill-invocations code { background:var(--soft); border:1px solid var(--line); padding:2px 5px; border-radius:5px; font-size:.75rem; }
    .skill-invocations + span { color:var(--muted); font-size:.86rem; }
    .journeys { margin-top:28px; display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
    .journey { background:var(--panel); border:1px solid var(--line); border-top:4px solid var(--ink); padding:20px; }
    .journey-actor { margin:0; color:var(--red); font-weight:900; text-transform:uppercase; letter-spacing:.08em; font-size:.74rem; }
    .journey-flow { font-weight:800; }
    .journey-proof { color:var(--muted); font-size:.9rem; margin-bottom:0; }
    .toolbar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px; align-items:center; }
    .filters { display:flex; flex-wrap:wrap; gap:7px; }
    .filter { border:1px solid var(--line); background:var(--panel); padding:8px 12px; border-radius:999px; cursor:pointer; font-weight:700; font-size:.83rem; }
    .filter[aria-pressed="true"] { background:var(--red); border-color:var(--red); color:#fff; }
    .search { margin-left:auto; min-width:min(100%, 280px); border:1px solid var(--line); background:#fff; padding:9px 12px; border-radius:10px; }
    .workstreams { display:grid; gap:12px; min-width:0; }
    .workstream { min-width:0; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:22px; }
    .workstream[hidden] { display:none; }
    .workstream-top { display:flex; justify-content:space-between; gap:18px; align-items:start; }
    .workstream h3 { margin:7px 0 0; font-size:1.25rem; }
    .lane { color:var(--muted); }
    .lane-now { color:var(--red); }
    .workstream details { min-width:130px; text-align:right; }
    .workstream summary { cursor:pointer; font-size:.84rem; font-weight:800; }
    .evidence-links { text-align:left; margin:12px 0 0; padding-left:20px; }
    .stage-grid { width:100%; max-width:100%; min-width:0; margin-top:18px; display:grid; grid-template-columns:repeat(6, minmax(120px, 1fr)); border:1px solid var(--line); overflow-x:auto; }
    .stage-cell { padding:12px; border-right:1px solid var(--line); min-width:120px; display:grid; gap:8px; align-content:start; }
    .stage-cell:last-child { border-right:0; }
    .stage-cell > span:first-child { font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:800; }
    .next-action { display:grid; grid-template-columns:170px 1fr; gap:12px; padding-top:16px; margin-bottom:0; border-top:1px solid var(--line); }
    .next-action strong { font-size:.75rem; text-transform:uppercase; letter-spacing:.07em; }
    .maps { display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; }
    .map-card { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:22px; }
    .map-heading, .artifact-heading { display:flex; justify-content:space-between; gap:12px; align-items:start; }
    .map-heading h3 { margin:5px 0 0; }
    .source-type, .artifact-kind { color:var(--muted); }
    .count-token { border:1px solid var(--line); padding:5px 8px; white-space:nowrap; font-weight:800; font-size:.78rem; }
    .scope-note { background:var(--soft); padding:12px; font-size:.9rem; }
    .map-counts { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
    .map-counts span { border:1px solid var(--line); padding:6px 9px; font-size:.78rem; }
    .map-lists { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .map-lists h4 { margin-bottom:6px; font-size:.82rem; text-transform:uppercase; letter-spacing:.06em; }
    .compact-list, .evidence-links { font-size:.88rem; }
    .compact-list { margin:0; padding-left:18px; }
    .empty { color:var(--muted); font-size:.86rem; }
    .artifacts { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-top:28px; }
    .artifact { background:var(--panel); border:1px solid var(--line); padding:20px; }
    .artifact h3 { margin:14px 0 8px; }
    .artifact-status { font-size:.75rem; font-weight:800; }
    .rules { margin-top:28px; background:var(--ink); color:#fff; padding:24px; }
    .rules h3 { margin-top:0; }
    .rules li + li { margin-top:8px; }
    footer { border-top:1px solid var(--line); color:var(--muted); padding:24px 0 38px; font-size:.82rem; }
    [hidden] { display:none !important; }
    @media (max-width: 900px) {
      .masthead-inner, .truth-inner, .route-detail { grid-template-columns:1fr; }
      .truth-copy { border-right:0; padding-right:0; padding-bottom:12px; }
      .truth-inner { grid-template-columns:repeat(2, 1fr); }
      .truth-copy { grid-column:1 / -1; }
      .route-picker, .journeys, .artifacts { grid-template-columns:1fr; }
      .maps { grid-template-columns:1fr; }
    }
    @media (max-width: 620px) {
      .shell { width:min(1240px, calc(100% - 22px)); }
      .masthead-inner { padding:32px 0; gap:26px; }
      .truth-inner { grid-template-columns:1fr 1fr; gap:12px; }
      .metric { padding-left:10px; }
      .warning { display:block; }
      .warning strong { display:block; margin-bottom:4px; }
      .section-heading { display:block; }
      .section-heading p { margin-top:8px; }
      .tabbar { flex-wrap:nowrap; overflow-x:auto; }
      .tab { white-space:nowrap; }
      .workstream-top, .map-heading { display:block; }
      .workstream details { text-align:left; margin-top:12px; }
      .stage-grid { grid-template-columns:repeat(6, 138px); }
      .next-action, .map-lists { grid-template-columns:1fr; }
      .route-guidance { grid-template-columns:1fr; }
      .search { width:100%; margin-left:0; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } }
    @media print {
      .tabbar, .toolbar, .route-picker { display:none; }
      [hidden] { display:block !important; }
      body { background:#fff; }
      .tab-panel { display:block !important; break-before:page; }
      .panel, .workstream, .map-card, .artifact { break-inside:avoid; }
    }
  </style>
</head>
<body data-generated-by="project-progress">
  <a class="skip-link" href="#main">Skip to dashboard</a>
  <header class="masthead">
    <div class="shell masthead-inner">
      <div>
        <p class="eyebrow">Project evidence dashboard · reviewed ${escapeHtml(model.project.reviewedOn)}</p>
        <h1>${escapeHtml(model.project.name)}</h1>
        ${subtitle}
      </div>
      <div class="north-star"><span>North star</span><p>${escapeHtml(model.project.northStar)}</p></div>
    </div>
  </header>
  <section class="truth-band" aria-label="Current position">
    <div class="shell truth-inner">
      <div class="truth-copy"><strong>Honest current position</strong><p>${escapeHtml(model.project.currentTruth)}</p></div>
      <div class="metric"><strong>${totals.closed} / ${totals.total}</strong><span>tracked items closed</span></div>
      <div class="metric"><strong>${implemented} / ${model.workstreams.length}</strong><span>workstreams implemented</span></div>
      <div class="metric"><strong>${validated} / ${model.workstreams.length}</strong><span>workstreams validated</span></div>
      <div class="metric"><strong>${operational} / ${model.workstreams.length}</strong><span>workstreams operational</span></div>
    </div>
  </section>
  <main class="shell" id="main">
    <div class="warning" role="note"><strong>Read the denominator.</strong><span>${totals.closed} of ${totals.total} tracked items closed does not mean the project is ${totals.total ? Math.round((totals.closed / totals.total) * 100) : 0}% built. The delivery evidence stays separated below.</span></div>
    <nav class="tabbar" role="tablist" aria-label="Dashboard views">
      <button class="tab" id="tab-route" type="button" role="tab" aria-selected="true" aria-controls="panel-route" data-tab="route">Route</button>
      <button class="tab" id="tab-workstreams" type="button" role="tab" aria-selected="false" aria-controls="panel-workstreams" data-tab="workstreams">Workstreams</button>
      <button class="tab" id="tab-evidence" type="button" role="tab" aria-selected="false" aria-controls="panel-evidence" data-tab="evidence">Evidence</button>
    </nav>

    <section class="tab-panel" id="panel-route" role="tabpanel" aria-labelledby="tab-route">
      <div class="section-heading"><div><p class="eyebrow">You are here</p><h2>From written intent to working proof</h2></div><p>${nextMilestone ? `The next named boundary is ${escapeHtml(nextMilestone.name)}. ` : ""}The sequence shows evidence gates, not elapsed-time estimates.</p></div>
      <div class="panel"><ol class="milestones">${milestoneHtml}</ol></div>
      <div class="route-area">
        <div class="section-heading"><div><p class="eyebrow">Choose the route</p><h2>Priorities without losing the rest</h2></div><p>Select a route to see its outcome, limits, and smallest ordered steps.</p></div>
        <div class="route-picker" aria-label="Route choices">${routeButtons}</div>
        ${routePanels}
      </div>
      ${model.journeys.length ? `<div class="section-heading" style="margin-top:32px"><div><p class="eyebrow">Nearest end-to-end proof</p><h2>What “working” should mean next</h2></div></div><div class="journeys">${journeyHtml}</div>` : ""}
    </section>

    <section class="tab-panel" id="panel-workstreams" role="tabpanel" aria-labelledby="tab-workstreams" hidden>
      <div class="section-heading"><div><p class="eyebrow">Evidence ladder</p><h2>Progress by workstream</h2></div><p>Every row keeps definition, design, prototype, implementation, validation, and operations separate.</p></div>
      <div class="toolbar">
        <div class="filters" aria-label="Filter workstreams">
          ${["all", "now", "next", "later", "platform"].map((lane) => `<button class="filter" type="button" data-filter="${lane}" aria-pressed="${lane === "all"}">${humanize(lane)}</button>`).join("")}
        </div>
        <label><span class="skip-link">Search workstreams</span><input class="search" id="workstream-search" type="search" placeholder="Search workstreams"></label>
      </div>
      <div class="workstreams" id="workstreams">${workstreamHtml}</div>
      <p class="empty" id="no-workstreams" hidden>No workstreams match this view.</p>
    </section>

    <section class="tab-panel" id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" hidden>
      <div class="section-heading"><div><p class="eyebrow">Source trail</p><h2>Maps, claims, and runnable evidence</h2></div><p>Follow the links to inspect the authoritative detail. A map's scope boundary explains what its ticket count cannot prove.</p></div>
      <div class="maps">${mapHtml}</div>
      ${model.artifacts.length ? `<div class="artifacts">${artifactHtml}</div>` : ""}
      <aside class="rules"><h3>How to read this dashboard</h3><ul>${rulesHtml}</ul></aside>
    </section>
  </main>
  <footer><div class="shell">Generated from <code>docs/project-progress.json</code> and linked repository evidence. Refresh with <code>/project-progress</code> in Claude Code or <code>$project-progress</code> in Codex.</div></footer>
  <script type="application/json" id="dashboard-data">${clientData}</script>
  <script>
    (() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      function activateTab(name, focus = false) {
        tabs.forEach((tab) => {
          const active = tab.dataset.tab === name;
          tab.setAttribute('aria-selected', String(active));
          document.getElementById('panel-' + tab.dataset.tab).hidden = !active;
          if (active && focus) tab.focus();
        });
        history.replaceState(null, '', '#' + name);
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
        tab.addEventListener('keydown', (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let target = index;
          if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
          if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
          if (event.key === 'Home') target = 0;
          if (event.key === 'End') target = tabs.length - 1;
          activateTab(tabs[target].dataset.tab, true);
        });
      });
      const hash = location.hash.slice(1);
      if (tabs.some((tab) => tab.dataset.tab === hash)) activateTab(hash);

      const routeButtons = [...document.querySelectorAll('[data-route]')];
      routeButtons.forEach((button) => button.addEventListener('click', () => {
        routeButtons.forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        document.querySelectorAll('[data-route-panel]').forEach((panel) => {
          panel.hidden = panel.dataset.routePanel !== button.dataset.route;
        });
      }));

      let lane = 'all';
      let query = '';
      const cards = [...document.querySelectorAll('.workstream')];
      const noResults = document.getElementById('no-workstreams');
      function filterCards() {
        let shown = 0;
        cards.forEach((card) => {
          const visible = (lane === 'all' || card.dataset.lane === lane) && card.dataset.search.includes(query);
          card.hidden = !visible;
          if (visible) shown += 1;
        });
        noResults.hidden = shown !== 0;
      }
      document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
        lane = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        filterCards();
      }));
      document.getElementById('workstream-search').addEventListener('input', (event) => {
        query = event.target.value.trim().toLowerCase();
        filterCards();
      });
    })();
  </script>
</body>
</html>\n`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const projectRoot = resolve(args.project || process.cwd());
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) fail(`Project directory not found: ${projectRoot}`);
  const modelAbsolute = insideProject(projectRoot, args.model || "docs/project-progress.json", "model path");
  const outputAbsolute = insideProject(projectRoot, args.output || "docs/project-progress.html", "output path");
  if (!existsSync(modelAbsolute)) fail(`Model not found: ${modelAbsolute}`);
  const model = JSON.parse(readFileSync(modelAbsolute, "utf8"));
  validateModel(model);

  const missing = collectLocalPaths(model).filter((value) => !existsSync(insideProject(projectRoot, value, `evidence path ${value}`)));
  if (missing.length) fail(`Missing local evidence:\n${missing.map((value) => `- ${value}`).join("\n")}`);
  const maps = model.sources.map((source) => source.type === "local-markdown-map"
    ? parseLocalMap(projectRoot, source)
    : parseSnapshot(source));
  const output = renderDashboard(model, maps, projectRoot, outputAbsolute);

  if (args.check) {
    if (!existsSync(outputAbsolute)) fail(`Dashboard is missing: ${outputAbsolute}`);
    const current = readFileSync(outputAbsolute, "utf8");
    if (current !== output) fail("Dashboard is stale. Re-run without --check.");
    if (!current.includes('data-generated-by="project-progress"')) fail("Dashboard marker is missing");
    if (/<script\s+[^>]*src=/i.test(current) || /<link\s+[^>]*rel=["']stylesheet/i.test(current)) {
      fail("Dashboard must not depend on external scripts or stylesheets");
    }
    console.log(`Project progress dashboard is current: ${relative(projectRoot, outputAbsolute)}`);
    return;
  }

  mkdirSync(dirname(outputAbsolute), { recursive: true });
  writeFileSync(outputAbsolute, output, "utf8");
  const total = maps.reduce((value, map) => value + map.counts.total, 0);
  const closed = maps.reduce((value, map) => value + map.counts.closed, 0);
  console.log(`Rendered ${relative(projectRoot, outputAbsolute)} from ${model.sources.length} source(s), ${model.workstreams.length} workstream(s), and ${closed}/${total} closed tracked item(s).`);
}

try {
  run();
} catch (error) {
  console.error(`project-progress: ${error.message}`);
  process.exitCode = 1;
}
